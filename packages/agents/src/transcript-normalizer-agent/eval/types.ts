import type { TranscriptSegment } from "@class-reflect/shared-types";

export type EvalSpeakerRole = "teacher" | "student" | "students" | "multiple" | "unknown";

export type EvalChangeType =
  | "asr_correction"
  | "term_correction"
  | "punctuation"
  | "readability"
  | "speaker_role"
  | "speaker_identity"
  | "ambiguity"
  | "asr_fragment_merge"
  | "sentence_boundary_repair";

export type EvalReviewReasonCode =
  | "low_confidence"
  | "speaker_conflict"
  | "term_conflict"
  | "student_answer"
  | "overlap"
  | "inaudible"
  | "boundary_uncertain"
  | "invalid_output";

export type EvalInputSentence = TranscriptSegment & {
  rawSpeakerId?: string | null;
  speakerRoleHint?: EvalSpeakerRole;
  speakerIdentityHintId?: string | null;
  speakerConfidence?: number | null;
};

export type ExpectedDeliveryFeatures = {
  fillerWordCount?: number;
  fillerWords?: string[];
  repetitionCount?: number;
  selfCorrectionCount?: number;
  incompleteUtterance?: boolean;
  possibleQuestion?: boolean;
  possibleInstruction?: boolean;
  possibleAnswer?: boolean;
  possibleFeedback?: boolean;
  speakerTurnChanged?: boolean;
};

export type EvalTextExpectation = {
  sentenceId: string;
  textIncludes?: string[];
  forbiddenTextIncludes?: string[];
  changeTypes?: EvalChangeType[];
};

export type TranscriptNormalizerEvalFixture = {
  id: string;
  name: string;
  input: EvalInputSentence[];
  mustChange: EvalTextExpectation[];
  mustNotChange: EvalTextExpectation[];
  acceptableSpeakerRoles: EvalSpeakerRole[];
  acceptableSpeakerIdentityIds: string[];
  expectedDeliveryFeatures: ExpectedDeliveryFeatures;
  needsHumanReview: boolean;
  shouldSuggestSectionBoundary: boolean;
  invalidMockOutput?: unknown;
};

export type TranscriptNormalizerPatch = {
  sentenceId: string;
  correctedText?: string;
  speakerRole?: EvalSpeakerRole;
  speakerIdentityId?: string;
  confidence: number;
  changeTypes: EvalChangeType[];
  needsHumanReview: boolean;
  reviewReasonCode?: EvalReviewReasonCode;
};

export type SectionBoundarySuggestion = {
  beforeSentenceId: string;
  activityType: "introduction" | "explanation" | "qa" | "practice" | "summary" | "transition";
  topicKeywords: string[];
  confidence: number;
};

export type TranscriptNormalizerPatchOutput = {
  patches: TranscriptNormalizerPatch[];
  sectionBoundarySuggestions?: SectionBoundarySuggestion[];
  warnings: string[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export type EvalMode = "mock" | "real";

export type EvalReport = {
  generatedAt: string;
  mode: EvalMode;
  realProviderEnabled: boolean;
  fixtures: {
    total: number;
    passed: number;
    failed: number;
  };
  metrics: {
    schemaPassRate: number;
    businessValidationPassRate: number;
    sentenceIdRetentionRate: number;
    timestampRetentionRate: number;
    requiredCorrectionRecall: number;
    forbiddenModificationRate: number;
    criticalFactErrorCount: number;
    speakerRoleAccuracy: number;
    speakerIdentityStabilityRate: number;
    humanReviewHitRate: number;
    patchCount: number;
    llmCallCount: number;
    inputTokenEstimate: number;
    outputTokenEstimate: number;
    totalTokenEstimate: number;
    latencyMs: {
      p50: number;
      p95: number;
      max: number;
    };
    fallbackUsageRate: number;
  };
  baseline: {
    currentImplementation: string;
    tokenSavingsAreTargetEstimates: boolean;
    requiresSameFixtureModelAndConfigComparison: boolean;
  };
  fixtureResults: Array<{
    fixtureId: string;
    schemaValid: boolean;
    businessValid: boolean;
    errors: string[];
    patchCount: number;
    inputTokenEstimate: number;
    outputTokenEstimate: number;
    latencyMs: number;
    fallbackUsed: boolean;
  }>;
  reportPaths?: {
    json?: string;
    markdown?: string;
  };
  limitations: string[];
};
