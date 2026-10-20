import assert from "node:assert/strict";
import test from "node:test";
import { buildTeachingEvidenceLlmPayload } from "./compact-input";
import { evidenceProfileByLessonFormat } from "./profiles";

test("teaching evidence LLM payload uses compact transcript without per-sentence timestamps", () => {
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
  assert.deepEqual(payload.t[0], ["s0", "T", "同学们，我们先观察这个分数图。", 0.91]);
  assert.equal(JSON.stringify(payload.t).includes("1000"), false);
  assert.equal(JSON.stringify(payload.t).includes("3000"), false);
  assert.equal(JSON.stringify(payload.t).includes("sent-1"), false);
  assert.deepEqual(payload.sp, { T: "teacher", S: "student", G: "students", M: "multiple", U: "unknown" });
  assert.deepEqual(payload.raw[0], ["s0", "同学们，我们先观察这个分数图。"]);
});

test("teaching evidence LLM payload carries a compact profile instead of long lesson-format guidance", () => {
  const payload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-recorded",
    lesson_format: "recorded_online_class",
    transcriptSegments: [{
      id: "sent-1",
      startMs: 1000,
      endMs: 3000,
      speakerLabel: "教师",
      text: "请你先暂停视频，自己想一想辅助线怎么做。",
      confidence: 0.91
    }],
    metrics: [],
    classroomEvents: [],
    generationConfig: { language: "zh-CN" }
  });

  assert.deepEqual(payload.ap, {
    x: ["wait_time", "student_response", "feedback_quality", "response_pattern", "classroom_management", "follow_up", "misconception_handling"],
    p: [
      "lesson_structure",
      "information_density",
      "question_quality",
      "method_generalization",
      "knowledge_connection",
      "structured_review",
      "explanation_quality",
      "cognitive_scaffolding",
      "example_quality"
    ],
    pos: [
      "lesson_structure",
      "question_quality",
      "method_generalization",
      "knowledge_connection",
      "structured_review",
      "explanation_quality",
      "cognitive_scaffolding",
      "example_quality"
    ],
    neg: [
      "question_quality",
      "lesson_structure",
      "information_density",
      "method_generalization",
      "knowledge_connection",
      "structured_review",
      "explanation_quality",
      "cognitive_scaffolding",
      "example_quality"
    ],
    mp: 3,
    mn: 3
  });
  assert.equal(JSON.stringify(payload.ap).includes("录播课"), false);
});

test("evidence profiles prioritize different categories by lesson format", () => {
  assert.equal(evidenceProfileByLessonFormat.offline_classroom_recording.priorityCategories[0], "question_quality");
  assert.equal(evidenceProfileByLessonFormat.live_online_class.priorityCategories[0], "question_quality");
  assert.equal(evidenceProfileByLessonFormat.recorded_online_class.priorityCategories[0], "lesson_structure");
  assert.ok(evidenceProfileByLessonFormat.recorded_online_class.disabledCategories.includes("wait_time"));
  assert.ok(evidenceProfileByLessonFormat.live_online_class.priorityCategories.includes("technical_issue"));
});

test("evidence profiles include teaching-quality negative categories without treating recorded lessons as live classes", () => {
  assert.ok(evidenceProfileByLessonFormat.offline_classroom_recording.negativeCategories.includes("question_quality"));
  assert.ok(evidenceProfileByLessonFormat.offline_classroom_recording.negativeCategories.includes("feedback_quality"));
  assert.ok(evidenceProfileByLessonFormat.offline_classroom_recording.negativeCategories.includes("misconception_handling"));
  assert.ok(evidenceProfileByLessonFormat.offline_classroom_recording.priorityCategories.includes("explanation_quality"));
  assert.ok(evidenceProfileByLessonFormat.offline_classroom_recording.priorityCategories.includes("cognitive_scaffolding"));
  assert.ok(evidenceProfileByLessonFormat.offline_classroom_recording.priorityCategories.includes("example_quality"));

  assert.ok(evidenceProfileByLessonFormat.recorded_online_class.priorityCategories.includes("explanation_quality"));
  assert.ok(evidenceProfileByLessonFormat.recorded_online_class.priorityCategories.includes("cognitive_scaffolding"));
  assert.ok(evidenceProfileByLessonFormat.recorded_online_class.priorityCategories.includes("example_quality"));
  assert.ok(evidenceProfileByLessonFormat.recorded_online_class.negativeCategories.includes("question_quality"));
  assert.ok(evidenceProfileByLessonFormat.recorded_online_class.negativeCategories.includes("method_generalization"));
  assert.equal(new Set<string>(evidenceProfileByLessonFormat.recorded_online_class.priorityCategories).has("misconception_handling"), false);
  assert.ok(evidenceProfileByLessonFormat.recorded_online_class.disabledCategories.includes("feedback_quality"));
  assert.ok(evidenceProfileByLessonFormat.recorded_online_class.disabledCategories.includes("follow_up"));
});

test("teacher certification interview profile treats simulated teaching as no-real-student format", () => {
  const profile = evidenceProfileByLessonFormat.teacher_certification_interview;
  assert.equal(profile.priorityCategories[0], "teaching_objective_alignment");
  assert.ok(profile.priorityCategories.includes("lesson_structure"));
  assert.ok(profile.priorityCategories.includes("question_quality"));
  assert.ok(profile.priorityCategories.includes("simulated_interaction_quality"));
  assert.ok(profile.priorityCategories.includes("feedback_quality"));
  assert.ok(profile.priorityCategories.includes("explanation_quality"));
  assert.ok(profile.priorityCategories.includes("cognitive_scaffolding"));
  assert.ok(profile.priorityCategories.includes("teacher_language"));
  assert.ok(profile.priorityCategories.includes("closure_quality"));
  assert.ok(profile.priorityCategories.includes("teaching_evaluation"));
  assert.ok(profile.priorityCategories.includes("knowledge_accuracy"));
  assert.ok(profile.negativeCategories.includes("question_quality"));
  assert.ok(profile.negativeCategories.includes("feedback_quality"));
  assert.ok(profile.negativeCategories.includes("explanation_quality"));
  assert.ok(profile.disabledCategories.includes("wait_time"));
  assert.ok(profile.disabledCategories.includes("student_response"));
  assert.ok(profile.disabledCategories.includes("response_pattern"));
});

test("teacher qualification demo remains a compatibility alias", () => {
  assert.deepEqual(
    evidenceProfileByLessonFormat.teacher_qualification_demo.priorityCategories,
    evidenceProfileByLessonFormat.teacher_certification_interview.priorityCategories
  );
});

test("teaching evidence instruction only includes the active lesson format rules", () => {
  const offlinePayload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-offline",
    lesson_format: "offline_classroom_recording",
    transcriptSegments: [{
      id: "sent-1",
      startMs: 1000,
      endMs: 3000,
      speakerLabel: "教师",
      text: "这个问题应该怎么想？",
      confidence: 0.91
    }],
    metrics: [],
    classroomEvents: [],
    generationConfig: { language: "zh-CN" }
  });
  assert.equal(offlinePayload.instruction.includes("课型规则：teacher_certification_interview"), false);
  assert.equal(offlinePayload.instruction.includes("recorded_online_class 是录播网课"), false);

  const certificationPayload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-cert",
    lesson_format: "teacher_certification_interview",
    transcriptSegments: [{
      id: "sent-1",
      startMs: 1000,
      endMs: 3000,
      speakerLabel: "教师",
      text: "这位同学认为答案是3，很好，我们继续看原因。",
      confidence: 0.91
    }],
    metrics: [],
    classroomEvents: [],
    generationConfig: { language: "zh-CN" }
  });
  assert.equal(certificationPayload.instruction.includes("teacher_certification_interview 是无真实学生的教资面试模拟试讲"), true);
  assert.equal(certificationPayload.instruction.includes("recorded_online_class 是录播网课"), false);
  assert.equal(certificationPayload.instruction.includes("当同一类别在多个不相邻片段中反复出现，优先拆成多张卡"), true);
  assert.equal(certificationPayload.instruction.includes("不要为了覆盖更多类别而把同一类别只做一张总括卡"), true);
});

test("teaching evidence LLM payload omits delivery feature tags handled by deterministic rules", () => {
  const transcriptSegments = [{
    id: "sent-pace-1",
    startMs: 4000,
    endMs: 7200,
    speakerLabel: "教师",
    text: "那么，嗯，我们先看这个这个图形，好吗？",
    confidence: 0.88,
    deliveryFeatures: {
      fillerWordCount: 3,
      fillerWords: ["那么", "嗯", "这个"],
      repetitionCount: 1,
      selfCorrectionCount: 0,
      incompleteUtterance: false,
      possibleQuestion: true,
      possibleInstruction: true,
      possibleAnswer: false,
      possibleFeedback: false,
      pauseBeforeMs: 1200,
      pauseAfterMs: 800,
      speakerTurnChanged: false
    }
  }];

  const payload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-1",
    lesson_format: "offline_classroom_recording",
    transcriptSegments,
    metrics: [],
    classroomEvents: [],
    generationConfig: { language: "zh-CN" }
  });

  assert.deepEqual(payload.f, [["s0", ["question", "instruction"]]]);
  assert.equal(JSON.stringify(payload.f).includes("那么"), false);
  assert.equal(JSON.stringify(payload.f).includes("1200"), false);
  assert.equal(JSON.stringify(payload.f).includes("filler_high"), false);
  assert.equal(JSON.stringify(payload.f).includes("repetition"), false);
});

test("teaching evidence LLM payload omits neutral delivery features", () => {
  const payload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-1",
    lesson_format: "offline_classroom_recording",
    transcriptSegments: [{
      id: "sent-neutral",
      startMs: 1000,
      endMs: 2000,
      speakerLabel: "教师",
      text: "我们来看下一步。",
      confidence: 0.9,
      deliveryFeatures: {
        fillerWordCount: 0,
        fillerWords: [],
        repetitionCount: 0,
        selfCorrectionCount: 0,
        incompleteUtterance: false,
        possibleQuestion: false,
        possibleInstruction: false,
        possibleAnswer: false,
        possibleFeedback: false,
        pauseBeforeMs: null,
        pauseAfterMs: 300,
        speakerTurnChanged: false
      }
    }],
    metrics: [],
    classroomEvents: [],
    generationConfig: { language: "zh-CN" }
  });

  assert.deepEqual(payload.f, []);
});

test("teaching evidence LLM payload filters categories already handled by deterministic rules", () => {
  const payload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-1",
    lesson_format: "offline_classroom_recording",
    transcriptSegments: [{
      id: "sent-1",
      startMs: 1000,
      endMs: 3000,
      speakerLabel: "教师",
      text: "那这个问题应该怎么想？",
      confidence: 0.9
    }],
    metrics: [],
    classroomEvents: [],
    generationConfig: {
      language: "zh-CN",
      enabledCategories: ["question_quality", "wait_time", "response_pattern", "classroom_management", "feedback_quality"]
    }
  });

  assert.deepEqual(payload.generationConfig?.enabledCategories, ["question_quality", "feedback_quality"]);
  const priorityCategories = new Set<string>(payload.ap.p);
  assert.equal(priorityCategories.has("wait_time"), false);
  assert.equal(priorityCategories.has("response_pattern"), false);
  assert.equal(priorityCategories.has("classroom_management"), false);
});

test("teaching evidence LLM payload omits report-only capability and summary fields", () => {
  const payload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-1",
    lesson_format: "offline_classroom_recording",
    capabilityMatrix: {
      canObserveTeacherSpeech: true,
      canObserveStudentSpeech: true,
      canDistinguishIndividualResponse: true,
      canDistinguishChoralResponse: true,
      canDetectTeacherSelfAnswer: true,
      canMeasureWaitTime: true,
      canAnalyzeClassroomManagementLanguage: true,
      canAnalyzeLearningCheckLevel: true,
      canAnalyzeLiveAudioInteraction: false,
      canAnalyzeChatInteraction: false,
      canAnalyzePlatformInteraction: false,
      canAnalyzeSpeechRate: true,
      canAnalyzeInformationDensity: true,
      canAnalyzeSelfCheckPrompt: true
    },
    transcriptSegments: [{
      id: "sent-1",
      startMs: 1000,
      endMs: 3000,
      speakerLabel: "教师",
      text: "那这个问题应该怎么想？",
      confidence: 0.9
    }],
    metrics: [],
    classroomEvents: [],
    generationConfig: { language: "zh-CN", enabledCategories: ["question_quality"] }
  });

  assert.equal("capabilityMatrix" in payload, false);
  assert.equal(JSON.stringify(payload).includes("skippedCategories"), false);
  assert.equal(JSON.stringify(payload).includes("generationSummary"), false);
});

test("teaching evidence LLM payload scales default evidence limit by lesson duration", () => {
  const payload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-long",
    lesson_format: "offline_classroom_recording",
    transcriptSegments: [
      {
        id: "sent-start",
        startMs: 0,
        endMs: 2000,
        speakerLabel: "教师",
        text: "我们先看第一个问题。",
        confidence: 0.9
      },
      {
        id: "sent-end",
        startMs: 7_198_000,
        endMs: 7_200_000,
        speakerLabel: "教师",
        text: "这节课最后做一个总结。",
        confidence: 0.9
      }
    ],
    metrics: [],
    classroomEvents: [],
    generationConfig: { language: "zh-CN" }
  });

  assert.equal(payload.generationConfig?.maxEvidenceCards, 32);
});

test("teaching evidence LLM payload keeps explicit evidence limit when caller provides one", () => {
  const payload = buildTeachingEvidenceLlmPayload({
    lessonId: "lesson-explicit-limit",
    lesson_format: "teacher_certification_interview",
    transcriptSegments: [
      {
        id: "sent-start",
        startMs: 0,
        endMs: 2000,
        speakerLabel: "教师",
        text: "今天我们学习平行线的性质。",
        confidence: 0.9
      },
      {
        id: "sent-end",
        startMs: 1_798_000,
        endMs: 1_800_000,
        speakerLabel: "教师",
        text: "这节课就到这里。",
        confidence: 0.9
      }
    ],
    metrics: [],
    classroomEvents: [],
    generationConfig: { language: "zh-CN", maxEvidenceCards: 8 }
  });

  assert.equal(payload.generationConfig?.maxEvidenceCards, 8);
});
