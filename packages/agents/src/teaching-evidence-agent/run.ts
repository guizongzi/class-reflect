import { capabilityMatrixByLessonFormat, type TeachingEvidenceCard } from "@class-reflect/shared-types";
import { tryRunLlmAgent } from "../llm";
import { teachingEvidenceOutputInstruction } from "./prompt";
import type { AgentResult, TeachingEvidenceInput, TeachingEvidenceOutput } from "../types";
import { isTeachingEvidenceOutput } from "./validator";
import {
  buildClassroomManagementCard,
  buildErrorAnalysisCard,
  buildOralConfirmationCard,
  buildTeacherSelfAnswerCard,
  buildTechnicalIssueCard
} from "./cards";
import { defaultEvidenceCategories } from "./constants";
import { inferInstructionalContext, isCategorySupported, meetsMinimumConfidence } from "./helpers";

export async function runTeachingEvidenceAgent(
  input: TeachingEvidenceInput
): Promise<AgentResult<TeachingEvidenceOutput>> {
  const llmOutput = await tryRunLlmAgent<TeachingEvidenceOutput>({
    agentName: "teaching-evidence-agent",
    promptVersion: "teaching-evidence.llm.v1",
    traceId: input.traceId,
    payload: {
      instruction: teachingEvidenceOutputInstruction,

      lessonId: input.lessonId,
      lesson_format: input.lesson_format,
      lessonFormat: input.lesson_format,

      capabilityMatrix:
        input.capabilityMatrix ||
        capabilityMatrixByLessonFormat[input.lesson_format],

      transcriptSegments: input.transcriptSegments,
      metrics: input.metrics,
      classroomEvents: input.classroomEvents || [],

      generationConfig:
        input.generationConfig || {
          language: "zh-CN"
        }
    },
    validate: isTeachingEvidenceOutput
  });

  if (llmOutput) {
    return {
      output: llmOutput,
      promptVersion: "teaching-evidence.llm.v1",
      warnings: []
    };
  }

    const capabilityMatrix =
    input.capabilityMatrix ||
    capabilityMatrixByLessonFormat[input.lesson_format];

  const enabledCategories =
    input.generationConfig?.enabledCategories ||
    defaultEvidenceCategories;

  const maxEvidenceCards =
    input.generationConfig?.maxEvidenceCards || 6;

  const minimumConfidence =
    input.generationConfig?.minimumConfidence || "low";

  const sortedSegments = [...input.transcriptSegments].sort(
    (a, b) => a.startMs - b.startMs
  );

  const instructionalContext =
    inferInstructionalContext(sortedSegments);

  const cards: TeachingEvidenceCard[] = [];

  const skippedCategories: TeachingEvidenceOutput["skippedCategories"] =
    [];

  for (const category of defaultEvidenceCategories) {
    if (!enabledCategories.includes(category)) {
      skippedCategories.push({
        category,
        reason: "category_disabled"
      });
    }
  }

  for (const category of enabledCategories) {
    if (
      !isCategorySupported(
        category,
        input.lesson_format,
        capabilityMatrix
      )
    ) {
      skippedCategories.push({
        category,
        reason:
          input.lesson_format === "recorded_online_class"
            ? "not_applicable_to_lesson_format"
            : "capability_not_supported"
      });
    }
  }

  const pushCard = (card: TeachingEvidenceCard | null) => {
    if (!card) return;
    if (cards.length >= maxEvidenceCards) return;
    if (!meetsMinimumConfidence(card.confidence, minimumConfidence)) {
      return;
    }

    if (
      enabledCategories.includes(card.category) &&
      isCategorySupported(
        card.category,
        input.lesson_format,
        capabilityMatrix
      )
    ) {
      cards.push(card);
    }
  };

  pushCard(buildOralConfirmationCard(input, sortedSegments));
  pushCard(buildTeacherSelfAnswerCard(input, sortedSegments));
  pushCard(buildClassroomManagementCard(input, sortedSegments));
  pushCard(buildTechnicalIssueCard(input, sortedSegments));
  pushCard(
    buildErrorAnalysisCard(
      input,
      sortedSegments,
      instructionalContext
    )
  );

  return {
    output: {
      lessonId: input.lessonId,
      lesson_format: input.lesson_format,
      instructionalContext,
      evidenceCards: cards,
      skippedCategories,
      generationSummary: {
        analyzedTranscriptSegmentCount:
          input.transcriptSegments.length,
        analyzedMetricCount: input.metrics.length,
        generatedEvidenceCount: cards.length
      }
    },
    promptVersion: "teaching-evidence.rule-based.v0.1",
    warnings: [
      "LLM 未返回有效结果，已回退到规则引擎"
    ]
  };
}
