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

export type WorkflowStepStatus = "waiting" | "queued" | "running" | "completed" | "failed" | "skipped";

export type ReviewStatus =
  | "pending_review"
  | "accepted"
  | "edited_and_accepted"
  | "rejected"
  | "needs_more_context";
