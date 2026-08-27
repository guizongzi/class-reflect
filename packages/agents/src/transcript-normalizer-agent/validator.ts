import type { TranscriptSegment } from "@class-reflect/shared-types";
import type { TranscriptNormalizerOutput } from "../types";
import type {
  TranscriptNormalizerChangeType,
  TranscriptNormalizerIndexedPatchOutput,
  TranscriptNormalizerPatchOutput,
  TranscriptNormalizerReviewReasonCode,
  TranscriptNormalizerSpeakerRole,
  TranscriptNormalizerWindow
} from "./schema";

export function isTranscriptNormalizerOutput(value: unknown): value is TranscriptNormalizerOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.normalizedSegments)
    && Array.isArray(candidate.displaySections)
    && !!candidate.analysisProjection
    && typeof candidate.analysisProjection === "object";
}

const allowedTopFields = new Set(["patches", "warnings"]);
const allowedPatchFields = new Set(["sentenceId", "correctedText", "speakerRole", "speakerIdentityId", "confidence", "changeTypes", "needsHumanReview", "reviewReasonCode"]);
const allowedSectionFields = new Set(["beforeSentenceId", "activityType", "topicKeywords", "confidence"]);
const allowedIndexedPatchFields = new Set(["i", "correctedText", "speakerRole", "speakerIdentityId", "confidence", "changeTypes", "needsHumanReview", "reviewReasonCode"]);
const allowedChangeTypes: TranscriptNormalizerChangeType[] = [
  "asr_correction",
  "term_correction",
  "punctuation",
  "readability",
  "speaker_role",
  "speaker_identity",
  "ambiguity",
  "asr_fragment_merge",
  "sentence_boundary_repair"
];
const allowedSpeakerRoles: TranscriptNormalizerSpeakerRole[] = ["teacher", "student", "students", "multiple", "unknown"];
const allowedReviewReasonCodes: TranscriptNormalizerReviewReasonCode[] = [
  "low_confidence",
  "speaker_conflict",
  "term_conflict",
  "student_answer",
  "overlap",
  "inaudible",
  "boundary_uncertain",
  "invalid_output"
];
const allowedActivityTypes = ["introduction", "explanation", "qa", "practice", "summary", "transition"];

export function isTranscriptNormalizerPatchOutputForSegments(
  value: unknown,
  segments: TranscriptSegment[]
): value is TranscriptNormalizerPatchOutput {
  return validateTranscriptNormalizerPatchOutputForSegments(value, segments).valid;
}

export function isTranscriptNormalizerIndexedPatchOutputForWindow(
  value: unknown,
  window: TranscriptNormalizerWindow
): value is TranscriptNormalizerIndexedPatchOutput {
  return validateAndAdaptTranscriptNormalizerIndexedOutput(value, window).valid;
}

export function validateAndAdaptTranscriptNormalizerIndexedOutput(
  value: unknown,
  window: TranscriptNormalizerWindow
): { valid: boolean; errors: string[]; output?: TranscriptNormalizerPatchOutput } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["output_not_object"] };
  const candidate = value as Record<string, unknown>;
  rejectUnknownFields(candidate, allowedTopFields, "output", errors);
  if (!Array.isArray(candidate.patches)) errors.push("patches_missing_or_not_array");
  if (!Array.isArray(candidate.warnings)) errors.push("warnings_missing_or_not_array");
  else if (candidate.warnings.some((warning) => typeof warning !== "string")) errors.push("warnings_item_not_string");
  if (errors.length) return { valid: false, errors };

  const writableIds = new Set(window.writableSegments.map((segment) => segment.id));
  const mappedPatches: TranscriptNormalizerPatchOutput["patches"] = [];
  const seenPatchIndexes = new Set<number>();
  const patches = candidate.patches as unknown[];
  if (patches.length > window.writableSegments.length) errors.push("patch_count_exceeds_input_count");

  for (const rawPatch of patches) {
    if (!rawPatch || typeof rawPatch !== "object" || Array.isArray(rawPatch)) {
      errors.push("patch_not_object");
      continue;
    }
    const patch = rawPatch as Record<string, unknown>;
    rejectUnknownFields(patch, allowedIndexedPatchFields, "patch", errors);
    const index = patch.i;
    if (!Number.isInteger(index)) {
      errors.push("patch_index_invalid");
      continue;
    }
    const numericIndex = index as number;
    const segment = window.contextSegments[numericIndex];
    if (!segment) {
      errors.push("patch_index_out_of_range");
      continue;
    }
    if (!writableIds.has(segment.id)) errors.push("patch_index_not_writable");
    const sanitizedPatch = sanitizeIndexedPatch(patch, segment);
    if (!sanitizedPatch) continue;
    if (seenPatchIndexes.has(numericIndex)) errors.push("duplicate_patch_index");
    seenPatchIndexes.add(numericIndex);
    mappedPatches.push(mapIndexedPatch(sanitizedPatch, segment.id));
  }

  const output: TranscriptNormalizerPatchOutput = {
    patches: mappedPatches,
    warnings: candidate.warnings as string[]
  };
  const canonicalValidation = validateTranscriptNormalizerPatchOutputForSegments(output, window.writableSegments);
  errors.push(...canonicalValidation.errors);
  return errors.length ? { valid: false, errors } : { valid: true, errors: [], output };
}

export function validateTranscriptNormalizerPatchOutputForSegments(value: unknown, segments: TranscriptSegment[]) {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["output_not_object"] };
  const candidate = value as Record<string, unknown>;
  rejectUnknownFields(candidate, allowedTopFields, "output", errors);
  if (!Array.isArray(candidate.patches)) errors.push("patches_missing_or_not_array");
  if (!Array.isArray(candidate.warnings)) errors.push("warnings_missing_or_not_array");
  else if (candidate.warnings.some((warning) => typeof warning !== "string")) errors.push("warnings_item_not_string");
  if (errors.length) return { valid: false, errors };

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const seen = new Set<string>();
  const patches = candidate.patches as unknown[];
  if (patches.length > segments.length) errors.push("patch_count_exceeds_input_count");

  for (const rawPatch of patches) {
    if (!rawPatch || typeof rawPatch !== "object" || Array.isArray(rawPatch)) {
      errors.push("patch_not_object");
      continue;
    }
    const patch = rawPatch as Record<string, unknown>;
    rejectUnknownFields(patch, allowedPatchFields, "patch", errors);
    const sentenceId = patch.sentenceId;
    if (typeof sentenceId !== "string" || !sentenceId) {
      errors.push("sentence_id_missing");
      continue;
    }
    const segment = segmentById.get(sentenceId);
    if (!segment) errors.push("unknown_sentence_id");
    if (seen.has(sentenceId)) errors.push("duplicate_sentence_id");
    seen.add(sentenceId);
    validatePatch(patch, segment, errors);
  }

  validateSectionBoundarySuggestions(candidate.sectionBoundarySuggestions, segmentById, errors);
  return { valid: errors.length === 0, errors };
}

function mapIndexedPatch(patch: Record<string, unknown>, sentenceId: string) {
  return {
    sentenceId,
    ...(typeof patch.correctedText === "undefined" ? {} : { correctedText: patch.correctedText as string }),
    ...(typeof patch.speakerRole === "undefined" ? {} : { speakerRole: patch.speakerRole as TranscriptNormalizerSpeakerRole }),
    ...(typeof patch.speakerIdentityId === "undefined" ? {} : { speakerIdentityId: patch.speakerIdentityId as string }),
    confidence: patch.confidence as number,
    changeTypes: patch.changeTypes as TranscriptNormalizerChangeType[],
    needsHumanReview: patch.needsHumanReview as boolean,
    ...(typeof patch.reviewReasonCode === "undefined" ? {} : { reviewReasonCode: patch.reviewReasonCode as TranscriptNormalizerReviewReasonCode })
  };
}

function sanitizeIndexedPatch(patch: Record<string, unknown>, segment: TranscriptSegment) {
  const sanitized = { ...patch };
  const correctedText = sanitized.correctedText;
  if (
    typeof correctedText === "string"
    && correctedText.replace(/\s+/g, "") === (segment.text || "").replace(/\s+/g, "")
  ) {
    delete sanitized.correctedText;
  }
  if (
    typeof sanitized.correctedText === "string"
    && isUngroundedExpansion(sanitized.correctedText, segment.text || "")
  ) {
    delete sanitized.correctedText;
  }

  if (
    typeof sanitized.speakerRole !== "undefined"
    && sanitized.speakerRole === inferSegmentSpeakerRole(segment)
  ) {
    delete sanitized.speakerRole;
  }

  const hasMeaningfulChange = typeof sanitized.correctedText !== "undefined"
    || typeof sanitized.speakerRole !== "undefined"
    || typeof sanitized.speakerIdentityId !== "undefined"
    || sanitized.needsHumanReview === true;
  return hasMeaningfulChange ? sanitized : null;
}

function validatePatch(patch: Record<string, unknown>, segment: TranscriptSegment | undefined, errors: string[]) {
  if ("startMs" in patch || "endMs" in patch || "rawText" in patch) errors.push("forbidden_source_or_timing_field");
  validateConfidence(patch.confidence, errors);
  validateBoolean(patch.needsHumanReview, "needs_human_review_invalid", errors);
  validateChangeTypes(patch.changeTypes, errors);
  if (typeof patch.reviewReasonCode !== "undefined" && !allowedReviewReasonCodes.includes(patch.reviewReasonCode as TranscriptNormalizerReviewReasonCode)) {
    errors.push("illegal_review_reason_code");
  }
  if (typeof patch.speakerRole !== "undefined" && !allowedSpeakerRoles.includes(patch.speakerRole as TranscriptNormalizerSpeakerRole)) {
    errors.push("illegal_speaker_role");
  }
  if (typeof patch.speakerIdentityId !== "undefined" && (typeof patch.speakerIdentityId !== "string" || !/^[-_A-Za-z0-9]{1,64}$/.test(patch.speakerIdentityId))) {
    errors.push("illegal_speaker_identity");
  }
  validateCorrectedText(patch, segment, errors);
}

function validateCorrectedText(patch: Record<string, unknown>, segment: TranscriptSegment | undefined, errors: string[]) {
  const value = patch.correctedText;
  if (typeof value === "undefined") return;
  if (typeof value !== "string" || !value.trim()) {
    errors.push("empty_corrected_text");
    return;
  }
  const rawText = segment?.text || "";
  if (value.replace(/\s+/g, "") === rawText.replace(/\s+/g, "")) errors.push("unchanged_text_returned");
  if (isUngroundedExpansion(value, rawText)) errors.push("ungrounded_expansion");
  if (isLikelyStudentAnswer(segment) && changesProtectedStudentAnswer(rawText, value)) errors.push("student_answer_correction_not_allowed");
}

function isUngroundedExpansion(correctedText: string, rawText: string) {
  return correctedText.length > Math.max(rawText.length * 1.8, rawText.length + 12);
}

function validateSectionBoundarySuggestions(value: unknown, segmentById: Map<string, TranscriptSegment>, errors: string[]) {
  if (typeof value === "undefined") return;
  if (!Array.isArray(value)) {
    errors.push("section_boundaries_not_array");
    return;
  }
  for (const rawSection of value) {
    if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) {
      errors.push("section_boundary_not_object");
      continue;
    }
    const section = rawSection as Record<string, unknown>;
    rejectUnknownFields(section, allowedSectionFields, "section", errors);
    if (typeof section.beforeSentenceId !== "string" || !segmentById.has(section.beforeSentenceId)) errors.push("section_references_unknown_sentence");
    if (!allowedActivityTypes.includes(String(section.activityType))) errors.push("illegal_activity_type");
    if (!Array.isArray(section.topicKeywords) || section.topicKeywords.some((item) => typeof item !== "string")) errors.push("topic_keywords_invalid");
    validateConfidence(section.confidence, errors);
  }
}

function validateConfidence(value: unknown, errors: string[]) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) errors.push("confidence_out_of_range");
}

function validateBoolean(value: unknown, error: string, errors: string[]) {
  if (typeof value !== "boolean") errors.push(error);
}

function validateChangeTypes(value: unknown, errors: string[]) {
  if (!Array.isArray(value) || !value.length) {
    errors.push("change_types_missing");
    return;
  }
  for (const item of value) {
    if (!allowedChangeTypes.includes(item as TranscriptNormalizerChangeType)) errors.push("illegal_change_type");
  }
}

function rejectUnknownFields(candidate: Record<string, unknown>, allowed: Set<string>, prefix: string, errors: string[]) {
  for (const field of Object.keys(candidate)) {
    if (!allowed.has(field)) errors.push(`${prefix}_field_not_allowed:${field}`);
  }
}

function isLikelyStudentAnswer(segment: TranscriptSegment | undefined) {
  const label = segment?.speakerLabel || "";
  if (/学生|全班|齐答/.test(label)) return true;
  return false;
}

function inferSegmentSpeakerRole(segment: TranscriptSegment) {
  const label = segment.speakerLabel || "";
  const roleHint = (segment as TranscriptSegment & { speakerRoleHint?: unknown }).speakerRoleHint;
  if (allowedSpeakerRoles.includes(roleHint as TranscriptNormalizerSpeakerRole)) return roleHint;
  if (/教师|老师|teacher/i.test(label)) return "teacher";
  if (/全班|齐答/.test(label)) return "students";
  if (/多人|重叠/.test(label)) return "multiple";
  if (/学生/.test(label)) return "student";
  return "unknown";
}

function changesProtectedStudentAnswer(rawText: string, correctedText: string) {
  const rawFormula = rawText.match(/CO\s*[0-9兔]/i)?.[0]?.replace(/\s+/g, "").replace("兔", "2");
  const correctedFormula = correctedText.match(/CO\s*[0-9]/i)?.[0]?.replace(/\s+/g, "");
  return Boolean(rawFormula && correctedFormula && rawFormula !== correctedFormula);
}
