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

export type WorkflowStatus = "created" | "queued" | "running" | "completed" | "failed";

export type ReviewStatus =
  | "pending_review"
  | "accepted"
  | "edited_and_accepted"
  | "rejected"
  | "needs_more_context";
