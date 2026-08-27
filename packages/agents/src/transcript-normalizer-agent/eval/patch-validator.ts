import type {
  EvalChangeType,
  EvalSpeakerRole,
  TranscriptNormalizerEvalFixture,
  TranscriptNormalizerPatchOutput,
  ValidationResult
} from "./types";

const allowedPatchFields = new Set(["sentenceId", "correctedText", "speakerRole", "speakerIdentityId", "confidence", "changeTypes", "needsHumanReview", "reviewReasonCode"]);
const allowedTopFields = new Set(["patches", "warnings"]);
const allowedChangeTypes: EvalChangeType[] = [
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
const allowedSpeakerRoles: EvalSpeakerRole[] = ["teacher", "student", "students", "multiple", "unknown"];

export function validateTranscriptNormalizerPatchOutput(output: unknown, fixture: TranscriptNormalizerEvalFixture): ValidationResult {
  const errors: string[] = [];
  if (!output || typeof output !== "object" || Array.isArray(output)) return { valid: false, errors: ["output_not_object"] };
  const candidate = output as Record<string, unknown>;
  rejectUnknownFields(candidate, allowedTopFields, "output", errors);
  if (!Array.isArray(candidate.patches)) errors.push("patches_missing_or_not_array");
  if (!Array.isArray(candidate.warnings)) errors.push("warnings_missing_or_not_array");
  if (errors.length) return { valid: false, errors };

  const inputById = new Map(fixture.input.map((sentence) => [sentence.id, sentence]));
  const seen = new Set<string>();
  const patches = candidate.patches as unknown[];
  if (patches.length > fixture.input.length) errors.push("patch_count_exceeds_input_count");

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
    if (!inputById.has(sentenceId)) errors.push("unknown_sentence_id");
    if (seen.has(sentenceId)) errors.push("duplicate_sentence_id");
    seen.add(sentenceId);

    if ("startMs" in patch || "endMs" in patch) errors.push("timestamp_mutation_not_allowed");
    validateConfidence(patch.confidence, errors);
    validateChangeTypes(patch.changeTypes, errors);
    validateSpeaker(patch, fixture, errors);
    validateCorrectedText(patch.correctedText, inputById.get(sentenceId)?.text || "", fixture, sentenceId, errors);
  }

  return { valid: errors.length === 0, errors };
}

function rejectUnknownFields(candidate: Record<string, unknown>, allowed: Set<string>, prefix: string, errors: string[]) {
  for (const field of Object.keys(candidate)) {
    if (!allowed.has(field)) errors.push(`${prefix}_field_not_allowed:${field}`);
  }
}

function validateConfidence(value: unknown, errors: string[]) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) errors.push("confidence_out_of_range");
}

function validateChangeTypes(value: unknown, errors: string[]) {
  if (!Array.isArray(value) || !value.length) {
    errors.push("change_types_missing");
    return;
  }
  for (const item of value) {
    if (!allowedChangeTypes.includes(item as EvalChangeType)) errors.push("illegal_change_type");
  }
}

function validateSpeaker(patch: Record<string, unknown>, fixture: TranscriptNormalizerEvalFixture, errors: string[]) {
  if (typeof patch.speakerRole !== "undefined" && !allowedSpeakerRoles.includes(patch.speakerRole as EvalSpeakerRole)) errors.push("illegal_speaker_role");
  if (typeof patch.speakerIdentityId !== "undefined" && (typeof patch.speakerIdentityId !== "string" || !fixture.acceptableSpeakerIdentityIds.includes(patch.speakerIdentityId))) {
    errors.push("illegal_speaker_identity");
  }
}

function validateCorrectedText(
  value: unknown,
  rawText: string,
  fixture: TranscriptNormalizerEvalFixture,
  sentenceId: string,
  errors: string[]
) {
  if (typeof value === "undefined") return;
  if (typeof value !== "string" || !value.trim()) {
    errors.push("empty_corrected_text");
    return;
  }
  if (normalizeWhitespace(value) === normalizeWhitespace(rawText)) errors.push("unchanged_text_returned");
  if (value.length > Math.max(rawText.length * 1.8, rawText.length + 12)) errors.push("ungrounded_expansion");
  const forbidden = fixture.mustNotChange.find((item) => item.sentenceId === sentenceId)?.forbiddenTextIncludes || [];
  for (const token of forbidden) {
    if (value.includes(token)) errors.push("forbidden_text_modified");
  }
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, "");
}
