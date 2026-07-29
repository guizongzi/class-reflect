import type { LessonFormat, LessonListItem, LessonSectionDto, NormalizedSection, TranscriptSegmentDto } from "../../api/types";

export const FLOW = ["对话发起", "处理过程", "校订原文", "核对证据", "人工复核", "生成报告"];

export const LESSON_FORMAT_OPTIONS: Array<{ value: LessonFormat; label: string; description: string; agentFocus: string }> = [
  {
    value: "offline_classroom_recording",
    label: "线下课堂录像",
    description: "真实教室中的课堂录制。",
    agentFocus: "重点看等待时间、师生问答、课堂节奏和活动转换。"
  },
  {
    value: "live_online_class",
    label: "直播网课",
    description: "实时在线授课，有直播互动。",
    agentFocus: "重点看互动延迟、点名回应、屏幕讲解节奏和线上参与感。"
  },
  {
    value: "recorded_online_class",
    label: "录播网课",
    description: "预先录制的教学视频。",
    agentFocus: "重点看讲解结构、停顿设计、指令清晰度和自学友好度。"
  }
];

export function lessonFormatLabel(value?: LessonFormat): string {
  return LESSON_FORMAT_OPTIONS.find((item) => item.value === value)?.label || "未选择类型";
}

export function normalizeSection(
  section: LessonSectionDto,
  transcriptSegments: TranscriptSegmentDto[]
): NormalizedSection {
  const segments = transcriptSegments.filter(
    (segment) =>
      Number(segment.start_ms) >= Number(section.start_ms) &&
      Number(segment.end_ms) <= Number(section.end_ms)
  );
  return {
    id: section.id,
    startMs: section.start_ms ?? 0,
    endMs: section.end_ms ?? 0,
    title: section.title || "课堂片段",
    text: section.edited_summary_text || section.summary_text || "",
    translatedText: formatTranslatedSegments(segments),
    bilingualText: formatBilingualSegments(segments),
    tags: Array.isArray(section.tags) ? section.tags : [],
    reviewStatus: section.review_status || "待校订"
  };
}

export function statusLabel(lesson: LessonListItem): string {
  if (lesson.workflow_status === "failed") return `失败：${lesson.workflow_error_message || lesson.error_message || "处理失败"}`;
  if (lesson.workflow_status === "running") return `处理中：${stepStatusName(lesson.workflow_current_step)}`;
  if (lesson.error_message) return `失败：${lesson.error_message}`;
  if (lesson.processing_status === "completed" || lesson.status === "ready") return "已完成";
  if (lesson.processing_status === "queued" || lesson.status === "processing") return "处理中";
  if (lesson.upload_status === "uploaded") return "已上传";
  return "未完成";
}

export function stepStatusName(key?: string): string {
  return {
    verify_upload: "校验上传",
    download_video: "读取视频",
    extract_audio: "抽取音频",
    upload_audio: "保存音频",
    asr: "语音转文字",
    build_sections: "生成大段记录",
    write_transcript: "写入数据库",
    completed: "完成"
  }[key || ""] || "处理";
}

export function sectionTextForView(section: NormalizedSection, view: "zh" | "en" | "both"): string {
  if (view === "en") return section.translatedText || "还没有生成中文翻译。";
  if (view === "both") return section.bilingualText || section.translatedText || section.text;
  return section.text;
}

export function clock(ms?: number): string {
  const total = Math.floor(Number(ms || 0) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function formatDate(value?: string): string {
  if (!value) return "未知时间";
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatTranslatedSegments(segments: TranscriptSegmentDto[]): string {
  return segments
    .filter((segment) => segment.translated_text)
    .map((segment) => `${clock(segment.start_ms)}-${clock(segment.end_ms)} ${segment.speaker_label || "未知"}：${segment.translated_text}`)
    .join("\n");
}

function formatBilingualSegments(segments: TranscriptSegmentDto[]): string {
  return segments
    .map((segment) => {
      const original = `${clock(segment.start_ms)}-${clock(segment.end_ms)} ${segment.speaker_label || "未知"}：${segment.original_text || ""}`;
      const translated = segment.translated_text ? `中文：${segment.translated_text}` : "中文：未生成";
      return `${original}\n${translated}`;
    })
    .join("\n\n");
}
