import { getWorkflowConfig } from "@class-reflect/config";
import type { TranscriptSegment } from "@class-reflect/shared-types";

export type TranscriptNormalizerSpeakerRole = "teacher" | "student" | "students" | "multiple" | "unknown";

export type TranscriptNormalizerChangeType =
  | "asr_correction"
  | "term_correction"
  | "punctuation"
  | "readability"
  | "speaker_role"
  | "speaker_identity"
  | "ambiguity"
  | "asr_fragment_merge"
  | "sentence_boundary_repair";

export type TranscriptNormalizerReviewReasonCode =
  | "low_confidence"
  | "speaker_conflict"
  | "term_conflict"
  | "student_answer"
  | "overlap"
  | "inaudible"
  | "boundary_uncertain"
  | "invalid_output";

export type TranscriptNormalizerPatch = {
  sentenceId: string;
  correctedText?: string;
  speakerRole?: TranscriptNormalizerSpeakerRole;
  speakerIdentityId?: string;
  confidence: number;
  changeTypes: TranscriptNormalizerChangeType[];
  needsHumanReview: boolean;
  reviewReasonCode?: TranscriptNormalizerReviewReasonCode;
};

export type TranscriptNormalizerSectionBoundarySuggestion = {
  beforeSentenceId: string;
  activityType: "introduction" | "explanation" | "qa" | "practice" | "summary" | "transition";
  topicKeywords: string[];
  confidence: number;
};

export type TranscriptNormalizerPatchOutput = {
  patches: TranscriptNormalizerPatch[];
  sectionBoundarySuggestions?: TranscriptNormalizerSectionBoundarySuggestion[];
  warnings: string[];
};

export type TranscriptNormalizerIndexedPatch = Omit<TranscriptNormalizerPatch, "sentenceId"> & {
  i: number;
};

export type TranscriptNormalizerIndexedSectionBoundarySuggestion = Omit<TranscriptNormalizerSectionBoundarySuggestion, "beforeSentenceId"> & {
  beforeI: number;
};

export type TranscriptNormalizerIndexedPatchOutput = {
  patches: TranscriptNormalizerIndexedPatch[];
  sectionBoundarySuggestions?: TranscriptNormalizerIndexedSectionBoundarySuggestion[];
  warnings: string[];
};

export type TranscriptNormalizerSpeakerHint = {
  rawSpeakerId?: string;
  speakerLabel?: string;
  roleHint?: TranscriptNormalizerSpeakerRole;
  source: "asr" | "deterministic" | "registry" | "teacher";
  confidence: number;
  locked: boolean;
};

export type TranscriptNormalizerSpeakerCode = "A" | "B" | "C";

export type TranscriptNormalizerPatchInputSentence = [
  mode: "w" | "c",
  speaker: TranscriptNormalizerSpeakerCode,
  confidence: number | null,
  text: string
];

export type TranscriptNormalizerPatchInput = {
  firstSentenceId: string;
  speakerRegistry: Record<TranscriptNormalizerSpeakerCode, "teacher" | "student" | "unknown">;
  sentences: TranscriptNormalizerPatchInputSentence[];
  glossary: string[];
};

export type TranscriptNormalizerWindow = {
  windowId: string;
  writableSegments: TranscriptSegment[];
  contextSegments: TranscriptSegment[];
};

export const transcriptNormalizerPatchPromptVersion = getWorkflowConfig().prompts.normalizerVersion;
export const transcriptNormalizerWindowSize = getWorkflowConfig().window.size;
export const transcriptNormalizerWindowOverlap = getWorkflowConfig().window.overlap;
