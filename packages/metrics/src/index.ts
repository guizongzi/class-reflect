import type { ClassroomMetric, LessonSection, TranscriptSegment } from "@class-reflect/shared-types";

type MetricInput = {
  transcriptSegments: TranscriptSegment[];
  lessonSections?: LessonSection[];
};

type MetricDraft = Omit<ClassroomMetric, "id">;

const longPauseMs = 3000;
const teacherRunGapMs = 2500;

export function calculateSpeechRate(segments: Array<{ startMs?: number; endMs?: number; text?: string }>) {
  const totalChars = segments.reduce((sum, segment) => sum + countEffectiveCharacters(segment.text || ""), 0);
  const startMs = segments.length ? Math.min(...segments.map((segment) => segment.startMs ?? 0)) : 0;
  const endMs = segments.length ? Math.max(...segments.map((segment) => segment.endMs ?? 0)) : 0;
  const minutes = Math.max((endMs - startMs) / 60000, 1);
  return { value: round(totalChars / minutes), unit: "chars_per_minute" };
}

export function calculateDeterministicClassroomMetrics(input: MetricInput): ClassroomMetric[] {
  const segments = [...input.transcriptSegments].sort((a, b) => a.startMs - b.startMs);
  const teacherSegments = segments.filter(isTeacherSegment);
  const studentSegments = segments.filter(isStudentSegment);
  const questions = teacherSegments.filter((segment) => isQuestionText(segment.text));
  const waitTimes = questions.map((question) => findWaitAfterQuestion(question, segments)).filter((value): value is number => value != null);
  const longPauses = findLongPauses(segments);
  const feedback = classifyFeedback(teacherSegments);
  const languageSignals = detectLanguageSignals(teacherSegments);
  const densitySignals = detectInformationDensitySignals(teacherSegments);
  const metrics: MetricDraft[] = [
    buildMetric("speech_rate", "语速", calculateSpeechRate(teacherSegments), teacherSegments.map((segment) => segment.id)),
    {
      name: "教师最长连续讲授时长",
      value: round(findLongestTeacherRunMs(teacherSegments) / 1000),
      unit: "seconds",
      segmentIds: teacherSegments.map((segment) => segment.id),
      metadata: { thresholdGapMs: teacherRunGapMs }
    },
    {
      name: "长停顿次数",
      value: longPauses.length,
      unit: "count",
      segmentIds: longPauses.flatMap((pause) => pause.segmentIds),
      metadata: {
        thresholdMs: longPauseMs,
        maxPauseSeconds: round(Math.max(...longPauses.map((pause) => pause.durationMs), 0) / 1000),
        samples: longPauses.slice(0, 5)
      }
    },
    {
      name: "教师问题数量",
      value: questions.length,
      unit: "count",
      segmentIds: questions.map((segment) => segment.id),
      metadata: { samples: questions.slice(0, 5).map((segment) => segment.text) }
    },
    {
      name: "问题后平均等待时间",
      value: round(average(waitTimes) / 1000),
      unit: "seconds",
      segmentIds: questions.map((segment) => segment.id),
      metadata: {
        measuredQuestionCount: waitTimes.length,
        maxWaitSeconds: round(Math.max(...waitTimes, 0) / 1000)
      }
    },
    {
      name: "学生回答或齐答次数",
      value: studentSegments.length,
      unit: "count",
      segmentIds: studentSegments.map((segment) => segment.id),
      metadata: {
        choralResponseCount: studentSegments.filter((segment) => /齐答|一起|全班|大家|同学们/.test(segment.speakerLabel || segment.text)).length,
        samples: studentSegments.slice(0, 5).map((segment) => segment.text)
      }
    },
    {
      name: "教师正向反馈次数",
      value: feedback.positive.length,
      unit: "count",
      segmentIds: feedback.positive.map((segment) => segment.id),
      metadata: { samples: feedback.positive.slice(0, 5).map((segment) => segment.text) }
    },
    {
      name: "教师纠错或追问反馈次数",
      value: feedback.corrective.length + feedback.prompting.length,
      unit: "count",
      segmentIds: [...feedback.corrective, ...feedback.prompting].map((segment) => segment.id),
      metadata: {
        correctiveCount: feedback.corrective.length,
        promptingCount: feedback.prompting.length,
        samples: [...feedback.corrective, ...feedback.prompting].slice(0, 5).map((segment) => segment.text)
      }
    },
    {
      name: "填充词次数",
      value: languageSignals.fillerCount,
      unit: "count",
      segmentIds: languageSignals.segmentIds,
      metadata: { samples: languageSignals.samples }
    },
    {
      name: "笼统理解检查次数",
      value: languageSignals.broadCheckCount,
      unit: "count",
      segmentIds: languageSignals.segmentIds,
      metadata: { samples: languageSignals.samples }
    },
    {
      name: "模糊指代次数",
      value: languageSignals.vagueReferenceCount,
      unit: "count",
      segmentIds: languageSignals.segmentIds,
      metadata: { samples: languageSignals.samples }
    },
    {
      name: "信息密度提示",
      value: densitySignals.length,
      unit: "count",
      segmentIds: densitySignals.map((signal) => signal.segmentId),
      metadata: { signals: densitySignals }
    },
    ...buildStructureMetrics(input.lessonSections || segmentsToSingleSection(segments))
  ];

  return metrics.map((metric, index) => ({
    id: metricKey(metric.name, index),
    ...metric
  }));
}

function buildMetric(name: string, label: string, value: { value: number; unit?: string }, segmentIds: string[]): MetricDraft {
  return { name: label, value: value.value, unit: value.unit, segmentIds };
}

function buildStructureMetrics(sections: Array<LessonSection | TranscriptSegment>): MetricDraft[] {
  const totalMs = sections.reduce((sum, section) => sum + Math.max(section.endMs - section.startMs, 0), 0);
  return sections.slice(0, 8).map((section, index) => ({
    name: `课堂结构时间分布：${"title" in section ? section.title : `片段 ${index + 1}`}`,
    value: totalMs ? round((Math.max(section.endMs - section.startMs, 0) / totalMs) * 100) : 0,
    unit: "percent",
    segmentIds: section.id ? [section.id] : [],
    metadata: {
      durationSeconds: round(Math.max(section.endMs - section.startMs, 0) / 1000),
      startMs: section.startMs,
      endMs: section.endMs
    }
  }));
}

function segmentsToSingleSection(segments: TranscriptSegment[]) {
  if (!segments.length) return [];
  return [{
    id: "whole_lesson",
    startMs: segments[0].startMs,
    endMs: segments[segments.length - 1].endMs,
    text: segments.map((segment) => segment.text).join("\n")
  }];
}

function isTeacherSegment(segment: TranscriptSegment) {
  const label = segment.speakerLabel || "";
  if (/学生|同学|student|生/i.test(label)) return false;
  return /老师|教师|teacher|师/i.test(label) || !label || /speaker\s*0?1/i.test(label);
}

function isStudentSegment(segment: TranscriptSegment) {
  return /学生|同学|student|生/i.test(segment.speakerLabel || "");
}

function isQuestionText(text: string) {
  return /[?？]|为什么|怎么|怎样|什么|哪|几|多少|能不能|是不是|对不对|会不会|请问|谁来|谁能|想一想|说明什么/.test(text);
}

function findWaitAfterQuestion(question: TranscriptSegment, segments: TranscriptSegment[]) {
  const next = segments.find((segment) => segment.startMs >= question.endMs && segment.id !== question.id);
  if (!next) return null;
  return Math.max(next.startMs - question.endMs, 0);
}

function findLongPauses(segments: TranscriptSegment[]) {
  const pauses: Array<{ durationMs: number; segmentIds: string[]; afterMs: number; beforeMs: number }> = [];
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const gap = current.startMs - previous.endMs;
    if (gap >= longPauseMs) {
      pauses.push({ durationMs: gap, segmentIds: [previous.id, current.id], afterMs: previous.endMs, beforeMs: current.startMs });
    }
  }
  return pauses;
}

function findLongestTeacherRunMs(teacherSegments: TranscriptSegment[]) {
  let longest = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;
  for (const segment of teacherSegments) {
    if (currentStart == null || segment.startMs - currentEnd > teacherRunGapMs || isQuestionText(segment.text)) {
      longest = Math.max(longest, currentEnd - (currentStart ?? currentEnd));
      currentStart = segment.startMs;
    }
    currentEnd = segment.endMs;
  }
  return Math.max(longest, currentEnd - (currentStart ?? currentEnd));
}

function classifyFeedback(teacherSegments: TranscriptSegment[]) {
  return {
    positive: teacherSegments.filter((segment) => /很好|不错|对了|答得好|很好啊|可以|正确/.test(segment.text)),
    corrective: teacherSegments.filter((segment) => /不对|不完全|错|再看|注意|不是|问题在/.test(segment.text)),
    prompting: teacherSegments.filter((segment) => /再想想|为什么|怎么得到|能不能补充|还有吗|继续/.test(segment.text))
  };
}

function detectLanguageSignals(teacherSegments: TranscriptSegment[]) {
  const signals = teacherSegments.map((segment) => {
    const fillerCount = countMatches(segment.text, /嗯|呃|啊|这个|那个|就是|然后/g);
    const broadCheckCount = countMatches(segment.text, /听懂了吗|明白了吗|会了吗|懂了没有|是不是都会了/g);
    const vagueReferenceCount = countMatches(segment.text, /这个东西|那个地方|这样|那样|这个题|这一步/g);
    return { segment, fillerCount, broadCheckCount, vagueReferenceCount };
  }).filter((item) => item.fillerCount || item.broadCheckCount || item.vagueReferenceCount);
  return {
    fillerCount: signals.reduce((sum, item) => sum + item.fillerCount, 0),
    broadCheckCount: signals.reduce((sum, item) => sum + item.broadCheckCount, 0),
    vagueReferenceCount: signals.reduce((sum, item) => sum + item.vagueReferenceCount, 0),
    segmentIds: signals.map((item) => item.segment.id),
    samples: signals.slice(0, 5).map((item) => item.segment.text)
  };
}

function detectInformationDensitySignals(teacherSegments: TranscriptSegment[]) {
  return teacherSegments.flatMap((segment) => {
    const seconds = Math.max((segment.endMs - segment.startMs) / 1000, 1);
    const charsPerSecond = countEffectiveCharacters(segment.text) / seconds;
    const signals: Array<{ segmentId: string; reason: string; sample: string }> = [];
    if (charsPerSecond >= 4.2 && segment.text.length >= 40) {
      signals.push({ segmentId: segment.id, reason: "单位时间信息量偏高", sample: segment.text.slice(0, 120) });
    }
    if (/首先|其次|然后|最后|所以|因为|但是|同时/g.test(segment.text) && segment.text.length >= 80) {
      signals.push({ segmentId: segment.id, reason: "单段连接词和概念推进较密集", sample: segment.text.slice(0, 120) });
    }
    return signals;
  }).slice(0, 12);
}

function countEffectiveCharacters(text: string) {
  return text.replace(/\s|[，。！？、,.!?;；:"“”'（）()]/g, "").length;
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length || 0;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function metricKey(name: string, index: number) {
  return `${index + 1}-${name}`.replace(/[^\w\u4e00-\u9fa5]+/g, "-").slice(0, 80);
}
