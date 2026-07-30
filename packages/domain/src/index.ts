import type { CreateLessonRequest } from "@class-reflect/api-contracts";
import type { LessonFormat, LessonSection, TranscriptSegment, WorkflowStatus } from "@class-reflect/shared-types";

export type Lesson = {
  id: string;
  lessonTitle: string;
  courseTitle: string;
  lessonFormat: LessonFormat;
  status: WorkflowStatus;
};

export function createLessonDraft(request: CreateLessonRequest): Lesson {
  return {
    id: crypto.randomUUID(),
    lessonTitle: request.lessonTitle || request.lesson_title || "课堂视频复盘",
    courseTitle: request.courseTitle || request.course_title || "课堂复盘",
    lessonFormat: request.lessonFormat || request.lesson_format || "offline_classroom_recording",
    status: "created"
  };
}

export function buildLessonSections(transcriptSegments: TranscriptSegment[]): LessonSection[] {
  if (!transcriptSegments.length) return [];
  const sections: LessonSection[] = [];
  let current: TranscriptSegment[] = [];
  let currentStart = transcriptSegments[0]?.startMs ?? 0;
  let currentTextLength = 0;

  for (const segment of transcriptSegments) {
    const previous = current[current.length - 1];
    const duration = segment.endMs - currentStart;
    const gapMs = previous ? segment.startMs - previous.endMs : 0;
    const nextTextLength = currentTextLength + String(segment.text || "").length;
    const shouldClose =
      current.length > 0 &&
      (
        duration >= 5 * 60 * 1000 ||
        gapMs >= 20 * 1000 ||
        (duration >= 90 * 1000 && nextTextLength >= 900 && isLikelyActivityBoundary(previous?.text))
      );

    if (shouldClose) {
      sections.push(makeSection(current, sections.length));
      current = [];
      currentStart = segment.startMs;
      currentTextLength = 0;
    }
    current.push(segment);
    currentTextLength += String(segment.text || "").length;
  }

  if (current.length) sections.push(makeSection(current, sections.length));
  return sections;
}

function makeSection(segments: TranscriptSegment[], index: number): LessonSection {
  const startMs = segments[0]?.startMs ?? 0;
  const endMs = segments[segments.length - 1]?.endMs ?? startMs;
  const text = formatSectionTranscript(segments);
  return {
    startMs,
    endMs,
    title: inferSectionTitle(text, index),
    summaryText: text,
    confidenceLabel: "需要复核",
    tags: inferSectionTags(text)
  };
}

function inferSectionTitle(text: string, index: number) {
  if (/导入|今天|复习|上节课|回顾/.test(text)) return "导入与复习";
  if (/例题|讲解|概念|表示|叫作|意义/.test(text)) return "概念讲解";
  if (/练习|判断|回答|谁来说|请.*说/.test(text)) return "课堂练习";
  if (/讨论|小组|同桌|交流/.test(text)) return "讨论交流";
  if (/总结|下节课|作业|今天学/.test(text)) return "总结与作业";
  if (/为什么|几分之几|问题|想一想|请问/.test(text)) return "提问与思考";
  return `课堂片段 ${index + 1}`;
}

function formatSectionTranscript(segments: TranscriptSegment[]) {
  const paragraphs: string[] = [];
  let current: TranscriptSegment[] = [];

  for (const segment of segments) {
    const previous = current[current.length - 1];
    const gapMs = previous ? segment.startMs - previous.endMs : 0;
    const currentLength = current.reduce((sum, item) => sum + String(item.text || "").length, 0);
    const startsNewParagraph =
      current.length > 0 &&
      (
        gapMs >= 12 * 1000 ||
        currentLength >= 420 ||
        isLikelyActivityBoundary(previous?.text)
      );

    if (startsNewParagraph) {
      paragraphs.push(formatParagraph(current));
      current = [];
    }
    current.push(segment);
  }

  if (current.length) paragraphs.push(formatParagraph(current));
  return paragraphs.join("\n\n");
}

function formatParagraph(segments: TranscriptSegment[]) {
  return segments
    .map((segment, index) => {
      const previous = segments[index - 1];
      const gapMs = previous ? segment.startMs - previous.endMs : 0;
      const pauseHint = gapMs >= 3000 ? ` 停顿${(gapMs / 1000).toFixed(1)}秒后` : "";
      return `${msToClock(segment.startMs)}-${msToClock(segment.endMs)}${pauseHint} ${segment.speakerLabel || "未知"}：${String(segment.text || "").trim()}`;
    })
    .join("\n");
}

function isLikelyActivityBoundary(text = "") {
  return /接下来|下面|现在|好[，,]?|我们来看|请大家|开始练习|小组讨论|总结一下|下一个/.test(text);
}

function inferSectionTags(text: string) {
  const tags: string[] = [];
  if (/[？?]|为什么|想一想|请问/.test(text)) tags.push("含提问");
  if (/练习|判断|作业/.test(text)) tags.push("练习");
  if (/讨论|同桌|小组/.test(text)) tags.push("互动");
  return tags;
}

function msToClock(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
