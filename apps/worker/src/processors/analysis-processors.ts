import { runTeachingEvidenceAgent, runTranscriptNormalizer } from "@class-reflect/agents";
import {
  getTeachingEvidenceSource,
  saveTeachingEvidenceCards
} from "@class-reflect/database";
import { assertEvidenceHasSource, validateTeachingEvidenceCard } from "@class-reflect/guardrails";
import { calculateSpeechRate } from "@class-reflect/metrics";
import { capabilityMatrixByLessonFormat } from "@class-reflect/shared-types";
import type { ProcessorResult, WorkflowProcessor } from "./types";

export const normalizeTranscriptProcessor: WorkflowProcessor = {
  stepKey: "normalize_transcript",
  async run(): Promise<ProcessorResult> {
    const result = runTranscriptNormalizer([]);
    return {
      output: {
        promptVersion: result.promptVersion,
        normalizedSegmentCount: result.output.length
      },
      warnings: result.warnings
    };
  }
};

export const buildSectionsProcessor: WorkflowProcessor = {
  stepKey: "build_sections",
  async run(): Promise<ProcessorResult> {
    throw new Error("build_sections processor not implemented: 需要 lesson_sections repository");
  }
};

export const calculateMetricsProcessor: WorkflowProcessor = {
  stepKey: "calculate_metrics",
  async run(): Promise<ProcessorResult> {
    const speechRate = calculateSpeechRate([]);
    return { output: { speechRate } };
  }
};

export const detectEventsProcessor: WorkflowProcessor = {
  stepKey: "detect_events",
  async run(): Promise<ProcessorResult> {
    throw new Error("detect_events processor not implemented: 需要课堂事件 Agent 和事件 repository");
  }
};

export const generateEvidenceProcessor: WorkflowProcessor = {
  stepKey: "generate_evidence",
  async run(context): Promise<ProcessorResult> {
    const source = await getTeachingEvidenceSource({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId
    });
    if (!source) throw new Error(`课堂记录不存在：${context.workflow.lessonId}`);
    if (!source.transcriptSegments.length) {
      throw new Error("还没有可用于生成教学证据的逐字稿");
    }

    const result = runTeachingEvidenceAgent({
      lessonId: source.lesson.id,
      lesson_format: source.lesson.lessonFormat,
      capabilityMatrix: capabilityMatrixByLessonFormat[source.lesson.lessonFormat],
      transcriptSegments: source.transcriptSegments,
      metrics: source.metrics,
      classroomEvents: [],
      generationConfig: {
        language: "zh-CN",
        maxEvidenceCards: 6,
        minimumConfidence: "low"
      }
    });

    const validCards = result.output.evidenceCards.filter((card) =>
      validateTeachingEvidenceCard({ lesson_format: source.lesson.lessonFormat, card }).valid
    );
    const savedCards = await saveTeachingEvidenceCards({
      lessonId: source.lesson.id,
      videoId: context.workflow.videoId,
      cards: validCards,
      sourceModel: result.promptVersion
    });

    return {
      output: {
        promptVersion: result.promptVersion,
        instructionalContext: result.output.instructionalContext,
        generatedEvidenceCount: result.output.evidenceCards.length,
        validEvidenceCount: validCards.length,
        savedEvidenceCount: savedCards.length,
        skippedCategories: result.output.skippedCategories,
        generationSummary: result.output.generationSummary
      },
      warnings: result.warnings
    };
  }
};

export const validateEvidenceProcessor: WorkflowProcessor = {
  stepKey: "validate_evidence",
  async run(): Promise<ProcessorResult> {
    const validation = assertEvidenceHasSource({ sources: [] });
    if (!validation.valid) {
      return {
        output: { validEvidenceCount: 0, rejectedReason: validation.reason },
        warnings: ["no_evidence_to_validate"]
      };
    }
    return { output: { validEvidenceCount: 1 } };
  }
};
