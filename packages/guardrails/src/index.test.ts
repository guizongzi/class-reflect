import assert from "node:assert/strict";
import test from "node:test";
import type { TeachingEvidenceCard, TranscriptSegment } from "@class-reflect/shared-types";
import { resolveTeachingEvidenceCardTiming, validateTeachingEvidenceCard } from "./index";

const transcriptSegments: TranscriptSegment[] = [{
  id: "sent-1",
  startMs: 1000,
  endMs: 3000,
  speakerLabel: "教师",
  text: "我们先观察图形中的角平分线。",
  confidence: 0.92
}];

const baseCard: TeachingEvidenceCard = {
  id: "card-1",
  category: "lesson_structure",
  sentiment: "positive",
  title: "围绕图形条件展开讲解",
  fact: "教师引导学生先观察角平分线。",
  interpretation: "该片段显示讲解从题目条件进入。",
  startMs: 1000,
  endMs: 3000,
  quote: "我们先观察图形中的角平分线。",
  transcriptSegmentIds: ["sent-1"],
  metricIds: [],
  classroomEventIds: [],
  applicableLessonFormats: ["offline_classroom_recording", "live_online_class", "recorded_online_class", "teacher_certification_interview"],
  confidence: "high",
  uncertaintyNote: null,
  reviewStatus: "pending_review"
};

test("teaching evidence card validation does not require suggestions from evidence generation", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "offline_classroom_recording",
    card: baseCard,
    transcriptSegments
  });

  assert.deepEqual(result, { valid: true });
});

test("teaching evidence card validation rejects source ids that are not in the transcript", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "offline_classroom_recording",
    card: { ...baseCard, transcriptSegmentIds: ["missing-sent"] },
    transcriptSegments
  });

  assert.deepEqual(result, { valid: false, reason: "evidence_unknown_transcript_segment" });
});

test("teaching evidence card validation accepts summary quotes when source ids exist", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "offline_classroom_recording",
    card: { ...baseCard, quote: "教师从图形观察进入条件分析。" },
    transcriptSegments
  });

  assert.deepEqual(result, { valid: true });
});

test("teaching evidence card validation resolves incorrect LLM time ranges from referenced transcript", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "offline_classroom_recording",
    card: { ...baseCard, startMs: 0, endMs: 4000 },
    transcriptSegments
  });

  assert.deepEqual(result, { valid: true });
});

test("teaching evidence card timing is resolved from referenced transcript segments", () => {
  const resolved = resolveTeachingEvidenceCardTiming({
    ...baseCard,
    startMs: 0,
    endMs: 0
  }, transcriptSegments);

  assert.equal(resolved.startMs, 1000);
  assert.equal(resolved.endMs, 3000);
});

test("teaching evidence card validation rejects no-student-response claims in recorded materials", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "offline_classroom_recording",
    card: {
      ...baseCard,
      category: "learning_check_level",
      sentiment: "negative",
      title: "缺乏实质性学生参与验证",
      fact: "教师有连续提问，但该录播片段里没有真实学生回应证据。",
      interpretation: "由于缺乏真实学生互动反馈，无法检测学生掌握情况。"
    },
    transcriptSegments
  });

  assert.deepEqual(result, { valid: false, reason: "not_applicable_to_evaluation_scene" });
});

test("teaching evidence card validation rejects realtime categories for recorded online classes", () => {
  for (const category of ["feedback_quality", "follow_up", "misconception_handling"] as const) {
    const result = validateTeachingEvidenceCard({
      lesson_format: "recorded_online_class",
      card: {
        ...baseCard,
        category,
        sentiment: "negative",
        title: "实时回应不足",
        fact: "教师没有根据学生回答继续追问。",
        interpretation: "该判断依赖实时学生回应，不适用于录播课。"
      },
      transcriptSegments
    });

    assert.deepEqual(result, { valid: false, reason: "not_applicable_to_evaluation_scene" });
  }
});

test("teaching evidence card validation allows recorded lesson quality negatives that do not criticize missing live interaction", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "recorded_online_class",
    card: {
      ...baseCard,
      category: "explanation_quality",
      sentiment: "negative",
      title: "解释跳步",
      fact: "教师直接给出辅助线结论，但没有说明为什么想到这条辅助线。",
      interpretation: "这个证据指向解释过程的可改善行为，而不是批评录播课没有实时互动。",
      analysis: {
        evidenceCategory: "explanation_quality",
        reasonTags: ["reasoning_gap"],
        internalReason: "结论与理由之间缺少中间推理。"
      }
    },
    transcriptSegments
  });

  assert.deepEqual(result, { valid: true });
});

test("teaching evidence card validation treats teacher certification interview as simulated no-real-student format", () => {
  const waitResult = validateTeachingEvidenceCard({
    lesson_format: "teacher_certification_interview",
    card: {
      ...baseCard,
      category: "wait_time",
      sentiment: "negative",
      title: "等待不足",
      fact: "教师没有等待真实学生回答。",
      interpretation: "该判断把无真实学生的试讲形式当成教师问题。"
    },
    transcriptSegments
  });
  assert.deepEqual(waitResult, { valid: false, reason: "not_applicable_to_evaluation_scene" });

  const qualityResult = validateTeachingEvidenceCard({
    lesson_format: "teacher_certification_interview",
    card: {
      ...baseCard,
      category: "explanation_quality",
      sentiment: "negative",
      title: "解释跳步",
      fact: "教师直接给出结论，没有说明关键条件如何推出下一步。",
      interpretation: "该证据评价试讲解释质量，而不是批评没有真实学生。"
    },
    transcriptSegments
  });
  assert.deepEqual(qualityResult, { valid: true });
});

test("teaching evidence card validation keeps legacy teacher qualification demo alias compatible", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "teacher_qualification_demo",
    card: {
      ...baseCard,
      category: "explanation_quality",
      sentiment: "negative",
      title: "解释跳步",
      fact: "教师直接给出结论，没有说明关键条件如何推出下一步。",
      interpretation: "该证据评价试讲解释质量，而不是批评没有真实学生。"
    },
    transcriptSegments
  });
  assert.deepEqual(result, { valid: true });
});

test("teaching evidence card validation disables feedback quality in teacher certification interview", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "teacher_certification_interview",
    card: {
      ...baseCard,
      category: "feedback_quality",
      sentiment: "negative",
      title: "模拟反馈较空泛",
      fact: "教师在模拟学生回答后只说“很好”，没有解释为什么这个回答有效。",
      interpretation: "该证据评价试讲中的模拟反馈质量，而不是批评没有真实学生互动。",
      analysis: {
        evidenceCategory: "feedback_quality",
        reasonTags: ["generic_feedback"],
        internalReason: "模拟反馈缺少对回答理由的回应。"
      }
    },
    transcriptSegments
  });

  assert.deepEqual(result, { valid: false, reason:"not_applicable_to_evaluation_scene" });
});

test("teaching evidence card validation disables simulated interaction critique in teacher certification interview", () => {
  const result = validateTeachingEvidenceCard({
    lesson_format: "teacher_certification_interview",
    card: {
      ...baseCard,
      category: "simulated_interaction_quality",
      sentiment: "negative",
      title: "模拟互动机械",
      fact: "教师预设所有模拟学生回答，并自问自答完成例题。",
      interpretation: "该证据评价试讲中的模拟互动设计质量。",
      analysis: {
        evidenceCategory: "simulated_interaction_quality",
        reasonTags: ["scripted_student_response", "performative_questioning"],
        internalReason: "模拟学生回答没有影响后续教学推进。"
      }
    },
    transcriptSegments
  });

  assert.deepEqual(result, { valid: false, reason:"not_applicable_to_evaluation_scene" });
});

test('presentation-only route rejects realtime feedback despite a permissive generation profile',()=>{
 const r=validateTeachingEvidenceCard({lesson_format:'teacher_certification_interview',card:{...baseCard,category:'feedback_quality',title:'模拟反馈',fact:'教师反馈较少'},transcriptSegments});assert.equal(r.valid,false);
});
