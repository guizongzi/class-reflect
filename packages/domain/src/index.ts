import type { CreateLessonRequest } from "@class-reflect/api-contracts";
import type { ClassroomEvent, ClassroomMetric, LessonFormat, LessonSection, Report, TeachingEvidenceCard, TranscriptSegment, WorkflowStatus } from "@class-reflect/shared-types";

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

export function detectClassroomEvents(transcriptSegments: TranscriptSegment[]): ClassroomEvent[] {
  const events: ClassroomEvent[] = [];
  const sorted = [...transcriptSegments].sort((a, b) => a.startMs - b.startMs);

  for (let index = 0; index < sorted.length; index += 1) {
    const segment = sorted[index];
    if (!segment) continue;
    const next = sorted[index + 1];
    const text = segment.text || "";
    const isTeacher = isTeacherSegment(segment);

    if (isTeacher && hasInstructionalQuestion(text)) {
      events.push(makeEvent("teacher_question", segment, [segment.id], text, "medium"));
      if (next && isTeacherSegment(next) && next.startMs - segment.endMs <= 3000) {
        events.push(makeEvent("teacher_self_answer", { ...segment, endMs: next.endMs, text: `${text} ${next.text}` }, [segment.id, next.id], `${text} ${next.text}`, "medium", {
          waitMs: Math.max(next.startMs - segment.endMs, 0)
        }));
      }
      if (next && !isTeacherSegment(next)) {
        const responseType = inferStudentResponseType(next);
        events.push(makeEvent(responseType, next, [next.id], next.text, "medium", {
          questionSegmentId: segment.id,
          waitMs: Math.max(next.startMs - segment.endMs, 0)
        }));
      }
    }

    if (isTeacher && /听懂了吗|会了吗|明白了吗|没问题吧|清楚了吗|对不对|是不是/.test(text)) {
      events.push(makeEvent("generic_comprehension_check", segment, [segment.id], text, "high"));
    }

    if (isTeacher && /为什么|依据|理由|怎么判断|请.*说明|请.*解释/.test(text)) {
      events.push(makeEvent("specific_comprehension_check", segment, [segment.id], text, "medium"));
    }

    if (isTeacher && /很好|不错|对了|答得好|再想想|不完全|哪里不对|补充一下/.test(text)) {
      events.push(makeEvent("teacher_feedback", segment, [segment.id], text, "medium"));
    }
  }

  return dedupeEvents(events);
}

export function buildReportFromAcceptedEvidence(input: {
  lesson: Lesson;
  evidenceCards: TeachingEvidenceCard[];
  metrics?: ClassroomMetric[];
}): Report {
  const accepted = input.evidenceCards.filter((card) => ["accepted", "edited_and_accepted"].includes(card.reviewStatus));
  const metrics = input.metrics || [];
  const metricsSummary = metrics.length
    ? metrics.map((metric) => `- ${metric.name}：${formatMetricValue(metric)}${formatMetricDetail(metric)}`).join("\n")
    : "- 暂无已计算的确定性课堂指标。请先完成转写和 calculate_metrics 步骤。";
  const findings = accepted.length
    ? accepted.map((card, index) => [
      `### ${index + 1}. ${card.title}`,
      "",
      `- 时间：${msToClock(card.startMs)}-${msToClock(card.endMs)}`,
      `- 事实：${card.fact}`,
      `- 判断：${card.interpretation}`,
      `- 建议：${card.suggestion}`,
      `- 引用：${card.quote}`
    ].join("\n")).join("\n\n")
    : "本报告尚无已确认的教学证据。请先在证据审核中接受或修改后接受候选证据。";

  const suggestions = accepted.length
    ? accepted.map((card) => `- ${card.suggestion}`).join("\n")
    : "- 暂无已确认建议。";

  return {
    lessonId: input.lesson.id,
    markdownContent: [
      "# 课堂复盘报告",
      "",
      "## 1. 课堂基本信息",
      "",
      `- 课程：${input.lesson.courseTitle}`,
      `- 课堂：${input.lesson.lessonTitle}`,
      `- 课程形式：${input.lesson.lessonFormat}`,
      "",
      "## 2. 本次复盘目标",
      "",
      "围绕课堂结构、教学互动、学习检查和可追溯证据进行复盘。",
      "",
      "## 3. 素材与分析范围",
      "",
      "本报告只整理教师已确认的候选证据，不重新分析原始逐字稿。",
      "",
      "## 4. 课堂结构与关键指标",
      "",
      "以下内容来自确定性 Metrics Engine，不交给 LLM 计数；信息密度只输出可观察提示，不输出黑箱总分。",
      "",
      metricsSummary,
      "",
      "## 5. 教师确认的主要发现",
      "",
      findings,
      "",
      "## 6. 证据详情",
      "",
      findings,
      "",
      "## 7. 下一次课堂可尝试的改进",
      "",
      suggestions,
      "",
      "## 8. 分析限制与不确定性",
      "",
      "报告不评价教师人格、能力或学生真实掌握程度；没有音视频和逐字稿证据支持的内容不进入报告。"
    ].join("\n"),
    generatedFrom: {
      acceptedEvidenceCardIds: accepted.map((card) => card.id),
      evidenceCount: accepted.length,
      metricIds: metrics.map((metric) => metric.id),
      metricCount: metrics.length,
      policy: "accepted_or_edited_and_accepted_only"
    }
  };
}

function formatMetricValue(metric: ClassroomMetric) {
  if (metric.unit === "chars_per_minute") return `${metric.value} 字/分钟`;
  if (metric.unit === "seconds") return `${metric.value} 秒`;
  if (metric.unit === "percent") return `${metric.value}%`;
  if (metric.unit === "count") return `${metric.value} 次`;
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function formatMetricDetail(metric: ClassroomMetric) {
  const metadata = metric.metadata || {};
  if (metric.name === "长停顿次数" && typeof metadata.maxPauseSeconds === "number") {
    return `，最长停顿 ${metadata.maxPauseSeconds} 秒`;
  }
  if (metric.name === "问题后平均等待时间" && typeof metadata.measuredQuestionCount === "number") {
    return `，有效测量问题 ${metadata.measuredQuestionCount} 个`;
  }
  if (metric.name === "学生回答或齐答次数" && typeof metadata.choralResponseCount === "number") {
    return `，其中齐答线索 ${metadata.choralResponseCount} 次`;
  }
  if (metric.name === "信息密度提示" && Array.isArray(metadata.signals) && metadata.signals.length) {
    const first = metadata.signals[0] as { reason?: string };
    return first.reason ? `，首要提示：${first.reason}` : "";
  }
  if (metric.unit === "percent" && typeof metadata.durationSeconds === "number") {
    return `，约 ${metadata.durationSeconds} 秒`;
  }
  return "";
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

function makeEvent(
  type: string,
  segment: TranscriptSegment,
  transcriptSegmentIds: string[],
  quote: string,
  confidenceLabel: string,
  metadata: Record<string, unknown> = {}
): ClassroomEvent {
  return {
    id: `event_${stableHash(`${type}:${transcriptSegmentIds.join(",")}:${segment.startMs}:${segment.endMs}`)}`,
    type,
    startMs: segment.startMs,
    endMs: segment.endMs,
    transcriptSegmentIds,
    quote: quote.replace(/\s+/g, " ").trim().slice(0, 160),
    confidenceLabel,
    metadata
  };
}

function hasInstructionalQuestion(text: string) {
  if (/坐好了吗|准备好了吗|能听见吗|看得见吗|书翻到|安静|举手/.test(text)) return false;
  return /[？?]|为什么|怎么|哪|什么|是否|是不是|对不对|请.*说|请.*解释/.test(text);
}

function isTeacherSegment(segment: TranscriptSegment) {
  const label = segment.speakerLabel || "";
  if (/学生|同学|全班|生/.test(label)) return false;
  return /教师|老师|teacher|说话人 A|未知/i.test(label) || !label;
}

function inferStudentResponseType(segment: TranscriptSegment) {
  const value = `${segment.speakerLabel || ""} ${segment.text || ""}`;
  if (/全班|集体|齐答|^(懂了|会了|明白了?|对|是)[。！!]?$/.test(value.trim())) return "choral_response";
  return "student_response";
}

function dedupeEvents(events: ClassroomEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.type}:${event.transcriptSegmentIds?.join(",")}:${event.startMs}:${event.endMs}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
