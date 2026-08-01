import type {
  CapabilityMatrix,
  ClassroomEvent,
  ClassroomMetric,
  EvidenceCategory,
  InstructionalContext,
  LessonFormat,
  LessonSection,
  TeachingEvidenceCard,
  TranscriptSegment
} from "@class-reflect/shared-types";

export type AgentResult<T> = {
  output: T;
  promptVersion: string;
  warnings: string[];
};

export type TeachingEvidenceInput = {
  lessonId: string;
  traceId?: string;
  lesson_format: LessonFormat;
  capabilityMatrix?: CapabilityMatrix;
  transcriptSegments: TranscriptSegment[];
  metrics: ClassroomMetric[];
  classroomEvents?: ClassroomEvent[];
  generationConfig?: {
    enabledCategories?: EvidenceCategory[];
    maxEvidenceCards?: number;
    minimumConfidence?: "low" | "medium" | "high";
    language: "zh-CN";
  };
};

export type TeachingEvidenceOutput = {
  lessonId: string;
  lesson_format: LessonFormat;
  instructionalContext: InstructionalContext;
  evidenceCards: TeachingEvidenceCard[];
  skippedCategories: Array<{
    category: EvidenceCategory;
    reason:
      | "capability_not_supported"
      | "insufficient_evidence"
      | "category_disabled"
      | "not_applicable_to_lesson_format";
  }>;
  generationSummary: {
    analyzedTranscriptSegmentCount: number;
    analyzedMetricCount: number;
    generatedEvidenceCount: number;
  };
};

export type WorkflowAgentStep = {
  stepKey: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
};

export type WorkflowAgentSnapshot = {
  lessonId: string;
  videoId?: string | null;
  status?: string | null;
  hasUploadedVideo: boolean;
  hasUploadedAudio: boolean;
  steps: WorkflowAgentStep[];
};

export type WorkflowAgentDecision = {
  action: "wait_for_upload" | "continue_pipeline" | "wait_for_human" | "complete" | "fail";
  nextStepKey: string | null;
  assistantMessage: string;
  warnings: string[];
};

export type TranscriptNormalizerOutput = {
  normalizedSegments: TranscriptSegment[];
  displaySections: LessonSection[];
  analysisProjection: {
    sentenceCount: number;
    teacherSentenceCount: number;
    studentSentenceCount: number;
    lowConfidenceSentenceCount: number;
    flags: string[];
  };
};

export type SpeakerProfile = {
  rawLabel: string;
  normalizedLabel: string;
  role: "teacher" | "student" | "students" | "unknown";
  score: number;
};
