import { capabilityMatrixByLessonFormat, type ClassroomEvent, type ClassroomMetric, type TranscriptSegment } from "@class-reflect/shared-types";
import { teachingEvidenceOutputInstruction } from "./prompt";
import type { TeachingEvidenceInput } from "../types";

type SpeakerCode = "T" | "S" | "G" | "M" | "U";

export type TeachingEvidenceCompactPayload = {
  instruction: string;
  lessonId: string;
  lesson_format: TeachingEvidenceInput["lesson_format"];
  capabilityMatrix: NonNullable<TeachingEvidenceInput["capabilityMatrix"]>;
  sp: Record<SpeakerCode, "teacher" | "student" | "students" | "multiple" | "unknown">;
  t: Array<[id: string, startMs: number, endMs: number, speaker: SpeakerCode, text: string, confidence: number | null]>;
  m: Array<[id: string, name: string, value: number, unit: string | null]>;
  e: Array<[id: string, type: string, startMs: number, endMs: number, sentenceIds: string[], confidence: string | null]>;
  raw: Array<[id: string, text: string]>;
  generationConfig: TeachingEvidenceInput["generationConfig"];
};

export function buildTeachingEvidenceLlmPayload(input: TeachingEvidenceInput): TeachingEvidenceCompactPayload {
  return {
    instruction: teachingEvidenceOutputInstruction,
    lessonId: input.lessonId,
    lesson_format: input.lesson_format,
    capabilityMatrix: input.capabilityMatrix || capabilityMatrixByLessonFormat[input.lesson_format],
    sp: { T: "teacher", S: "student", G: "students", M: "multiple", U: "unknown" },
    t: input.transcriptSegments.map(compactTranscriptSegment),
    m: input.metrics.map(compactMetric),
    e: (input.classroomEvents || []).map(compactClassroomEvent),
    raw: selectRawExcerpts(input.transcriptSegments, input.classroomEvents || []),
    generationConfig: input.generationConfig || { language: "zh-CN" }
  };
}

function compactTranscriptSegment(segment: TranscriptSegment): TeachingEvidenceCompactPayload["t"][number] {
  return [
    segment.id,
    segment.startMs,
    segment.endMs,
    speakerCode(segment.speakerLabel),
    segment.text,
    segment.confidence ?? null
  ];
}

function compactMetric(metric: ClassroomMetric): TeachingEvidenceCompactPayload["m"][number] {
  return [metric.id, metric.name, metric.value, metric.unit || null];
}

function compactClassroomEvent(event: ClassroomEvent): TeachingEvidenceCompactPayload["e"][number] {
  return [
    event.id,
    event.type,
    event.startMs,
    event.endMs,
    event.transcriptSegmentIds || [],
    event.confidenceLabel || null
  ];
}

function selectRawExcerpts(
  segments: TranscriptSegment[],
  events: ClassroomEvent[]
): TeachingEvidenceCompactPayload["raw"] {
  const selectedIds = new Set(events.flatMap((event) => event.transcriptSegmentIds || []));
  const selected = segments.filter((segment) => selectedIds.has(segment.id)).slice(0, 20);
  if (selected.length) return selected.map((segment) => [segment.id, segment.text]);
  return segments.slice(0, 8).map((segment) => [segment.id, segment.text]);
}

function speakerCode(label: string | null | undefined): SpeakerCode {
  if (/教师|老师|teacher/i.test(label || "")) return "T";
  if (/全班|齐答/.test(label || "")) return "G";
  if (/多人/.test(label || "")) return "M";
  if (/学生/.test(label || "")) return "S";
  return "U";
}
