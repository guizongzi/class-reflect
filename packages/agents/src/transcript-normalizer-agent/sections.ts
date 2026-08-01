import type { LessonSection, TranscriptSegment } from "@class-reflect/shared-types";
import {
  activityBoundary,
  countDisplayCharacters,
  displayTextForSegment,
  msToClock,
  speakerTurnStartsNewBlock
} from "./text-utils";

export function buildDisplayTranscriptSections(segments: TranscriptSegment[]): LessonSection[] {
  if (!segments.length) return [];
  const sections: LessonSection[] = [];
  let current: TranscriptSegment[] = [];

  for (const segment of segments) {
    const previous = current[current.length - 1];
    const currentTextLength = countDisplayCharacters(current);
    const nextTextLength = currentTextLength + displayTextForSegment(segment).length;
    const gapMs = previous ? Math.max(segment.startMs - previous.endMs, 0) : 0;
    const shouldClose = current.length > 0 && (
      nextTextLength > 500 ||
      gapMs >= 15_000 ||
      speakerTurnStartsNewBlock(previous, segment, currentTextLength) ||
      activityBoundary(previous.text, segment.text)
    );

    if (shouldClose) {
      sections.push(makeTranscriptSection(current, sections.length));
      current = [];
    }
    current.push(segment);
  }
  if (current.length) sections.push(makeTranscriptSection(current, sections.length));
  return sections;
}

function makeTranscriptSection(segments: TranscriptSegment[], index: number): LessonSection {
  const startMs = segments[0]?.startMs ?? 0;
  const endMs = segments[segments.length - 1]?.endMs ?? startMs;
  const text = segments.map((segment) => (
    `${msToClock(segment.startMs)}-${msToClock(segment.endMs)} ${segment.speakerLabel || "未知"}：${displayTextForSegment(segment)}`
  )).join("\n");
  return {
    startMs,
    endMs,
    title: inferTranscriptSectionTitle(segments, index),
    summaryText: text,
    confidenceLabel: segments.some((segment) => (segment.confidence ?? 1) < 0.65) ? "含低置信句" : "机器整理",
    tags: inferTranscriptSectionTags(segments),
    transcriptSegmentIds: segments.map((segment) => segment.id)
  };
}

function inferTranscriptSectionTitle(segments: TranscriptSegment[], index: number) {
  const text = normalizeTitleText(segments.map((segment) => segment.text).join(""));
  const keyword = inferTranscriptKeyword(text);
  const activity = inferTranscriptActivityLabel(text, index);
  return keyword ? `${activity}：${keyword}` : activity;
}

function inferTranscriptActivityLabel(text: string, index: number) {
  if (/上节课|复习|回顾|今天.*(学习|来看|研究)|导入|先来看/.test(text)) return "导入与复习";
  if (/概念|意义|性质|定义|表示|叫作|是什么|怎么理解/.test(text)) return "概念讲解";
  if (/为什么|怎么|谁来说|谁能|请.*回答|想一想|哪.*相等|是不是|对不对/.test(text)) return "问题探究";
  if (/因为|所以|由此|可以得到|推出|说明|证明|理由|依据/.test(text)) return "推理说明";
  if (/方法|步骤|规律|可以用|一般|归纳|总结出|以后遇到/.test(text)) return "方法归纳";
  if (/练习|判断|算一算|写一写|完成|试一试|做一做|例题|题目/.test(text)) return "练习讲评";
  if (/同学们|请大家|打开|拿出|看屏幕|小组|讨论|坐好|安静/.test(text)) return "课堂组织";
  if (/总结|作业|下节课|今天学|回家|课后/.test(text)) return "总结与作业";
  return index === 0 ? "课堂导入" : "课堂推进";
}

function inferTranscriptKeyword(text: string) {
  const patterns = [
    /([一二三四五六七八九十\d]+)\s*[、.．]?\s*([^。！？?，,；;]{2,16})/,
    /(分数的意义|分数单位|对数函数|函数图象|角平分线|三角形|等腰三角形|面积|方程|比例|小数|整数|百分数)/,
    /(图象和性质|图中的[^。！？?，,；;]{2,14}|这个方法|这种方法|这道题|这个问题|这两个角|这条线|这个答案)/,
    /(先[^。！？?，,；;]{2,14}|接下来[^。！？?，,；;]{2,14}|下面[^。！？?，,；;]{2,14})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = normalizeTitleText(match?.[2] || match?.[1] || "");
    if (isMeaningfulTitleKeyword(value)) return trimTitleKeyword(value);
  }
  const phrase = text
    .split(/[。！？?，,；;\n]/)
    .map((item) => normalizeTitleText(item))
    .find(isMeaningfulTitleKeyword);
  return phrase ? trimTitleKeyword(phrase) : "";
}

function normalizeTitleText(text: string) {
  return text
    .replace(/\s+/g, "")
    .replace(/^(嗯|啊|呃|额|那个|这个|那么|那|好|哎)[，,、。]*/g, "")
    .trim();
}

function isMeaningfulTitleKeyword(value: string) {
  if (value.length < 2) return false;
  if (/^(老师|教师|学生|同学们|我们|大家|然后|接下来|首先|那么|那|这个|那个|就是|可以|看看|来说)$/.test(value)) return false;
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(value);
}

function trimTitleKeyword(value: string) {
  return value
    .replace(/^(我们|大家|同学们|先|再|来|看一下|来看|说一下|想一想|请你?)/, "")
    .replace(/[。！？?，,；;：:、]+$/g, "")
    .slice(0, 16);
}

function inferTranscriptSectionTags(segments: TranscriptSegment[]) {
  const text = segments.map((segment) => segment.text).join("");
  const tags: string[] = [];
  if (/[？?]|为什么|谁来说|请.*回答/.test(text)) tags.push("含提问");
  if (/学生|全班/.test(segments.map((segment) => segment.speakerLabel).join(""))) tags.push("含学生回应");
  if (/练习|判断|算一算|写一写/.test(text)) tags.push("练习");
  if (/总结|回顾/.test(text)) tags.push("总结");
  return tags;
}
