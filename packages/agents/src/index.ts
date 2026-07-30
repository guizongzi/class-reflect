import {
  capabilityMatrixByLessonFormat,
  type CapabilityMatrix,
  type ClassroomEvent,
  type ClassroomMetric,
  type EvidenceCategory,
  type EvidenceConfidence,
  type EvidenceStrength,
  type InstructionalContext,
  type LearningCheckLevel,
  type LearningCheckType,
  type LessonFormat,
  type ResponsePattern,
  type TeachingEvidenceCard,
  type TranscriptSegment
} from "@class-reflect/shared-types";

export type AgentResult<T> = {
  output: T;
  promptVersion: string;
  warnings: string[];
};

export type TeachingEvidenceInput = {
  lessonId: string;
  lesson_format: LessonFormat;
  capabilityMatrix?: CapabilityMatrix;
  transcriptSegments: TranscriptSegment[];
  metrics: ClassroomMetric[];
  classroomEvents?: ClassroomEvent[];
  generationConfig?: {
    enabledCategories?: EvidenceCategory[];
    maxEvidenceCards?: number;
    minimumConfidence?: "low" | "medium" | "high";
    language: "zh-CN";
  };
};

export type TeachingEvidenceOutput = {
  lessonId: string;
  lesson_format: LessonFormat;
  instructionalContext: InstructionalContext;
  evidenceCards: TeachingEvidenceCard[];
  skippedCategories: Array<{
    category: EvidenceCategory;
    reason:
      | "capability_not_supported"
      | "insufficient_evidence"
      | "category_disabled"
      | "not_applicable_to_lesson_format";
  }>;
  generationSummary: {
    analyzedTranscriptSegmentCount: number;
    analyzedMetricCount: number;
    generatedEvidenceCount: number;
  };
};

const defaultEvidenceCategories: EvidenceCategory[] = [
  "response_pattern",
  "learning_check_level",
  "classroom_management",
  "error_analysis",
  "method_generalization",
  "variation_practice",
  "knowledge_connection",
  "structured_review",
  "weakness_detection",
  "technical_issue",
  "self_check",
  "lesson_summary"
];

export type WorkflowAgentStep = {
  stepKey: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
};

export type WorkflowAgentSnapshot = {
  lessonId: string;
  videoId?: string | null;
  status?: string | null;
  hasUploadedVideo: boolean;
  hasUploadedAudio: boolean;
  steps: WorkflowAgentStep[];
};

export type WorkflowAgentDecision = {
  action: "wait_for_upload" | "continue_pipeline" | "wait_for_human" | "complete" | "fail";
  nextStepKey: string | null;
  assistantMessage: string;
  warnings: string[];
};

export function runTranscriptNormalizer<T>(segments: T[]): AgentResult<T[]> {
  return {
    output: segments,
    promptVersion: "transcript-normalizer.v0",
    warnings: []
  };
}

export function runTeachingEvidenceAgent(input: TeachingEvidenceInput): AgentResult<TeachingEvidenceOutput> {
  const capabilityMatrix = input.capabilityMatrix || capabilityMatrixByLessonFormat[input.lesson_format];
  const enabledCategories = input.generationConfig?.enabledCategories || defaultEvidenceCategories;
  const maxEvidenceCards = input.generationConfig?.maxEvidenceCards || 6;
  const minimumConfidence = input.generationConfig?.minimumConfidence || "low";
  const sortedSegments = [...input.transcriptSegments].sort((a, b) => a.startMs - b.startMs);
  const instructionalContext = inferInstructionalContext(sortedSegments);
  const cards: TeachingEvidenceCard[] = [];
  const skippedCategories: TeachingEvidenceOutput["skippedCategories"] = [];

  for (const category of defaultEvidenceCategories) {
    if (!enabledCategories.includes(category)) {
      skippedCategories.push({ category, reason: "category_disabled" });
    }
  }

  for (const category of enabledCategories) {
    if (!isCategorySupported(category, input.lesson_format, capabilityMatrix)) {
      skippedCategories.push({
        category,
        reason: input.lesson_format === "recorded_online_class" ? "not_applicable_to_lesson_format" : "capability_not_supported"
      });
    }
  }

  const pushCard = (card: TeachingEvidenceCard | null) => {
    if (!card) return;
    if (cards.length >= maxEvidenceCards) return;
    if (!meetsMinimumConfidence(card.confidence, minimumConfidence)) return;
    if (enabledCategories.includes(card.category) && isCategorySupported(card.category, input.lesson_format, capabilityMatrix)) {
      cards.push(card);
    }
  };

  pushCard(buildOralConfirmationCard(input, sortedSegments));
  pushCard(buildTeacherSelfAnswerCard(input, sortedSegments));
  pushCard(buildClassroomManagementCard(input, sortedSegments));
  pushCard(buildTechnicalIssueCard(input, sortedSegments));
  pushCard(buildErrorAnalysisCard(input, sortedSegments, instructionalContext));
  pushCard(buildMethodGeneralizationCard(input, sortedSegments, instructionalContext));
  pushCard(buildKnowledgeConnectionCard(input, sortedSegments, instructionalContext));
  pushCard(buildVariationPracticeCard(input, sortedSegments, instructionalContext));
  pushCard(buildSelfCheckCard(input, sortedSegments));
  pushCard(buildLessonSummaryCard(input, sortedSegments));

  for (const category of enabledCategories) {
    if (!skippedCategories.some((item) => item.category === category) && !cards.some((card) => card.category === category)) {
      skippedCategories.push({ category, reason: "insufficient_evidence" });
    }
  }

  return {
    output: {
      lessonId: input.lessonId,
      lesson_format: input.lesson_format,
      instructionalContext,
      evidenceCards: cards,
      skippedCategories,
      generationSummary: {
        analyzedTranscriptSegmentCount: sortedSegments.length,
        analyzedMetricCount: input.metrics.length,
        generatedEvidenceCount: cards.length
      }
    },
    promptVersion: "teaching-evidence.v0.1.1",
    warnings: skippedCategories
      .filter((item) => item.reason === "not_applicable_to_lesson_format" || item.reason === "capability_not_supported")
      .map((item) => `${item.category}:${item.reason}`)
  };
}

export function runWorkflowAgent(snapshot: WorkflowAgentSnapshot): AgentResult<WorkflowAgentDecision> {
  const failedStep = snapshot.steps.find((step) => step.status === "failed");
  if (failedStep) {
    return workflowDecision({
      action: "fail",
      nextStepKey: failedStep.stepKey,
      assistantMessage: `处理在「${failedStep.stepKey}」失败：${failedStep.errorMessage || "请查看日志"}`,
      warnings: []
    });
  }

  if (!snapshot.hasUploadedVideo) {
    return workflowDecision({
      action: "wait_for_upload",
      nextStepKey: "upload_video",
      assistantMessage: "请先完成原始视频上传，系统会保存到对象存储后再进入后台处理。",
      warnings: []
    });
  }

  if (!snapshot.hasUploadedAudio) {
    return workflowDecision({
      action: "continue_pipeline",
      nextStepKey: "upload_audio",
      assistantMessage: "视频已上传。音频仍未完成时，后台可回退到从视频抽取音频。",
      warnings: ["audio_upload_not_completed"]
    });
  }

  const waitingHumanStep = snapshot.steps.find((step) => step.stepKey === "wait_human_review" && step.status === "running");
  if (waitingHumanStep) {
    return workflowDecision({
      action: "wait_for_human",
      nextStepKey: "wait_human_review",
      assistantMessage: "候选证据已经生成，请教师复核后再生成最终报告。",
      warnings: []
    });
  }

  const nextStep = snapshot.steps.find((step) => ["waiting", "queued"].includes(step.status));
  if (nextStep) {
    return workflowDecision({
      action: "continue_pipeline",
      nextStepKey: nextStep.stepKey,
      assistantMessage: `下一步处理「${nextStep.stepKey}」。`,
      warnings: []
    });
  }

  return workflowDecision({
    action: "complete",
    nextStepKey: null,
    assistantMessage: "课堂复盘工作流已完成。",
    warnings: []
  });
}

export class AgentOrchestrator {
  decide(snapshot: WorkflowAgentSnapshot) {
    return runWorkflowAgent(snapshot);
  }
}

function workflowDecision(decision: WorkflowAgentDecision): AgentResult<WorkflowAgentDecision> {
  return {
    output: decision,
    promptVersion: "workflow-agent.v0",
    warnings: decision.warnings
  };
}

function buildOralConfirmationCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
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
    interpretation: "该检查属于一级口头确认，可以说明课堂中出现了口头回应，但提供的理解证据较弱，不能据此判断每名学生都已理解。",
    suggestion: "可在口头确认后增加一个具体问题，请学生说明依据，或设置一道相近任务检查能否独立应用。",
    segments: [question, response],
    confidence: "medium",
    uncertaintyNote: "集体或短促回应无法确认每名学生的实际理解情况。",
    learningCheck: learningCheck(1, "oral_confirmation", inferResponsePattern(response, input.lesson_format), "very_weak", "齐答或短促回应只能证明出现了口头回应，不能证明个体理解。")
  });
}

function buildTeacherSelfAnswerCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
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
    interpretation: "该片段属于教师提问后自行回答。它可能是讲解中的修辞性问题，也可能没有形成清晰的学生作答窗口。",
    suggestion: "如果该问题用于检查理解，可明确邀请学生回答并适当延长等待时间；如果用于讲解组织，可直接用陈述句衔接解释。",
    segments: [question, answer],
    confidence: "medium",
    uncertaintyNote: "仅根据逐字稿无法完全确定该问题是理解检查还是修辞性组织。",
    learningCheck: learningCheck(inferLearningCheckLevel(question.text), inferLearningCheckType(question.text), "teacher_self_answer", "very_weak", "问题由教师自行回答，不能作为学生理解证据。")
  });
}

function buildClassroomManagementCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  const managementSegments = segments.filter((segment) => isTeacher(segment) && isClassroomManagementText(segment.text)).slice(0, 3);
  if (managementSegments.length < 2) return null;
  return evidenceCard(input, {
    category: "classroom_management",
    title: "识别到课堂管理语言",
    fact: `当前片段中多次出现课堂组织或管理语言，如“${trimQuote(managementSegments[0].text)}”。`,
    interpretation: "这些表达主要用于维持秩序、安排任务或切换流程，不应直接计为学科提问或理解检查。",
    suggestion: "统计提问和互动时，可将管理语言与具有知识、理解、推理或应用目标的问题分开记录。",
    segments: managementSegments,
    confidence: "high",
    uncertaintyNote: null
  });
}

function buildTechnicalIssueCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  if (input.lesson_format !== "live_online_class") return null;
  const segment = segments.find((item) => isTeacher(item) && matchesAny(item.text, [/能听见吗/, /听得到吗/, /看得见吗/, /画面/, /网络/, /卡顿/, /连麦/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "technical_issue",
    title: "出现直播技术确认",
    fact: `教师在${formatTime(segment.startMs)}进行了音视频或连麦相关确认。`,
    interpretation: "该片段更接近直播技术或流程确认，不应统计为学科提问，也不能据此判断学习参与情况。",
    suggestion: "分析直播互动时，可单独标记技术确认，并结合可听见的连麦回答再判断互动节奏。",
    segments: [segment],
    confidence: "high",
    uncertaintyNote: null
  });
}

function buildErrorAnalysisCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
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
    segments: [segment],
    confidence: "high",
    uncertaintyNote: null
  });
}

function buildMethodGeneralizationCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
  const segment = segments.find((item) => matchesAny(item.text, [/方法/, /步骤/, /题型/, /规律/, /策略/, /归纳/, /总结一下/, /评分标准/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "method_generalization",
    title: "出现方法或题型归纳",
    fact: `教师在${formatTime(segment.startMs)}提到方法、步骤、题型或策略。`,
    interpretation: context === "review_lesson" || context === "test_paper_review" || context === "exam_practice"
      ? "在复习、讲评或考试训练场景中，方法归纳比单纯统计提问数量更能反映该片段的教学重点。"
      : "该片段尝试把具体内容上升为可复用的方法或步骤。",
    suggestion: "可让学生用该方法处理一个相近任务，并说明选择该方法的依据。",
    segments: [segment],
    confidence: "medium",
    uncertaintyNote: "仅凭单个片段无法判断整节课的方法归纳是否充分。"
  });
}

function buildKnowledgeConnectionCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
  const segment = segments.find((item) => matchesAny(item.text, [/联系/, /放在一起/, /比较/, /框架/, /知识网络/, /结构/, /都可以通过/, /之间的关系/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: context === "review_lesson" ? "structured_review" : "knowledge_connection",
    title: context === "review_lesson" ? "复习中出现结构化整理" : "建立知识点之间的联系",
    fact: `教师在${formatTime(segment.startMs)}把知识点、方法或任务放在一起比较或连接。`,
    interpretation: "该做法有助于学生看到知识之间的关系，而不是只记忆孤立结论。",
    suggestion: "可用一张表格、框架图或综合任务继续检查学生是否能选择合适方法。",
    segments: [segment],
    confidence: "medium",
    uncertaintyNote: null
  });
}

function buildVariationPracticeCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
  const segment = segments.find((item) => matchesAny(item.text, [/变式/, /换一个条件/, /类似的题/, /新情境/, /迁移/, /再做一道/, /完成这个任务/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "variation_practice",
    title: "出现变式练习或迁移任务",
    fact: `教师在${formatTime(segment.startMs)}布置或提示了相近任务、条件变化或迁移应用。`,
    interpretation: "这类任务比口头确认能提供更强的学习检查证据，尤其适合讲评、复习和训练场景。",
    suggestion: "可记录学生完成情况和解释过程，作为后续报告中更可靠的理解证据。",
    segments: [segment],
    confidence: "high",
    uncertaintyNote: null,
    learningCheck: learningCheck(5, "transfer_or_task", "unknown_response", "very_strong", "需要结合学生完成情况确认实际掌握程度。")
  });
}

function buildSelfCheckCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  if (input.lesson_format !== "recorded_online_class") return null;
  const segment = segments.find((item) => matchesAny(item.text, [/暂停/, /自己想一想/, /先试着/, /自测/, /检查一下/, /请你完成/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "self_check",
    title: "录播课包含自测提示",
    fact: `教师在${formatTime(segment.startMs)}给出暂停思考、自测或独立完成任务的提示。`,
    interpretation: "录播课程无法观察实时学生回应，自测提示可以为学习者提供主动加工和检查理解的机会。",
    suggestion: "可在提示后给出明确答案核对或步骤示范，帮助学习者完成自我反馈闭环。",
    segments: [segment],
    confidence: "high",
    uncertaintyNote: null,
    learningCheck: learningCheck(5, "transfer_or_task", "teacher_self_answer", "medium", "录播课无法观察学生实际完成情况。")
  });
}

function buildLessonSummaryCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
  const segment = [...segments].reverse().find((item) => matchesAny(item.text, [/总结/, /回顾/, /今天.*学/, /本节课/, /最后/, /归纳一下/]));
  if (!segment) return null;
  return evidenceCard(input, {
    category: "lesson_summary",
    title: "片段中出现课堂总结",
    fact: `教师在${formatTime(segment.startMs)}进行了回顾、归纳或结束性总结。`,
    interpretation: "总结语言有助于收束课堂内容，但仍需结合是否包含关键方法、易错点或任务反馈来判断其证据强度。",
    suggestion: "可在总结中明确列出本节课的关键方法和一个自检问题，帮助学生对照检查。",
    segments: [segment],
    confidence: "medium",
    uncertaintyNote: null
  });
}

function evidenceCard(input: TeachingEvidenceInput, values: {
  category: EvidenceCategory;
  title: string;
  fact: string;
  interpretation: string;
  suggestion: string;
  segments: TranscriptSegment[];
  confidence: EvidenceConfidence;
  uncertaintyNote: string | null;
  learningCheck?: TeachingEvidenceCard["learningCheck"];
}): TeachingEvidenceCard {
  const startMs = Math.min(...values.segments.map((segment) => segment.startMs));
  const endMs = Math.max(...values.segments.map((segment) => segment.endMs));
  return {
    id: `evidence_${stableHash(`${input.lessonId}:${values.category}:${startMs}:${endMs}`).slice(0, 8)}`,
    category: values.category,
    title: values.title,
    fact: values.fact,
    interpretation: values.interpretation,
    suggestion: values.suggestion,
    startMs,
    endMs,
    quote: values.segments.map((segment) => trimQuote(segment.text)).join(" "),
    transcriptSegmentIds: values.segments.map((segment) => segment.id),
    metricIds: [],
    classroomEventIds: [],
    applicableLessonFormats: applicableFormatsForCategory(values.category),
    confidence: values.confidence,
    uncertaintyNote: values.uncertaintyNote,
    reviewStatus: "pending_review",
    learningCheck: values.learningCheck
  };
}

function learningCheck(
  level: LearningCheckLevel,
  checkType: LearningCheckType,
  responsePattern: ResponsePattern,
  evidenceStrength: EvidenceStrength,
  limitationNote: string | null
) {
  return { level, checkType, responsePattern, evidenceStrength, limitationNote };
}

function inferInstructionalContext(segments: TranscriptSegment[]): InstructionalContext {
  const text = segments.map((segment) => segment.text).join(" ");
  const hits: InstructionalContext[] = [];
  if (matchesAny(text, [/试卷/, /讲评/, /第[一二三四五六七八九十\d]+题/, /答案是/, /错在/, /失分/])) hits.push("test_paper_review");
  if (matchesAny(text, [/复习/, /回顾/, /知识点/, /知识网络/, /框架/, /综合/])) hits.push("review_lesson");
  if (matchesAny(text, [/考试/, /考前/, /审题/, /时间分配/, /评分标准/, /答题策略/])) hits.push("exam_practice");
  if (hits.length > 1) return "mixed";
  return hits[0] || "unknown";
}

function inferResponsePattern(segment: TranscriptSegment, lessonFormat: LessonFormat): ResponsePattern {
  if (lessonFormat === "recorded_online_class") return "teacher_self_answer";
  const label = segment.speakerLabel || "";
  if (/全班|学生们|集体|齐答/.test(label + segment.text)) return "choral_response";
  if (/学生|生|同学/.test(label)) return "individual_student_response";
  if (matchesAny(segment.text, [/^(懂了|会了|明白了?|对|是)[。！!]?$/])) return "choral_response";
  return "unknown_response";
}

function inferLearningCheckLevel(text: string): LearningCheckLevel {
  if (matchesAny(text, [/迁移/, /应用/, /完成.*任务/, /新情境/, /变式/, /解决.*题/])) return 5;
  if (matchesAny(text, [/为什么/, /依据/, /理由/, /怎么判断/, /还有其他方法/])) return 4;
  if (matchesAny(text, [/多少/, /哪个/, /是什么/, /第几/, /选什么/])) return 3;
  if (matchesAny(text, [/复述/, /用自己的话/, /再说一遍/])) return 2;
  return 1;
}

function inferLearningCheckType(text: string): LearningCheckType {
  const level = inferLearningCheckLevel(text);
  if (level === 5) return "transfer_or_task";
  if (level === 4) return "reason_explanation";
  if (level === 3) return "specific_question";
  if (level === 2) return "concept_restatement";
  return "oral_confirmation";
}

function isCategorySupported(category: EvidenceCategory, lessonFormat: LessonFormat, capabilityMatrix: CapabilityMatrix) {
  if (lessonFormat === "recorded_online_class" && ["wait_time", "student_response", "classroom_management"].includes(category)) return false;
  if (category === "classroom_management") return capabilityMatrix.canAnalyzeClassroomManagementLanguage;
  if (category === "learning_check_level") return capabilityMatrix.canAnalyzeLearningCheckLevel;
  if (category === "response_pattern") return capabilityMatrix.canDetectTeacherSelfAnswer;
  if (category === "technical_issue") return capabilityMatrix.canAnalyzeLiveAudioInteraction;
  if (category === "self_check") return capabilityMatrix.canAnalyzeSelfCheckPrompt;
  if (category === "information_density") return capabilityMatrix.canAnalyzeInformationDensity;
  return true;
}

function applicableFormatsForCategory(category: EvidenceCategory): LessonFormat[] {
  if (category === "technical_issue") return ["live_online_class"];
  if (category === "self_check") return ["recorded_online_class"];
  if (["wait_time", "student_response", "classroom_management"].includes(category)) {
    return ["offline_classroom_recording", "live_online_class"];
  }
  return ["offline_classroom_recording", "live_online_class", "recorded_online_class"];
}

function findAdjacentPair(
  segments: TranscriptSegment[],
  predicate: (current: TranscriptSegment, next: TranscriptSegment) => boolean
): [TranscriptSegment, TranscriptSegment] | null {
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    if (current && next && predicate(current, next)) return [current, next];
  }
  return null;
}

function isTeacher(segment: TranscriptSegment) {
  return /教师|老师|teacher/i.test(segment.speakerLabel || "") || !/学生|同学|全班|生/.test(segment.speakerLabel || "");
}

function hasQuestionMarker(text: string) {
  return /[?？]|为什么|怎么|哪|什么|是否|是不是|对不对|能不能|请.*说/.test(text);
}

function isClassroomManagementText(text: string) {
  return matchesAny(text, [/坐好/, /安静/, /看黑板/, /翻到/, /书.*拿出来/, /小组开始/, /时间到了/, /停下来/, /举手/, /不要讲话/, /往前看/, /准备好了吗/, /可以开始了吗/]);
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function trimQuote(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function meetsMinimumConfidence(confidence: EvidenceConfidence, minimum: "low" | "medium" | "high") {
  const rank: Record<EvidenceConfidence, number> = { needs_review: 0, low: 1, medium: 2, high: 3 };
  return rank[confidence] >= rank[minimum];
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
