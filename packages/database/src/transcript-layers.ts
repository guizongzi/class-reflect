export type TranscriptLayerTextInput = {
  rawText: string | null;
  agentNormalizedText?: string | null;
  teacherEditedText?: string | null;
};

export type TranscriptLayerSpeakerInput = {
  speakerLabel?: string | null;
  agentSpeakerRole?: string | null;
  agentSpeakerIdentityId?: string | null;
  teacherSpeakerRole?: string | null;
  teacherSpeakerIdentityId?: string | null;
};

export type LegacyTranscriptBackfillInput = {
  originalText: string | null;
  rawOriginalText: string | null;
  source: string | null;
};

export type LegacyTranscriptBackfillResult = {
  rawText: string;
  agentNormalizedText: string | null;
  teacherEditedText: string | null;
  needsHumanReview: boolean;
  reviewReason: string | null;
  reviewStatus: "pending_review" | "requires_review" | "reviewed";
  legacyOriginalText: string | null;
};

export function computeEffectiveText(input: TranscriptLayerTextInput) {
  return firstNonBlank(input.teacherEditedText, input.agentNormalizedText, input.rawText) || "";
}

export function computeEffectiveSpeaker(input: TranscriptLayerSpeakerInput) {
  const speakerRole = firstNonBlank(input.teacherSpeakerRole, input.agentSpeakerRole, inferRoleFromLabel(input.speakerLabel));
  const speakerIdentityId = firstNonBlank(input.teacherSpeakerIdentityId, input.agentSpeakerIdentityId, null);
  return {
    speakerLabel: displaySpeakerLabel(speakerRole, speakerIdentityId, input.speakerLabel),
    speakerRole,
    speakerIdentityId
  };
}

export function mapLegacyTranscriptLayerBackfill(input: LegacyTranscriptBackfillInput): LegacyTranscriptBackfillResult {
  const rawText = firstNonBlank(input.rawOriginalText, input.originalText) || "";
  const originalText = firstNonBlank(input.originalText, null);
  if (input.source === "transcript_agent") {
    return {
      rawText,
      agentNormalizedText: originalText && originalText !== rawText ? originalText : null,
      teacherEditedText: null,
      needsHumanReview: false,
      reviewReason: null,
      reviewStatus: "pending_review",
      legacyOriginalText: originalText
    };
  }
  if (input.source === "teacher_review") {
    return {
      rawText,
      agentNormalizedText: null,
      teacherEditedText: originalText && originalText !== rawText ? originalText : null,
      needsHumanReview: false,
      reviewReason: null,
      reviewStatus: "reviewed",
      legacyOriginalText: originalText
    };
  }
  const ambiguous = Boolean(originalText && originalText !== rawText);
  return {
    rawText,
    agentNormalizedText: null,
    teacherEditedText: null,
    needsHumanReview: ambiguous,
    reviewReason: ambiguous ? "legacy_original_text_ambiguous" : null,
    reviewStatus: ambiguous ? "requires_review" : "pending_review",
    legacyOriginalText: originalText
  };
}

function firstNonBlank<T extends string | null | undefined>(...values: T[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function inferRoleFromLabel(label: string | null | undefined) {
  if (!label) return null;
  if (/教师|老师|teacher/i.test(label)) return "teacher";
  if (/全班|齐答/.test(label)) return "students";
  if (/多人/.test(label)) return "multiple";
  if (/学生/.test(label)) return "student";
  if (/未知/.test(label)) return "unknown";
  return null;
}

function displaySpeakerLabel(role: string | null, identityId: string | null, fallback: string | null | undefined) {
  if (role === "teacher") return "教师";
  if (role === "students") return "全班";
  if (role === "multiple") return "多人";
  if (role === "unknown") return "未知";
  if (role === "student") return `学生 ${studentLetter(identityId)}`;
  return fallback || "未知";
}

function studentLetter(identityId: string | null) {
  const match = identityId?.match(/(\d+)$/);
  const index = match ? Math.max(Number(match[1]) - 1, 0) : 0;
  return String.fromCharCode(65 + Math.min(index, 25));
}
