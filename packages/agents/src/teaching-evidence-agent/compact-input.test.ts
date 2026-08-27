import assert from "node:assert/strict";
import test from "node:test";
import { buildTeachingEvidenceLlmPayload } from "./compact-input";

test("teaching evidence LLM payload uses compact transcript and avoids duplicate full transcript fields", () => {
  const payload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-1",
    lesson_format: "offline_classroom_recording",
    transcriptSegments: [{
      id: "sent-1",
      startMs: 1000,
      endMs: 3000,
      speakerLabel: "教师",
      text: "同学们，我们先观察这个分数图。",
      confidence: 0.91
    }],
    metrics: [{
      id: "m1",
      name: "teacherTalkRatio",
      value: 0.72,
      unit: "%"
    }],
    classroomEvents: [{
      id: "e1",
      type: "teacher_question",
      startMs: 1000,
      endMs: 3000,
      transcriptSegmentIds: ["sent-1"],
      quote: "同学们，我们先观察这个分数图。",
      confidenceLabel: "high"
    }],
    generationConfig: { language: "zh-CN", maxEvidenceCards: 6, minimumConfidence: "low" }
  });

  assert.equal("transcriptSegments" in payload, false);
  assert.equal("instruction" in payload, true);
  assert.deepEqual(payload.t[0], ["sent-1", 1000, 3000, "T", "同学们，我们先观察这个分数图。", 0.91]);
  assert.deepEqual(payload.sp, { T: "teacher", S: "student", G: "students", M: "multiple", U: "unknown" });
  assert.deepEqual(payload.raw[0], ["sent-1", "同学们，我们先观察这个分数图。"]);
});
