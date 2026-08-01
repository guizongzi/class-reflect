export const lessonFormatOptions = [
  {
    value: "offline_classroom_recording",
    label: "线下课堂录像",
    description: "真实教室中的课堂录制，重点看提问、等待、齐答和讲练节奏。"
  },
  {
    value: "live_online_class",
    label: "直播网课",
    description: "实时在线授课，重点看互动延迟、连麦回应和技术停顿。"
  },
  {
    value: "recorded_online_class",
    label: "录播网课",
    description: "预先录制的教学视频，重点看结构、语速和自学友好度。"
  }
] as const;

export type LessonFormat = (typeof lessonFormatOptions)[number]["value"];

export type ResponsePattern =
  | "individual_student_response"
  | "choral_response"
  | "teacher_self_answer"
  | "multiple_student_overlap"
  | "no_audible_response"
  | "unknown_response";

export type LearningCheckLevel = 1 | 2 | 3 | 4 | 5;

export type LearningCheckType =
  | "oral_confirmation"
  | "concept_restatement"
  | "specific_question"
  | "reason_explanation"
  | "transfer_or_task";

export type EvidenceStrength = "very_weak" | "weak" | "medium" | "strong" | "very_strong";

export type InstructionalContext =
  | "new_instruction"
  | "exam_practice"
  | "review_lesson"
  | "test_paper_review"
  | "mixed"
  | "unknown";

export type TeacherUtteranceType =
  | "instructional_question"
  | "learning_check"
  | "classroom_management"
  | "task_instruction"
  | "content_explanation"
  | "feedback"
  | "transition"
  | "unknown";

export type EvidenceCategory =
  | "lecture_duration"
  | "question_quality"
  | "wait_time"
  | "student_response"
  | "feedback_quality"
  | "follow_up"
  | "lesson_structure"
  | "practice_check"
  | "self_check"
  | "information_density"
  | "technical_issue"
  | "lesson_summary"
  | "response_pattern"
  | "learning_check_level"
  | "classroom_management"
  | "error_analysis"
  | "method_generalization"
  | "variation_practice"
  | "knowledge_connection"
  | "structured_review"
  | "weakness_detection";

export type EvidenceConfidence = "low" | "medium" | "high" | "needs_review";

export type CapabilityMatrix = {
  canObserveTeacherSpeech: boolean;
  canObserveStudentSpeech: boolean;
  canDistinguishIndividualResponse: boolean;
  canDistinguishChoralResponse: boolean;
  canDetectTeacherSelfAnswer: boolean;
  canMeasureWaitTime: boolean;
  canAnalyzeClassroomManagementLanguage: boolean;
  canAnalyzeLearningCheckLevel: boolean;
  canAnalyzeLiveAudioInteraction: boolean;
  canAnalyzeChatInteraction: boolean;
  canAnalyzePlatformInteraction: boolean;
  canAnalyzeSpeechRate: boolean;
  canAnalyzeInformationDensity: boolean;
  canAnalyzeSelfCheckPrompt: boolean;
};

export const capabilityMatrixByLessonFormat = {
  offline_classroom_recording: {
    canObserveTeacherSpeech: true,
    canObserveStudentSpeech: true,
    canDistinguishIndividualResponse: true,
    canDistinguishChoralResponse: true,
    canDetectTeacherSelfAnswer: true,
    canMeasureWaitTime: true,
    canAnalyzeClassroomManagementLanguage: true,
    canAnalyzeLearningCheckLevel: true,
    canAnalyzeLiveAudioInteraction: false,
    canAnalyzeChatInteraction: false,
    canAnalyzePlatformInteraction: false,
    canAnalyzeSpeechRate: true,
    canAnalyzeInformationDensity: true,
    canAnalyzeSelfCheckPrompt: true
  },
  live_online_class: {
    canObserveTeacherSpeech: true,
    canObserveStudentSpeech: true,
    canDistinguishIndividualResponse: true,
    canDistinguishChoralResponse: false,
    canDetectTeacherSelfAnswer: true,
    canMeasureWaitTime: true,
    canAnalyzeClassroomManagementLanguage: true,
    canAnalyzeLearningCheckLevel: true,
    canAnalyzeLiveAudioInteraction: true,
    canAnalyzeChatInteraction: false,
    canAnalyzePlatformInteraction: false,
    canAnalyzeSpeechRate: true,
    canAnalyzeInformationDensity: true,
    canAnalyzeSelfCheckPrompt: true
  },
  recorded_online_class: {
    canObserveTeacherSpeech: true,
    canObserveStudentSpeech: false,
    canDistinguishIndividualResponse: false,
    canDistinguishChoralResponse: false,
    canDetectTeacherSelfAnswer: false,
    canMeasureWaitTime: false,
    canAnalyzeClassroomManagementLanguage: false,
    canAnalyzeLearningCheckLevel: true,
    canAnalyzeLiveAudioInteraction: false,
    canAnalyzeChatInteraction: false,
    canAnalyzePlatformInteraction: false,
    canAnalyzeSpeechRate: true,
    canAnalyzeInformationDensity: true,
    canAnalyzeSelfCheckPrompt: true
  }
} satisfies Record<LessonFormat, CapabilityMatrix>;

export type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number;
  speakerLabel?: string | null;
  text: string;
  confidence?: number | null;
};

export type LessonSection = {
  id?: string;
  lessonId?: string;
  videoId?: string;
  startMs: number;
  endMs: number;
  title: string;
  summaryText: string;
  confidenceLabel: string;
  tags: string[];
  transcriptSegmentIds?: string[];
};

export type ClassroomMetric = {
  id: string;
  name: string;
  value: number;
  unit?: string;
  segmentIds?: string[];
  metadata?: Record<string, unknown>;
};

export type ClassroomEvent = {
  id: string;
  type: string;
  startMs: number;
  endMs: number;
  transcriptSegmentIds?: string[];
  quote?: string;
  confidenceLabel?: string;
  metadata?: Record<string, unknown>;
};

export type Report = {
  id?: string;
  lessonId: string;
  markdownContent: string;
  generatedFrom: Record<string, unknown>;
  createdAt?: string;
};

export type TeachingEvidenceCard = {
  id: string;
  category: EvidenceCategory;
  sentiment?: "positive" | "neutral" | "negative";
  title: string;
  fact: string;
  interpretation: string;
  suggestion: string;
  analysis?: {
    evidenceCategory: EvidenceCategory;
    utteranceType?: string;
    includedInQuestionCount?: boolean;
    includedInInteractionCount?: boolean;
    evidenceStrength?: EvidenceStrength;
    internalReason?: string;
    suggestionDirection?: string;
  };
  teacherView?: {
    title: string;
    observation: string;
    teachingMeaning?: string;
    nextStep?: string;
    exampleWording?: string;
  };
  startMs: number;
  endMs: number;
  quote: string;
  transcriptSegmentIds: string[];
  metricIds: string[];
  classroomEventIds: string[];
  applicableLessonFormats: LessonFormat[];
  confidence: EvidenceConfidence;
  uncertaintyNote: string | null;
  reviewStatus: ReviewStatus;
  learningCheck?: {
    level: LearningCheckLevel;
    checkType: LearningCheckType;
    responsePattern: ResponsePattern;
    evidenceStrength: EvidenceStrength;
    limitationNote: string | null;
  };
};

export type WorkflowStatus = "created" | "queued" | "running" | "waiting_for_human" | "completed" | "failed" | "cancelled";

export const workflowStepOptions = [
  { key: "create_lesson", label: "创建课堂" },
  { key: "upload_video", label: "上传视频" },
  { key: "upload_audio", label: "上传音频" },
  { key: "probe_media", label: "检查媒体" },
  { key: "submit_asr", label: "提交转写" },
  { key: "poll_asr", label: "等待转写" },
  { key: "persist_transcript", label: "保存逐字稿" },
  { key: "normalize_transcript", label: "整理逐字稿" },
  { key: "build_sections", label: "生成大段记录" },
  { key: "calculate_metrics", label: "计算指标" },
  { key: "detect_events", label: "识别课堂事件" },
  { key: "generate_evidence", label: "生成证据" },
  { key: "validate_evidence", label: "校验证据" },
  { key: "wait_human_review", label: "等待教师复核" },
  { key: "generate_report", label: "生成报告" },
  { key: "export_report", label: "导出报告" }
] as const;

export type WorkflowStepKey = (typeof workflowStepOptions)[number]["key"];

export type WorkflowStepStatus = "waiting" | "queued" | "running" | "completed" | "failed" | "skipped" | "cancelled";

export type ReviewStatus =
  | "pending_review"
  | "accepted"
  | "edited_and_accepted"
  | "rejected"
  | "needs_more_context";
