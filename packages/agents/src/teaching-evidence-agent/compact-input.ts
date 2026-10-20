import { filterSceneMetrics, buildEvaluationContext, isEvaluationCategoryAllowed, interactionEvidenceCategories, type EvaluationContext } from "@class-reflect/shared-types";
import { type ClassroomEvent, type ClassroomMetric, type EvidenceCategory, type TranscriptDeliveryFeatures, type TranscriptSegment } from "@class-reflect/shared-types";
import { buildTeachingEvidenceOutputInstruction } from "./prompt";
import { evidenceProfileByLessonFormat, semanticEvidenceCategoriesForLlm } from "./profiles";
import type { TeachingEvidenceInput } from "../types";
import { buildSentenceIdMap, type SentenceIdMap } from "../sentence-id-map";

type SpeakerCode = "T" | "S" | "G" | "M" | "U";
type DeliveryFeatureFlag = "question" | "instruction" | "answer" | "feedback";
type DeliveryFeatureTag =
  | DeliveryFeatureFlag;
type CompactDeliveryFeatures = [id: string, tags: DeliveryFeatureTag[]];

export type TeachingEvidenceCompactPayload = {
  instruction: string;
  scene_type: EvaluationContext["sceneType"];
  evaluation_scope: EvaluationContext["evaluationScope"];
  scene_cross_check: EvaluationContext;
  lessonId: string;
  lesson_format: TeachingEvidenceInput["lesson_format"];
  ap: {
    p: EvidenceCategory[];
    x: EvidenceCategory[];
    pos: EvidenceCategory[];
    neg: EvidenceCategory[];
    mp: number;
    mn: number;
  };
  sp: Record<SpeakerCode, "teacher" | "student" | "students" | "multiple" | "unknown">;
  t: Array<[id: string, speaker: SpeakerCode, text: string, confidence: number | null]>;
  f: CompactDeliveryFeatures[];
  m: Array<[id: string, name: string, value: number, unit: string | null]>;
  e: Array<[id: string, type: string, sentenceIds: string[], confidence: string | null]>;
  raw: Array<[id: string, text: string]>;
  generationConfig: TeachingEvidenceInput["generationConfig"];
};

export function buildTeachingEvidenceLlmPayload(input: TeachingEvidenceInput): TeachingEvidenceCompactPayload {
  const profile = evidenceProfileByLessonFormat[input.lesson_format];
  const scene = buildEvaluationContext(input.sceneLabelConfirmed === false ? null : input.lesson_format,input.transcriptSegments,input.sceneRevision);
  const maxEvidenceCards = resolveMaxEvidenceCards(input);
  const enabledCategories = input.generationConfig?.enabledCategories
    ? semanticEvidenceCategoriesForLlm(input.generationConfig.enabledCategories)
    : semanticEvidenceCategoriesForLlm(profile.priorityCategories);
  const enabledSet = new Set(enabledCategories.filter(c=>isEvaluationCategoryAllowed(scene,c)));
  const sentenceIdMap = buildSentenceIdMap(input.transcriptSegments);
  return {
    instruction: buildTeachingEvidenceOutputInstruction(input.lesson_format),
    scene_type: scene.sceneType, evaluation_scope: scene.evaluationScope, scene_cross_check: scene,
    lessonId: input.lessonId,
    lesson_format: input.lesson_format,
    ap: {
      p: profile.priorityCategories.filter((category) => enabledSet.has(category)),
      x: [...new Set([...profile.disabledCategories,...(scene.interactionEnabled?[]:interactionEvidenceCategories)])],
      pos: profile.positiveCategories.filter((category) => enabledSet.has(category)),
      neg: profile.negativeCategories.filter((category) => enabledSet.has(category)),
      mp: resolveSentimentLimit(profile.maxPositiveCards, maxEvidenceCards, 0.4),
      mn: resolveSentimentLimit(profile.maxNegativeCards, maxEvidenceCards, 0.7)
    },
    sp: { T: "teacher", S: "student", G: "students", M: "multiple", U: "unknown" },
    t: input.transcriptSegments.map((segment) => compactTranscriptSegment(segment, sentenceIdMap)),
    f: input.transcriptSegments.flatMap((segment) => compactDeliveryFeatures(segment, sentenceIdMap)),
    m: filterSceneMetrics(scene,input.metrics).map(compactMetric),
    e: (scene.interactionEnabled ? input.classroomEvents || [] : []).map((event) => compactClassroomEvent(event, sentenceIdMap)),
    raw: selectRawExcerpts(input.transcriptSegments, input.classroomEvents || [], sentenceIdMap),
    generationConfig: {
      ...(input.generationConfig || { language: "zh-CN" }),
      maxEvidenceCards,
      enabledCategories: enabledCategories.filter(c=>enabledSet.has(c))
    }
  };
}

export function resolveMaxEvidenceCards(input: Pick<TeachingEvidenceInput, "generationConfig" | "transcriptSegments">) {
  if (input.generationConfig?.maxEvidenceCards) return input.generationConfig.maxEvidenceCards;
  const durationMs = transcriptDurationMs(input.transcriptSegments);
  const durationMinutes = durationMs / 60_000;
  if (!durationMinutes) return 6;
  return Math.min(40, Math.max(6, Math.ceil(durationMinutes / 15) * 4));
}

function resolveSentimentLimit(profileLimit: number, maxEvidenceCards: number, ratio: number) {
  if (maxEvidenceCards <= 6) return profileLimit;
  return Math.min(maxEvidenceCards, Math.max(profileLimit, Math.ceil(maxEvidenceCards * ratio)));
}

function transcriptDurationMs(segments: TranscriptSegment[]) {
  if (!segments.length) return 0;
  const startMs = Math.min(...segments.map((segment) => segment.startMs));
  const endMs = Math.max(...segments.map((segment) => segment.endMs));
  return Math.max(0, endMs - startMs);
}

function compactTranscriptSegment(segment: TranscriptSegment, sentenceIdMap: SentenceIdMap): TeachingEvidenceCompactPayload["t"][number] {
  return [
    sentenceIdMap.toShortId(segment.id),
    speakerCode(segment.speakerLabel),
    segment.text,
    segment.confidence ?? null
  ];
}

function compactDeliveryFeatures(segment: TranscriptSegment, sentenceIdMap: SentenceIdMap): CompactDeliveryFeatures[] {
  const features = segment.deliveryFeatures;
  if (!features) return [];
  const tags = deliveryFeatureTags(features);
  if (!tags.length) return [];
  return [[sentenceIdMap.toShortId(segment.id), tags]];
}

function deliveryFeatureTags(features: TranscriptDeliveryFeatures): DeliveryFeatureTag[] {
  const tags: DeliveryFeatureTag[] = [];
  if (features.possibleQuestion) tags.push("question");
  if (features.possibleInstruction) tags.push("instruction");
  if (features.possibleAnswer) tags.push("answer");
  if (features.possibleFeedback) tags.push("feedback");
  return tags;
}

function compactMetric(metric: ClassroomMetric): TeachingEvidenceCompactPayload["m"][number] {
  return [metric.id, metric.name, metric.value, metric.unit || null];
}

function compactClassroomEvent(event: ClassroomEvent, sentenceIdMap: SentenceIdMap): TeachingEvidenceCompactPayload["e"][number] {
  return [
    event.id,
    event.type,
    (event.transcriptSegmentIds || []).map((id) => sentenceIdMap.toShortId(id)),
    event.confidenceLabel || null
  ];
}

function selectRawExcerpts(
  segments: TranscriptSegment[],
  events: ClassroomEvent[],
  sentenceIdMap: SentenceIdMap
): TeachingEvidenceCompactPayload["raw"] {
  const selectedIds = new Set(events.flatMap((event) => event.transcriptSegmentIds || []));
  const selected = segments.filter((segment) => selectedIds.has(segment.id)).slice(0, 20);
  if (selected.length) return selected.map((segment) => [sentenceIdMap.toShortId(segment.id), segment.text]);
  return segments.slice(0, 8).map((segment) => [sentenceIdMap.toShortId(segment.id), segment.text]);
}

function speakerCode(label: string | null | undefined): SpeakerCode {
  if (/教师|老师|teacher/i.test(label || "")) return "T";
  if (/全班|齐答/.test(label || "")) return "G";
  if (/多人/.test(label || "")) return "M";
  if (/学生/.test(label || "")) return "S";
  return "U";
}
