import { createHash } from "node:crypto";
import type { PersistTranscriptSegmentInput } from "./index";

export type SpeakerRole = "teacher" | "student" | "students" | "multiple" | "unknown";
export type SpeakerSource = "deterministic" | "teacher";
export type TimingPrecision = "exact" | "estimated" | "merged" | "split" | "unknown";

export type SpeakerIdentity = {
  id: string;
  role: SpeakerRole;
  rawSpeakerIds: string[];
  displayLabel: string;
  confidence: number;
  source: SpeakerSource;
  locked: boolean;
};

export type SpeakerRegistry = {
  identities: SpeakerIdentity[];
  resolveRawSpeaker: (rawSpeakerId: string | number | null | undefined) => SpeakerIdentity | undefined;
};

export type ReconstructedSentence = {
  id: string;
  startMs: number;
  endMs: number;
  timingPrecision: TimingPrecision;
  sourceSegmentIds: string[];
  rawText: string;
  rawSpeakerIds: string[];
  speakerLabel: string;
  speakerIdentity: SpeakerIdentity;
  deliveryFeatures: {
    fillerWordCount: number;
    fillerWords: string[];
    repetitionCount: number;
    selfCorrectionCount: number;
    incompleteUtterance: boolean;
    possibleQuestion: boolean;
    possibleInstruction: boolean;
    possibleAnswer: boolean;
    possibleFeedback: boolean;
    pauseBeforeMs: number | null;
    pauseAfterMs: number | null;
    speakerTurnChanged: boolean;
  };
  requiresReview: boolean;
  reviewReason: string | null;
};

export type SentenceMapping = {
  sourceSegmentIds: string[];
  sentenceIds: string[];
  relation: "same" | "split" | "merged";
};

export type ReconstructionResult = {
  sentences: ReconstructedSentence[];
  speakerRegistry: SpeakerRegistry;
  sentenceMappings: SentenceMapping[];
};

export type ReconstructionOptions = {
  lessonId: string;
  videoId?: string;
  longPauseMs?: number;
  teacherOverrides?: Record<string, string>;
};

type WorkSegment = PersistTranscriptSegmentInput & {
  id: string;
  rawSpeakerId: string | null;
  speakerLabel: string;
};

type SentenceDraft = {
  startMs: number;
  endMs: number;
  rawText: string;
  sourceSegmentIds: string[];
  rawSpeakerIds: string[];
  speakerLabel: string;
  timingPrecision: TimingPrecision;
  requiresReview: boolean;
  reviewReason: string | null;
};

export function buildLessonSpeakerRegistry(
  segments: PersistTranscriptSegmentInput[],
  options: { lessonId: string; teacherOverrides?: Record<string, string> }
): SpeakerRegistry {
  const normalized = normalizeSegments(segments);
  const rawIds = unique(normalized.map((segment) => segment.rawSpeakerId ?? "unknown"));
  const identities: SpeakerIdentity[] = [];
  let studentIndex = 0;

  for (const rawId of rawIds) {
    const samples = normalized.filter((segment) => (segment.rawSpeakerId ?? "unknown") === rawId);
    const override = rawId !== "unknown" ? options.teacherOverrides?.[rawId] : undefined;
    if (override) {
      identities.push({
        id: override,
        role: "teacher",
        rawSpeakerIds: [rawId],
        displayLabel: "教师",
        confidence: 1,
        source: "teacher",
        locked: true
      });
      continue;
    }
    const role = inferSpeakerRole(samples);
    const id = identityIdForRole(options.lessonId, role, rawId, studentIndex);
    const identity: SpeakerIdentity = {
      id,
      role,
      rawSpeakerIds: rawId === "unknown" ? [] : [rawId],
      displayLabel: displayLabelForRole(role, studentIndex),
      confidence: role === "unknown" ? 0.25 : role === "student" ? 0.7 : 0.85,
      source: "deterministic",
      locked: false
    };
    identities.push(identity);
    if (role === "student") studentIndex += 1;
  }

  const byRawId = new Map<string, SpeakerIdentity>();
  for (const identity of identities) {
    if (!identity.rawSpeakerIds.length && identity.role === "unknown") byRawId.set("unknown", identity);
    for (const rawId of identity.rawSpeakerIds) byRawId.set(rawId, identity);
  }
  return {
    identities,
    resolveRawSpeaker(rawSpeakerId) {
      return byRawId.get(normalizeRawSpeakerId(rawSpeakerId) ?? "unknown") || byRawId.get("unknown");
    }
  };
}

export function reconstructTranscriptSentences(
  segments: PersistTranscriptSegmentInput[],
  options: ReconstructionOptions
): ReconstructionResult {
  const normalized = normalizeSegments(segments).sort((a, b) => a.startMs - b.startMs);
  const speakerRegistry = buildLessonSpeakerRegistry(segments, options);
  const drafts: SentenceDraft[] = [];
  const longPauseMs = options.longPauseMs ?? 3000;

  for (const segment of normalized) {
    const previous = drafts[drafts.length - 1];
    const previousRawSpeakerId = previous?.rawSpeakerIds[previous.rawSpeakerIds.length - 1] ?? null;
    const sameSpeaker = previous && previousRawSpeakerId === (segment.rawSpeakerId ?? "unknown");
    const gapMs = previous ? Math.max(segment.startMs - previous.endMs, 0) : 0;
    const parts = splitSegmentText(segment.text);

    if (
      previous &&
      sameSpeaker &&
      parts.length === 1 &&
      shouldMergeWithPrevious(previous, segment, gapMs, longPauseMs)
    ) {
      previous.rawText = joinSentenceText(previous.rawText, parts[0]);
      previous.endMs = segment.endMs;
      previous.sourceSegmentIds.push(segment.id);
      previous.rawSpeakerIds = unique([...previous.rawSpeakerIds, segment.rawSpeakerId ?? "unknown"]);
      previous.timingPrecision = "merged";
      previous.requiresReview = previous.requiresReview || isBoundaryUncertain(previous.rawText);
      previous.reviewReason = previous.requiresReview ? previous.reviewReason || "boundary_uncertain" : null;
      continue;
    }

    const duration = Math.max(segment.endMs - segment.startMs, 1);
    parts.forEach((part, index) => {
      const startMs = parts.length === 1 ? segment.startMs : segment.startMs + Math.round((duration * index) / parts.length);
      const endMs = parts.length === 1 ? segment.endMs : segment.startMs + Math.round((duration * (index + 1)) / parts.length);
      const requiresReview = isBoundaryUncertain(part);
      const timingPrecision: TimingPrecision = parts.length === 1 && !requiresReview ? "exact" : "estimated";
      drafts.push({
        startMs,
        endMs,
        rawText: part,
        sourceSegmentIds: [segment.id],
        rawSpeakerIds: [segment.rawSpeakerId ?? "unknown"],
        speakerLabel: segment.speakerLabel,
        timingPrecision,
        requiresReview,
        reviewReason: requiresReview ? "boundary_uncertain" : null
      });
    });

    if (gapMs >= longPauseMs && drafts.length > 1) {
      drafts[drafts.length - parts.length].requiresReview ||= false;
    }
  }

  const sentences = drafts.map((draft, index) => {
    const previous = drafts[index - 1];
    const next = drafts[index + 1];
    const rawSpeakerId = draft.rawSpeakerIds[0] ?? "unknown";
    const identity = speakerRegistry.resolveRawSpeaker(rawSpeakerId) || speakerRegistry.identities.find((item) => item.role === "unknown")!;
    const pauseBeforeMs = previous ? Math.max(draft.startMs - previous.endMs, 0) : null;
    const pauseAfterMs = next ? Math.max(next.startMs - draft.endMs, 0) : null;
    return {
      id: stableSentenceId(options.lessonId, options.videoId || "", draft.sourceSegmentIds, draft.rawText, index),
      startMs: draft.startMs,
      endMs: draft.endMs,
      timingPrecision: draft.timingPrecision,
      sourceSegmentIds: draft.sourceSegmentIds,
      rawText: draft.rawText,
      rawSpeakerIds: draft.rawSpeakerIds,
      speakerLabel: identity.displayLabel,
      speakerIdentity: identity,
      deliveryFeatures: inferDeliveryFeatures(draft, previous, pauseBeforeMs, pauseAfterMs),
      requiresReview: draft.requiresReview,
      reviewReason: draft.reviewReason
    };
  });

  return {
    sentences,
    speakerRegistry,
    sentenceMappings: buildSentenceMappings(sentences)
  };
}

function normalizeSegments(segments: PersistTranscriptSegmentInput[]): WorkSegment[] {
  return segments.map((segment, index) => ({
    ...segment,
    id: String((segment.sourceMeta?.id as string | undefined) || `seg-${index}`),
    rawSpeakerId: normalizeRawSpeakerId(segment.speakerId ?? segment.speakerLabel),
    speakerLabel: segment.speakerLabel || formatSpeakerLabel(segment.speakerId)
  }));
}

function normalizeRawSpeakerId(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  return String(value);
}

function inferSpeakerRole(samples: WorkSegment[]): SpeakerRole {
  const labels = samples.map((segment) => segment.speakerLabel).join(" ");
  const text = samples.map((segment) => segment.text).join(" ");
  if (!samples[0]?.rawSpeakerId) return "unknown";
  if (/全班|齐答/.test(labels) || /^(懂了|会了|明白了|对|是|不是|好)[。！!？?]?$/.test(text.trim())) return "students";
  if (/多人|重叠|overlap/i.test(labels)) return "multiple";
  if (/教师|老师|teacher/i.test(labels) || /请大家|同学们|我们来看|回答|为什么|怎么|很好|不错|总结/.test(text)) return "teacher";
  if (/学生/.test(labels) || /我觉得|答案|因为|我认为/.test(text)) return "student";
  return "unknown";
}

function identityIdForRole(lessonId: string, role: SpeakerRole, rawId: string, studentIndex: number) {
  if (role === "teacher") return `spk_${shortHash(lessonId)}_teacher_1`;
  if (role === "students") return `spk_${shortHash(lessonId)}_students`;
  if (role === "multiple") return `spk_${shortHash(lessonId)}_multiple`;
  if (role === "student") return `spk_${shortHash(lessonId)}_student_${studentIndex + 1}`;
  return `spk_${shortHash(lessonId)}_unknown_${shortHash(rawId)}`;
}

function displayLabelForRole(role: SpeakerRole, studentIndex: number) {
  if (role === "teacher") return "教师";
  if (role === "students") return "全班";
  if (role === "multiple") return "多人";
  if (role === "student") return `学生 ${String.fromCharCode(65 + studentIndex)}`;
  return "未知";
}

function splitSegmentText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const matches = normalized.match(/[^。！？!?]+[。！？!?]?/g) || [normalized];
  return matches.map((part) => part.trim()).filter(Boolean);
}

function shouldMergeWithPrevious(previous: SentenceDraft, segment: WorkSegment, gapMs: number, longPauseMs: number) {
  if (gapMs >= longPauseMs) return false;
  if (/[。！？!?]$/.test(previous.rawText)) return false;
  if (previous.rawText.length > 80) return false;
  if (/^(是|为|等于|因为|所以|和|与|的|了|CO|[A-Za-z0-9])/.test(segment.text.trim())) return true;
  return !/[？?]$/.test(previous.rawText) && segment.text.length < 20;
}

function joinSentenceText(left: string, right: string) {
  if (/[A-Za-z0-9]$/.test(left) || /^[A-Za-z0-9]/.test(right)) return `${left}${right}`;
  return `${left}${right}`;
}

function isBoundaryUncertain(text: string) {
  return !/[。！？!?]$/.test(text) || text.length <= 2 || /^(因为|所以|但是|然后|这个|那个)$/.test(text);
}

function inferDeliveryFeatures(draft: SentenceDraft, previous: SentenceDraft | undefined, pauseBeforeMs: number | null, pauseAfterMs: number | null) {
  const text = draft.rawText;
  const fillerWords = [...text.matchAll(/嗯|呃|额|这个|那个|呢/g)].map((match) => match[0]);
  return {
    fillerWordCount: fillerWords.length,
    fillerWords,
    repetitionCount: [...text.matchAll(/([\u4e00-\u9fa5A-Za-z0-9]{1,4})[，,、]?\1/g)].length,
    selfCorrectionCount: /不对|不是|应该是|我改一下/.test(text) ? 1 : 0,
    incompleteUtterance: !/[。！？!?]$/.test(text),
    possibleQuestion: /[？?]|为什么|怎么|谁来说|哪|几/.test(text),
    possibleInstruction: /请|先|接下来|开始|观察|回答|打开|完成/.test(text),
    possibleAnswer: /^(懂了|会了|对|不是|我|答案|因为)/.test(text.replace(/\s+/g, "")),
    possibleFeedback: /很好|不错|对了|再想想/.test(text),
    pauseBeforeMs,
    pauseAfterMs,
    speakerTurnChanged: previous ? previous.rawSpeakerIds[0] !== draft.rawSpeakerIds[0] : false
  };
}

function buildSentenceMappings(sentences: ReconstructedSentence[]): SentenceMapping[] {
  const bySource = new Map<string, ReconstructedSentence[]>();
  for (const sentence of sentences) {
    for (const sourceId of sentence.sourceSegmentIds) {
      const current = bySource.get(sourceId) || [];
      current.push(sentence);
      bySource.set(sourceId, current);
    }
  }
  return [...bySource.entries()].map(([sourceId, mapped]) => ({
    sourceSegmentIds: [sourceId],
    sentenceIds: unique(mapped.map((sentence) => sentence.id)),
    relation: mapped.length > 1 ? "split" : mapped[0].sourceSegmentIds.length > 1 ? "merged" : "same"
  }));
}

function stableSentenceId(lessonId: string, videoId: string, sourceSegmentIds: string[], text: string, index: number) {
  const hash = createHash("sha256").update([lessonId, videoId, sourceSegmentIds.join(","), text, index].join("|")).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join("-");
}

function shortHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function formatSpeakerLabel(speakerId: string | number | null | undefined) {
  if (speakerId == null || speakerId === "") return "未知";
  const numeric = Number(speakerId);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < 26) {
    return `说话人 ${String.fromCharCode(65 + numeric)}`;
  }
  return `说话人 ${speakerId}`;
}
