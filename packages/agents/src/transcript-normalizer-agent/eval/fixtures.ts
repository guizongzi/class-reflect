import type { TranscriptNormalizerEvalFixture } from "./types";

export const transcriptNormalizerEvalFixtures: TranscriptNormalizerEvalFixture[] = [
  fixture("teacher_explanation", "正常教师讲解", "同学们我们今天学习分数的意义", { textIncludes: ["。"], changeTypes: ["punctuation"] }, {}, ["teacher"]),
  fixture("filler_words", "语气词", "嗯，这个这个分数呢表示把整体平均分成几份。", {}, {}, ["teacher"], { fillerWordCount: 4, fillerWords: ["嗯", "这个", "这个", "呢"] }),
  fixture("immediate_repetition", "即时重复", "我们看这个这个图形的面积。", {}, { forbiddenTextIncludes: ["面积公式"] }, ["teacher"], { repetitionCount: 1 }),
  fixture("teacher_self_correction", "教师自我修正", "三角形有四条边，不对，是三条边。", {}, {}, ["teacher"], { selfCorrectionCount: 1 }),
  fixture("asr_term_error", "明显 ASR 术语错误", "二氧化碳的化学式是 CO 兔。", { textIncludes: ["CO2"] }, {}, ["teacher"]),
  fixture("math_science_terms", "数学或科学术语", "我们来看等腰三角形的底角相等。", {}, {}, ["teacher"]),
  fixture("student_wrong_answer", "学生错误答案，禁止自动改正确", "二氧化碳的化学式是 CO3。", {}, { forbiddenTextIncludes: ["CO2"] }, ["student"], { possibleAnswer: true }, true),
  fixture("teacher_student_qa", "教师与学生问答", "为什么这里要通分？", {}, {}, ["teacher"], { possibleQuestion: true }),
  fixture("same_student_continuous", "同一学生连续发言", "我觉得要先找公分母。", {}, {}, ["student"], { possibleAnswer: true }),
  fixture("multiple_students", "多个学生分别发言", "我认为答案是三分之一。", {}, {}, ["student"], { possibleAnswer: true }),
  fixture("choral_response", "全班齐答", "懂了！", {}, {}, ["students"], { possibleAnswer: true }),
  fixture("overlapping_speech", "多人重叠", "老师我觉得不是，是这样。", {}, {}, ["multiple"], {}, true),
  fixture("unknown_speaker", "未知说话人", "这一步怎么算？", {}, {}, ["unknown"], { possibleQuestion: true }, true),
  fixture("low_confidence", "低置信度内容", "这个数可能是三，听不清。", {}, {}, ["unknown"], {}, true, false, 0.42),
  fixture("section_transition", "可能的章节转换", "接下来我们开始课堂练习。", {}, {}, ["teacher"], { possibleInstruction: true }),
  fixture("multi_sentence_segment", "一条 ASR Segment 包含多句话", "先观察图形。再回答问题。", {}, {}, ["teacher"], { possibleInstruction: true }),
  fixture("split_sentence_segments", "一句话被拆成多个 Segment", "二氧化碳的化学式", { textIncludes: ["二氧化碳"], changeTypes: ["punctuation"] }, {}, ["teacher"]),
  {
    ...fixture("invalid_llm_output", "无效 LLM 输出", "今天先复习上节课内容。", {}, {}, ["teacher"]),
    invalidMockOutput: { normalizedSegments: [], displaySections: [] }
  }
];

function fixture(
  id: string,
  name: string,
  text: string,
  mustChange: { textIncludes?: string[]; changeTypes?: TranscriptNormalizerEvalFixture["mustChange"][number]["changeTypes"] },
  mustNotChange: { forbiddenTextIncludes?: string[] },
  acceptableSpeakerRoles: TranscriptNormalizerEvalFixture["acceptableSpeakerRoles"],
  expectedDeliveryFeatures: TranscriptNormalizerEvalFixture["expectedDeliveryFeatures"] = {},
  needsHumanReview = false,
  shouldSuggestSectionBoundary = false,
  confidence = 0.88
): TranscriptNormalizerEvalFixture {
  const sentenceId = `sent-${id}`;
  return {
    id,
    name,
    input: [{
      id: sentenceId,
      startMs: 1000,
      endMs: 5000,
      text,
      speakerLabel: acceptableSpeakerRoles[0] === "teacher" ? "说话人 A" : acceptableSpeakerRoles[0] === "students" ? "全班" : null,
      confidence,
      rawSpeakerId: acceptableSpeakerRoles[0] === "unknown" ? null : `raw-${acceptableSpeakerRoles[0]}-1`,
      speakerRoleHint: acceptableSpeakerRoles[0],
      speakerIdentityHintId: acceptableSpeakerRoles[0] === "teacher" ? "spk_teacher_1" : acceptableSpeakerRoles[0] === "student" ? "spk_student_1" : null,
      speakerConfidence: acceptableSpeakerRoles[0] === "unknown" ? 0.2 : 0.75
    }],
    mustChange: mustChange.textIncludes || mustChange.changeTypes ? [{ sentenceId, ...mustChange }] : [],
    mustNotChange: mustNotChange.forbiddenTextIncludes ? [{ sentenceId, ...mustNotChange }] : [],
    acceptableSpeakerRoles,
    acceptableSpeakerIdentityIds: ["spk_teacher_1", "spk_student_1", "spk_student_2", "spk_students", "spk_multiple", "spk_unknown"],
    expectedDeliveryFeatures,
    needsHumanReview,
    shouldSuggestSectionBoundary
  };
}
