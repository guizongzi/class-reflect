import type { TranscriptSegment } from "@class-reflect/shared-types";

export function scoreTeacherLikelihood(text: string) {
  let score = 0;
  if (/请大家|我们来看|想一想|回答|举手|翻到|开始|停|安静/.test(text)) score += 2;
  if (/为什么|怎么|什么|哪|几|是不是|对不对/.test(text)) score += 1.5;
  if (/很好|不错|对了|再想想|哪里不对|总结/.test(text)) score += 1.5;
  if (/同学们|孩子们|老师/.test(text)) score += 1;
  return score;
}

export function isLikelyChoralText(text: string) {
  const compact = text.replace(/\s+/g, "");
  return /^(懂了|会了|明白了|对|是|不是|好|可以)[。！!？?]?$/.test(compact);
}

export function displayTextForSegment(segment: TranscriptSegment) {
  return (segment.text || "")
    .replace(/^(嗯|啊|呃|额|那个|这个)[，,、\s]*/g, "")
    .replace(/([，,、])?(这个|那个)\2([，,、])/g, "$2$3")
    .trim();
}

export function countDisplayCharacters(segments: TranscriptSegment[]) {
  return segments.reduce((sum, segment) => sum + displayTextForSegment(segment).length, 0);
}

export function speakerTurnStartsNewBlock(previous: TranscriptSegment, segment: TranscriptSegment, currentTextLength: number) {
  if ((previous.speakerLabel || "") === (segment.speakerLabel || "")) return false;
  if (currentTextLength < 120) return false;
  return isTeacherLikeSegment(previous) !== isTeacherLikeSegment(segment);
}

export function activityBoundary(previousText = "", currentText = "") {
  const value = `${previousText} ${currentText}`;
  return /接下来|下面|现在我们|开始练习|小组讨论|总结一下|回顾一下|请大家|谁来说|为什么|再来看/.test(value);
}

export function inferTranscriptFlags(segment: TranscriptSegment) {
  const flags: string[] = [];
  const text = segment.text || "";
  if (/嗯|呃|额|那个|这个/.test(text)) flags.push("filler_words");
  if (/([一-龥]{1,4})[，,、]?\1/.test(text)) flags.push("repetition");
  if (/[？?]|为什么|怎么|什么|哪|几|是不是|对不对/.test(text)) flags.push("question");
  if ((segment.confidence ?? 1) < 0.65) flags.push("low_confidence");
  if ((segment.endMs - segment.startMs) > 20_000 && text.length < 8) flags.push("timing_uncertain");
  return flags;
}

export function msToClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function isTeacherLikeSegment(segment: TranscriptSegment) {
  const label = segment.speakerLabel || "";
  if (/学生|全班|齐答/.test(label)) return false;
  return /教师|老师|teacher/i.test(label) || scoreTeacherLikelihood(segment.text || "") >= 1.5;
}
