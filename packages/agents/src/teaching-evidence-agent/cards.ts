import type { InstructionalContext, TeachingEvidenceCard, TranscriptSegment } from "@class-reflect/shared-types";
import type { TeachingEvidenceInput } from "../types";
import {
  buildManagementExample,
  buildManagementObservation,
  buildManagementSuggestion,
  buildMethodExample,
  buildMethodObservation,
  buildMethodSuggestion,
  evidenceCard,
  findAdjacentPair,
  formatTime,
  hasQuestionMarker,
  inferLearningCheckLevel,
  inferLearningCheckType,
  inferResponsePattern,
  isClassroomManagementText,
  isTeacher,
  learningCheck,
  matchesAny,
  trimQuote
} from "./helpers";

export function buildOralConfirmationCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  const pair = findAdjacentPair(segments, (current, next) =>
    isTeacher(current) &&
    matchesAny(current.text, [/听懂了吗/, /会了吗/, /明白了吗/, /没问题吧/, /清楚了吗/, /对不对/, /是不是/]) &&
    Boolean(next) &&
    !isTeacher(next) &&
    matchesAny(next.text, [/懂了?/, /会了?/, /明白/, /没问题/, /^对[。！!]?$/, /^是[。！!]?$/])
  );
  if (!pair) return null;
  const [question, response] = pair;
  return evidenceCard(input, {
    category: "learning_check_level",
    title: "课堂检查采用口头确认",
    fact: `教师在${formatTime(question.startMs)}进行口头确认，随后可听见学生回应。`,
    interpretation: `教师用“${trimQuote(question.text)}”快速确认学生回应，随后听到了“${trimQuote(response.text)}”一类短答。这个环节能看到课堂有即时回应，但还不容易看出学生具体是怎样理解的。`,
    suggestion: `在这类口头确认后，可以接一句更具体的问题，例如：“谁能说说刚才这一步为什么这样做？”这样可以继续观察学生是否能说出理由。`,
    sentiment: "neutral",
    segments: [question, response],
    confidence: "medium",
    uncertaintyNote: "集体或短促回应无法确认每名学生的实际理解情况。",
    learningCheck: learningCheck(1, "oral_confirmation", inferResponsePattern(response, input.lesson_format), "very_weak", "齐答或短促回应只能证明出现了口头回应，不能证明个体理解。"),
    analysis: {
      evidenceCategory: "learning_check_level",
      utteranceType: "oral_confirmation",
      includedInQuestionCount: true,
      includedInInteractionCount: true,
      evidenceStrength: "very_weak",
      internalReason: "口头确认与短答可作为互动信号，但不能作为个体理解证据。",
      suggestionDirection: "extend_oral_confirmation_to_reasoning"
    },
    teacherView: {
      title: "口头确认后有学生回应",
      observation: `教师用“${trimQuote(question.text)}”确认学生是否跟上，随后听到了学生回应。`,
      teachingMeaning: "这个片段能看到学生有即时反馈；如果想进一步了解学生是否真的理解，可以让学生说出一个理由或步骤。",
      nextStep: "下次遇到类似确认环节时，可以在学生回应后追问一个具体依据。",
      exampleWording: "“谁能说说刚才这一步为什么这样做？”"
    }
  });
}

export function buildTeacherSelfAnswerCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  const pair = findAdjacentPair(segments, (current, next) =>
    isTeacher(current) &&
    hasQuestionMarker(current.text) &&
    !isClassroomManagementText(current.text) &&
    Boolean(next) &&
    isTeacher(next) &&
    next.startMs - current.endMs <= 3000
  );
  if (!pair) return null;
  const [question, answer] = pair;
  const waitSeconds = Math.max((answer.startMs - question.endMs) / 1000, 0).toFixed(1);
  return evidenceCard(input, {
    category: "response_pattern",
    title: "提问后由教师自行解释",
    fact: `教师在${formatTime(question.startMs)}提出问题后，约${waitSeconds}秒开始自行解释，当前片段中未识别到学生回答。`,
    interpretation: `教师提出“${trimQuote(question.text)}”后，很快接着进行了说明。这个衔接让讲解保持连续，但如果这里原本想听学生思路，学生可组织回答的时间比较短。`,
    suggestion: `如果这个问题是想了解学生想法，可以先明确邀请一名学生回答，并留出几秒钟；如果只是为了引出讲解，也可以把它改成陈述句，让学生更清楚这里不需要作答。`,
    sentiment: "negative",
    segments: [question, answer],
    confidence: "medium",
    uncertaintyNote: "仅根据逐字稿无法完全确定该问题是理解检查还是修辞性组织。",
    learningCheck: learningCheck(inferLearningCheckLevel(question.text), inferLearningCheckType(question.text), "teacher_self_answer", "very_weak", "问题由教师自行回答，不能作为学生理解证据。"),
    analysis: {
      evidenceCategory: "response_pattern",
      utteranceType: "teacher_question_followed_by_teacher_answer",
      includedInQuestionCount: true,
      includedInInteractionCount: false,
      evidenceStrength: "very_weak",
      internalReason: "教师提问后由教师紧接解释，未形成可观察学生回答。",
      suggestionDirection: "clarify_question_intent_or_wait_for_response"
    },
    teacherView: {
      title: "提问后很快进入教师说明",
      observation: `教师提出“${trimQuote(question.text)}”后，约${waitSeconds}秒开始继续说明。`,
      teachingMeaning: "这个处理能让讲解节奏比较连贯；如果当时希望了解学生思路，可以给学生更明确的回答机会。",
      nextStep: "可以根据目的选择两种说法：想让学生回答时先点名或邀请举手；只是过渡讲解时直接用陈述句衔接。",
      exampleWording: "“先请一位同学说说你的判断依据。”"
    }
  });
}

export function buildClassroomManagementCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  const managementSegments = segments.filter((segment) => isTeacher(segment) && isClassroomManagementText(segment.text)).slice(0, 3);
  if (managementSegments.length < 2) return null;
  return evidenceCard(input, {
    category: "classroom_management",
    title: "识别到课堂管理语言",
    fact: `当前片段中多次出现课堂组织或管理语言，如“${trimQuote(managementSegments[0].text)}”。`,
    interpretation: buildManagementObservation(managementSegments),
    suggestion: buildManagementSuggestion(managementSegments),
    sentiment: "neutral",
    segments: managementSegments,
    confidence: "high",
    uncertaintyNote: null,
    analysis: {
      evidenceCategory: "classroom_management",
      utteranceType: "classroom_management",
      includedInQuestionCount: false,
      includedInInteractionCount: false,
      evidenceStrength: "medium",
      internalReason: "该表达用于维持秩序、安排任务或切换流程。",
      suggestionDirection: "connect_transition_to_learning_task"
    },
    teacherView: {
      title: "课堂组织与任务切换",
      observation: buildManagementObservation(managementSegments),
      teachingMeaning: "这个片段显示教师能较快组织学生进入下一环节；如果希望任务切换同时承接学习目标，可以在操作指令后补一句关注点。",
      nextStep: buildManagementSuggestion(managementSegments),
      exampleWording: buildManagementExample(managementSegments)
    }
  });
}

export function buildTechnicalIssueCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  if (input.lesson_format !== "live_online_class") return null;
  const segment = segments.find((item) => isTeacher(item) && matchesAny(item.text, [/能听见吗/, /听得到吗/, /看得见吗/, /画面/, /网络/, /卡顿/, /连麦/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "technical_issue",
    title: "出现直播技术确认",
    fact: `教师在${formatTime(segment.startMs)}进行了音视频或连麦相关确认。`,
    interpretation: `教师用“${trimQuote(segment.text)}”确认直播中的听看或连麦状态，先保障学生能够进入后续学习。`,
    suggestion: "技术确认结束后，可以马上接一个简短学习任务，例如请学生在聊天区或口头说出刚才例题的关键条件，帮助课堂从设备确认平稳转回学习内容。",
    sentiment: "neutral",
    segments: [segment],
    confidence: "high",
    uncertaintyNote: null,
    analysis: {
      evidenceCategory: "technical_issue",
      utteranceType: "technical_check",
      includedInQuestionCount: false,
      includedInInteractionCount: false,
      evidenceStrength: "weak",
      internalReason: "技术确认不作为学科提问或学习互动证据。",
      suggestionDirection: "return_from_technical_check_to_learning_task"
    }
  });
}

export function buildErrorAnalysisCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
  const segment = segments.find((item) => matchesAny(item.text, [/错在/, /错误原因/, /易错/, /混淆/, /问题出在/, /很多同学错/, /失分/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "error_analysis",
    title: "讲评中包含错误原因分析",
    fact: `教师在${formatTime(segment.startMs)}围绕错误原因或易错点进行了说明。`,
    interpretation: context === "test_paper_review" || context === "exam_practice"
      ? "该片段不仅给出答案，还指向错误产生的原因，符合试卷讲评或考试训练中的关键分析重点。"
      : "该片段把学生可能出错的位置作为讲解对象，有助于教师复盘理解障碍。",
    suggestion: "可进一步让学生说明错误发生在哪一步，或提供一道变式题检查是否能迁移修正。",
    sentiment: "positive",
    segments: [segment],
    confidence: "high",
    uncertaintyNote: null
  });
}

export function buildMethodGeneralizationCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
  const segment = segments.find((item) => matchesAny(item.text, [/方法/, /步骤/, /题型/, /规律/, /策略/, /归纳/, /总结一下/, /评分标准/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "method_generalization",
    title: "出现方法或题型归纳",
    fact: `教师在${formatTime(segment.startMs)}提到方法、步骤、题型或策略。`,
    interpretation: buildMethodObservation(segment, context),
    suggestion: buildMethodSuggestion(segment),
    sentiment: "positive",
    segments: [segment],
    confidence: "medium",
    uncertaintyNote: "仅凭单个片段无法判断整节课的方法归纳是否充分。",
    analysis: {
      evidenceCategory: "method_generalization",
      utteranceType: "method_generalization",
      includedInQuestionCount: false,
      includedInInteractionCount: false,
      evidenceStrength: "medium",
      internalReason: "该片段将具体内容归纳为方法、步骤、题型或策略。",
      suggestionDirection: "ask_students_to_apply_and_explain_method"
    },
    teacherView: {
      title: "从例题中归纳方法",
      observation: buildMethodObservation(segment, context),
      teachingMeaning: "这个片段已经开始帮助学生从一道题中提炼可复用的做法。接下来如果能让学生自己选择步骤并说明理由，就能看到迁移使用的证据。",
      nextStep: buildMethodSuggestion(segment),
      exampleWording: buildMethodExample(segment)
    }
  });
}

export function buildKnowledgeConnectionCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
  const segment = segments.find((item) => matchesAny(item.text, [/联系/, /放在一起/, /比较/, /框架/, /知识网络/, /结构/, /都可以通过/, /之间的关系/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: context === "review_lesson" ? "structured_review" : "knowledge_connection",
    title: context === "review_lesson" ? "复习中出现结构化整理" : "建立知识点之间的联系",
    fact: `教师在${formatTime(segment.startMs)}把知识点、方法或任务放在一起比较或连接。`,
    interpretation: "该做法有助于学生看到知识之间的关系，而不是只记忆孤立结论。",
    suggestion: "可用一张表格、框架图或综合任务继续检查学生是否能选择合适方法。",
    sentiment: "positive",
    segments: [segment],
    confidence: "medium",
    uncertaintyNote: null
  });
}

export function buildVariationPracticeCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
  const segment = segments.find((item) => matchesAny(item.text, [/变式/, /换一个条件/, /类似的题/, /新情境/, /迁移/, /再做一道/, /完成这个任务/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "variation_practice",
    title: "出现变式练习或迁移任务",
    fact: `教师在${formatTime(segment.startMs)}布置或提示了相近任务、条件变化或迁移应用。`,
    interpretation: "这类任务比口头确认能提供更强的学习检查证据，尤其适合讲评、复习和训练场景。",
    suggestion: "可记录学生完成情况和解释过程，作为后续报告中更可靠的理解证据。",
    sentiment: "positive",
    segments: [segment],
    confidence: "high",
    uncertaintyNote: null,
    learningCheck: learningCheck(5, "transfer_or_task", "unknown_response", "very_strong", "需要结合学生完成情况确认实际掌握程度。")
  });
}

export function buildSelfCheckCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  if (input.lesson_format !== "recorded_online_class") return null;
  const segment = segments.find((item) => matchesAny(item.text, [/暂停/, /自己想一想/, /先试着/, /自测/, /检查一下/, /请你完成/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "self_check",
    title: "录播课包含自测提示",
    fact: `教师在${formatTime(segment.startMs)}给出暂停思考、自测或独立完成任务的提示。`,
    interpretation: "录播课程无法观察实时学生回应，自测提示可以为学习者提供主动加工和检查理解的机会。",
    suggestion: "可在提示后给出明确答案核对或步骤示范，帮助学习者完成自我反馈闭环。",
    sentiment: "positive",
    segments: [segment],
    confidence: "high",
    uncertaintyNote: null,
    learningCheck: learningCheck(5, "transfer_or_task", "teacher_self_answer", "medium", "录播课无法观察学生实际完成情况。")
  });
}

export function buildLessonSummaryCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  const segment = [...segments].reverse().find((item) => matchesAny(item.text, [/总结/, /回顾/, /今天.*学/, /本节课/, /最后/, /归纳一下/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "lesson_summary",
    title: "片段中出现课堂总结",
    fact: `教师在${formatTime(segment.startMs)}进行了回顾、归纳或结束性总结。`,
    interpretation: "总结语言有助于收束课堂内容，但仍需结合是否包含关键方法、易错点或任务反馈来判断其证据强度。",
    suggestion: "可在总结中明确列出本节课的关键方法和一个自检问题，帮助学生对照检查。",
    sentiment: "neutral",
    segments: [segment],
    confidence: "medium",
    uncertaintyNote: null
  });
}
