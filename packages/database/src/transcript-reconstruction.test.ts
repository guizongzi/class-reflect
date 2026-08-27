import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLessonSpeakerRegistry,
  reconstructTranscriptSentences
} from "./transcript-reconstruction";

test("speaker registry identifies teacher and keeps student labels stable within a lesson", () => {
  const registry = buildLessonSpeakerRegistry([
    segment("raw-teacher", "老师", "请大家看黑板。", 0, 1000),
    segment("raw-student-a", "说话人 B", "我觉得先通分。", 1200, 1800),
    segment("raw-student-a", "说话人 B", "然后再比较。", 1900, 2500),
    segment("raw-student-b", "说话人 C", "答案是三分之一。", 2600, 3300)
  ], { lessonId: "lesson-1" });

  assert.equal(registry.identities.find((identity) => identity.rawSpeakerIds.includes("raw-teacher"))?.role, "teacher");
  assert.equal(registry.identities.find((identity) => identity.rawSpeakerIds.includes("raw-student-a"))?.displayLabel, "学生 A");
  assert.equal(registry.identities.find((identity) => identity.rawSpeakerIds.includes("raw-student-b"))?.displayLabel, "学生 B");
  assert.equal(registry.resolveRawSpeaker("raw-student-a")?.id, registry.resolveRawSpeaker("raw-student-a")?.id);
});

test("speaker registry handles choral response, overlap, unknown, and teacher override globally", () => {
  const registry = buildLessonSpeakerRegistry([
    segment("raw-choral", "全班", "懂了！", 0, 800),
    segment("raw-overlap", "多人重叠", "老师我觉得不是。", 1000, 1800),
    segment(null, null, "这一步怎么算？", 2000, 2800),
    segment("raw-x", "说话人 X", "请同学们回答。", 3000, 3800)
  ], {
    lessonId: "lesson-2",
    teacherOverrides: { "raw-x": "teacher_manual" }
  });

  assert.equal(registry.resolveRawSpeaker("raw-choral")?.role, "students");
  assert.equal(registry.resolveRawSpeaker("raw-overlap")?.role, "multiple");
  assert.equal(registry.resolveRawSpeaker(null)?.role, "unknown");
  assert.deepEqual(registry.resolveRawSpeaker("raw-x"), {
    id: "teacher_manual",
    role: "teacher",
    rawSpeakerIds: ["raw-x"],
    displayLabel: "教师",
    confidence: 1,
    source: "teacher",
    locked: true
  });
});

test("sentence reconstruction splits multi-sentence segments and tracks source mappings", () => {
  const result = reconstructTranscriptSentences([
    segment("raw-teacher", "老师", "先观察图形。再回答问题。", 0, 4000)
  ], { lessonId: "lesson-3", videoId: "video-1" });

  assert.equal(result.sentences.length, 2);
  assert.deepEqual(result.sentences.map((sentence) => sentence.rawText), ["先观察图形。", "再回答问题。"]);
  assert.deepEqual(result.sentences.map((sentence) => sentence.sourceSegmentIds), [["seg-0"], ["seg-0"]]);
  assert.equal(result.sentenceMappings[0].relation, "split");
  assert.equal(result.sentences[0].timingPrecision, "estimated");
});

test("sentence reconstruction merges split sentences across segments without crossing speaker changes", () => {
  const result = reconstructTranscriptSentences([
    segment("raw-teacher", "老师", "二氧化碳的化学式", 0, 1000),
    segment("raw-teacher", "老师", "是 CO2。", 1100, 1900),
    segment("raw-student", "学生", "我知道了。", 2100, 2600)
  ], { lessonId: "lesson-4", videoId: "video-1" });

  assert.equal(result.sentences.length, 2);
  assert.equal(result.sentences[0].rawText, "二氧化碳的化学式是 CO2。");
  assert.deepEqual(result.sentences[0].sourceSegmentIds, ["seg-0", "seg-1"]);
  assert.equal(result.sentences[0].timingPrecision, "merged");
  assert.equal(result.sentenceMappings[0].relation, "merged");
});

test("sentence reconstruction marks long pause, self correction, short answers, and uncertain boundaries", () => {
  const result = reconstructTranscriptSentences([
    segment("raw-teacher", "老师", "三角形有四条边，不对，是三条边。", 0, 3000),
    segment("raw-student", "学生", "对。", 8000, 8500),
    segment("raw-teacher", "老师", "为什么？", 8600, 9400),
    segment("raw-student", "学生", "因为", 9500, 9800)
  ], { lessonId: "lesson-5", videoId: "video-1", longPauseMs: 3000 });

  assert.equal(result.sentences[0].deliveryFeatures.selfCorrectionCount, 1);
  assert.equal(result.sentences[1].deliveryFeatures.pauseBeforeMs, 5000);
  assert.equal(result.sentences[1].deliveryFeatures.possibleAnswer, true);
  assert.equal(result.sentences[2].deliveryFeatures.possibleQuestion, true);
  assert.equal(result.sentences[3].requiresReview, true);
  assert.equal(result.sentences[3].timingPrecision, "estimated");
});

function segment(rawSpeakerId: string | null, speakerLabel: string | null, text: string, startMs: number, endMs: number) {
  return {
    id: `seg-${startMs / 1000}`,
    startMs,
    endMs,
    text,
    speakerLabel,
    speakerId: rawSpeakerId,
    confidence: 0.9
  };
}
