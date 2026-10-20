import { buildEvaluationContext, isEvaluationCategoryAllowed, summarizeSceneMetricGuard, evaluationSceneNotice } from "@class-reflect/shared-types";
import { capabilityMatrixByLessonFormat, type CapabilityMatrix, type EvidenceCategory, type TeachingEvidenceCard } from "@class-reflect/shared-types";
import type { TranscriptSegment } from "@class-reflect/shared-types";
import { tryRunLlmAgent } from "../llm";
import type { AgentResult, TeachingEvidenceInput, TeachingEvidenceOutput } from "../types";
import { isTeachingEvidenceOutput } from "./validator";
import {
  buildClassroomManagementCard,
  buildErrorAnalysisCard,
  buildOralConfirmationCard,
  buildSelfCheckCard,
  buildTeacherSelfAnswerCard,
  buildTechnicalIssueCard,
  buildWaitTimeCard
} from "./cards";
import { buildTeachingEvidenceLlmPayload, resolveMaxEvidenceCards } from "./compact-input";
import { defaultEvidenceCategories } from "./constants";
import { defaultCategoriesForLessonFormat, evidenceProfileByLessonFormat, semanticEvidenceCategoriesForLlm } from "./profiles";
import { inferInstructionalContext, isCategorySupported, meetsMinimumConfidence } from "./helpers";
import { buildSentenceIdMap, restoreMappedSentenceIds } from "../sentence-id-map";

export async function runTeachingEvidenceAgent(
  input: TeachingEvidenceInput
): Promise<AgentResult<TeachingEvidenceOutput>> {
  const scene = buildEvaluationContext(input.sceneLabelConfirmed === false ? null : input.lesson_format,input.transcriptSegments,input.sceneRevision);
  const capabilityMatrix =
    input.capabilityMatrix ||
    capabilityMatrixByLessonFormat[input.lesson_format];

  const enabledCategories =
    input.generationConfig?.enabledCategories ||
    defaultCategoriesForLessonFormat(input.lesson_format);
  const sceneEnabledCategories = enabledCategories.filter(c=>isEvaluationCategoryAllowed(scene,c));
  const profile = evidenceProfileByLessonFormat[input.lesson_format];

  const maxEvidenceCards = resolveMaxEvidenceCards(input);

  const minimumConfidence =
    input.generationConfig?.minimumConfidence || "low";

  const sortedSegments = [...input.transcriptSegments].sort(
    (a, b) => a.startMs - b.startMs
  );
  const sentenceIdMap = buildSentenceIdMap(input.transcriptSegments);

  const instructionalContext =
    inferInstructionalContext(sortedSegments);

  const cards: TeachingEvidenceCard[] = [];

  const skippedCategories: TeachingEvidenceOutput["skippedCategories"] =
    [];

  for (const category of defaultEvidenceCategories) {
    if ((profile.disabledCategories as typeof defaultEvidenceCategories).includes(category)) {
      skippedCategories.push({
        category,
        reason: "not_applicable_to_lesson_format"
      });
    } else if (!sceneEnabledCategories.includes(category)) {
      skippedCategories.push({
        category,
        reason: "category_disabled"
      });
    }
  }

  for (const category of sceneEnabledCategories) {
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
      sceneEnabledCategories.includes(card.category) &&
      isCategorySupported(
        card.category,
        input.lesson_format,
        capabilityMatrix
      )
    ) {
      cards.push({...card,evaluationContext:scene});
    }
  };

  pushCard(buildOralConfirmationCard(input, sortedSegments));
  pushCard(buildWaitTimeCard(input, sortedSegments));
  pushCard(buildTeacherSelfAnswerCard(input, sortedSegments));
  pushCard(buildClassroomManagementCard(input, sortedSegments));
  pushCard(buildTechnicalIssueCard(input, sortedSegments));
  pushCard(buildSelfCheckCard(input, sortedSegments));

  const semanticEnabledCategories = semanticEvidenceCategoriesForLlm(sceneEnabledCategories)
    .filter((category) => isCategorySupported(category, input.lesson_format, capabilityMatrix));
  const llmOutput = semanticEnabledCategories.length
    ? await tryRunLlmAgent<TeachingEvidenceOutput>({
      agentName: "teaching-evidence-agent",
      promptVersion: "teaching-evidence.llm.v1",
      traceId: input.traceId,
      payload: buildTeachingEvidenceLlmPayload({
        ...input,
        generationConfig: {
          language: input.generationConfig?.language || "zh-CN",
          maxEvidenceCards: Math.max(maxEvidenceCards - cards.length, 0),
          minimumConfidence,
          enabledCategories: semanticEnabledCategories
        }
      }),
      validate: isTeachingEvidenceOutput
    })
    : null;

  if (llmOutput) {
    const restoredCards = llmOutput.evidenceCards.map((card) => ({
      ...card,
      transcriptSegmentIds: restoreMappedSentenceIds(card.transcriptSegmentIds, sentenceIdMap)
    }));
    for (const card of filterLlmEvidenceCards(
      resolveEvidenceCardTiming(restoredCards, input.transcriptSegments),
      {
        lessonFormat: input.lesson_format,
        enabledCategories: semanticEnabledCategories,
        positiveCategories: profile.positiveCategories,
        negativeCategories: profile.negativeCategories,
        capabilityMatrix,
        existingCards: cards
      }
    )) {
      pushCard(card);
    }
  } else {
    pushCard(
      buildErrorAnalysisCard(
        input,
        sortedSegments,
        instructionalContext
      )
    );
  }

  return {
    output: {
      sceneMetricGuard:summarizeSceneMetricGuard(scene,llmOutput?.evidenceCards.map(c=>c.category)||[],cards.map(c=>c.category)),
      evaluationContext: scene,
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
    promptVersion: llmOutput ? "teaching-evidence.hybrid.v1" : "teaching-evidence.rule-based.v0.2",
    warnings: llmOutput ? (scene.requiresReview ? [evaluationSceneNotice(scene), ...scene.reviewReasons] : []) : [
      "LLM 未返回有效结果，已使用规则证据生成器"
    ]
  };
}

function filterLlmEvidenceCards(
  cards: TeachingEvidenceCard[],
  context: {
    lessonFormat: TeachingEvidenceInput["lesson_format"];
    enabledCategories: EvidenceCategory[];
    positiveCategories: EvidenceCategory[];
    negativeCategories: EvidenceCategory[];
    capabilityMatrix: CapabilityMatrix;
    existingCards: TeachingEvidenceCard[];
  }
): TeachingEvidenceCard[] {
  const enabled = new Set(context.enabledCategories || []);
  const positive = new Set(context.positiveCategories || []);
  const negative = new Set(context.negativeCategories || []);
  const accepted: TeachingEvidenceCard[] = [];

  for (const card of cards) {
    if (!enabled.has(card.category)) continue;
    if (!isCategorySupported(card.category, context.lessonFormat, context.capabilityMatrix)) continue;
    if (card.sentiment === "negative" && !negative.has(card.category)) continue;
    if (card.sentiment === "positive" && positive.size > 0 && !positive.has(card.category) && !negative.has(card.category)) continue;
    if (isDuplicateEvidenceCard(card, [...context.existingCards, ...accepted])) continue;
    accepted.push(card);
  }

  return accepted;
}

function isDuplicateEvidenceCard(card: TeachingEvidenceCard, existingCards: TeachingEvidenceCard[]) {
  const cardIds = new Set(card.transcriptSegmentIds);
  if (!cardIds.size) return false;
  return existingCards.some((existing) => {
    if (existing.category !== card.category) return false;
    if (existing.sentiment !== card.sentiment) return false;
    const existingIds = new Set(existing.transcriptSegmentIds);
    const overlap = [...cardIds].filter((id) => existingIds.has(id)).length;
    return overlap > 0 && overlap / Math.min(cardIds.size, existingIds.size || 1) >= 0.8;
  });
}

function resolveEvidenceCardTiming(
  cards: TeachingEvidenceCard[],
  transcriptSegments: TranscriptSegment[]
): TeachingEvidenceCard[] {
  const byId = new Map(transcriptSegments.map((segment) => [segment.id, segment]));
  return cards.map((card) => {
    const segments = card.transcriptSegmentIds.map((id) => byId.get(id));
    if (!segments.length || segments.some((segment) => !segment)) return card;
    return {
      ...card,
      startMs: Math.min(...segments.map((segment) => segment!.startMs)),
      endMs: Math.max(...segments.map((segment) => segment!.endMs))
    };
  });
}
