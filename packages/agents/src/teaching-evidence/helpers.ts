import type {
  CapabilityMatrix,
  EvidenceCategory,
  EvidenceConfidence,
  EvidenceStrength,
  InstructionalContext,
  LearningCheckLevel,
  LearningCheckType,
  LessonFormat,
  ResponsePattern,
  TeachingEvidenceCard,
  TranscriptSegment
} from "@class-reflect/shared-types";
import type { TeachingEvidenceInput } from "../types";

export function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function trimQuote(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function meetsMinimumConfidence(confidence: EvidenceConfidence, minimum: "low" | "medium" | "high") {
  const rank: Record<EvidenceConfidence, number> = { needs_review: 0, low: 1, medium: 2, high: 3 };
  return rank[confidence] >= rank[minimum];
}

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function findAdjacentPair(
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

export function isTeacher(segment: TranscriptSegment) {
  return /教师|老师|teacher/i.test(segment.speakerLabel || "") || !/学生|同学|全班|生/.test(segment.speakerLabel || "");
}

export function hasQuestionMarker(text: string) {
  return /[?？]|为什么|怎么|哪|什么|是否|是不是|对不对|能不能|请.*说/.test(text);
}

export function isClassroomManagementText(text: string) {
  return matchesAny(text, [/坐好/, /安静/, /看黑板/, /翻到/, /书.*拿出来/, /小组开始/, /时间到了/, /停下来/, /举手/, /不要讲话/, /往前看/, /准备好了吗/, /可以开始了吗/]);
}

export function learningCheck(
  level: LearningCheckLevel,
  checkType: LearningCheckType,
  responsePattern: ResponsePattern,
  evidenceStrength: EvidenceStrength,
  limitationNote: string | null
) {
  return { level, checkType, responsePattern, evidenceStrength, limitationNote };
}

export function inferInstructionalContext(segments: TranscriptSegment[]): InstructionalContext {
  const text = segments.map((segment) => segment.text).join(" ");
  const hits: InstructionalContext[] = [];
  if (matchesAny(text, [/试卷/, /讲评/, /第[一二三四五六七八九十\d]+题/, /答案是/, /错在/, /失分/])) hits.push("test_paper_review");
  if (matchesAny(text, [/复习/, /回顾/, /知识点/, /知识网络/, /框架/, /综合/])) hits.push("review_lesson");
  if (matchesAny(text, [/考试/, /考前/, /审题/, /时间分配/, /评分标准/, /答题策略/])) hits.push("exam_practice");
  if (hits.length > 1) return "mixed";
  return hits[0] || "unknown";
}

export function inferResponsePattern(segment: TranscriptSegment, lessonFormat: LessonFormat): ResponsePattern {
  if (lessonFormat === "recorded_online_class") return "teacher_self_answer";
  const label = segment.speakerLabel || "";
  if (/全班|学生们|集体|齐答/.test(label + segment.text)) return "choral_response";
  if (/学生|生|同学/.test(label)) return "individual_student_response";
  if (matchesAny(segment.text, [/^(懂了|会了|明白了?|对|是)[。！!]?$/])) return "choral_response";
  return "unknown_response";
}

export function inferLearningCheckLevel(text: string): LearningCheckLevel {
  if (matchesAny(text, [/迁移/, /应用/, /完成.*任务/, /新情境/, /变式/, /解决.*题/])) return 5;
  if (matchesAny(text, [/为什么/, /依据/, /理由/, /怎么判断/, /还有其他方法/])) return 4;
  if (matchesAny(text, [/多少/, /哪个/, /是什么/, /第几/, /选什么/])) return 3;
  if (matchesAny(text, [/复述/, /用自己的话/, /再说一遍/])) return 2;
  return 1;
}

export function inferLearningCheckType(text: string): LearningCheckType {
  const level = inferLearningCheckLevel(text);
  if (level === 5) return "transfer_or_task";
  if (level === 4) return "reason_explanation";
  if (level === 3) return "specific_question";
  if (level === 2) return "concept_restatement";
  return "oral_confirmation";
}

export function isCategorySupported(category: EvidenceCategory, lessonFormat: LessonFormat, capabilityMatrix: CapabilityMatrix) {
  if (lessonFormat === "recorded_online_class" && ["wait_time", "student_response", "classroom_management"].includes(category)) return false;
  if (category === "classroom_management") return capabilityMatrix.canAnalyzeClassroomManagementLanguage;
  if (category === "learning_check_level") return capabilityMatrix.canAnalyzeLearningCheckLevel;
  if (category === "response_pattern") return capabilityMatrix.canDetectTeacherSelfAnswer;
  if (category === "technical_issue") return capabilityMatrix.canAnalyzeLiveAudioInteraction;
  if (category === "self_check") return capabilityMatrix.canAnalyzeSelfCheckPrompt;
  if (category === "information_density") return capabilityMatrix.canAnalyzeInformationDensity;
  return true;
}

export function applicableFormatsForCategory(category: EvidenceCategory): LessonFormat[] {
  if (category === "technical_issue") return ["live_online_class"];
  if (category === "self_check") return ["recorded_online_class"];
  if (["wait_time", "student_response", "classroom_management"].includes(category)) {
    return ["offline_classroom_recording", "live_online_class"];
  }
  return ["offline_classroom_recording", "live_online_class", "recorded_online_class"];
}

export function inferEvidenceSentiment(values: {
  category: EvidenceCategory;
  learningCheck?: TeachingEvidenceCard["learningCheck"];
}) {
  if (values.category === "response_pattern" && values.learningCheck?.responsePattern === "teacher_self_answer") return "negative";
  if (values.learningCheck?.evidenceStrength === "very_weak") return "negative";
  if (["method_generalization", "variation_practice", "knowledge_connection", "structured_review", "error_analysis", "self_check"].includes(values.category)) {
    return "positive";
  }
  return "neutral";
}

export function buildDefaultTeacherView(values: {
  category: EvidenceCategory;
  title: string;
  fact: string;
  interpretation: string;
  suggestion: string;
  sentiment?: TeachingEvidenceCard["sentiment"];
  learningCheck?: TeachingEvidenceCard["learningCheck"];
}) {
  const sentiment = values.sentiment || inferEvidenceSentiment(values);
  if (sentiment === "positive") {
    return {
      title: values.title,
      observation: values.interpretation,
      teachingMeaning: "这是一个值得保留的课堂亮点。",
      nextStep: values.suggestion
    };
  }
  if (sentiment === "negative") {
    return {
      title: values.title,
      observation: values.interpretation,
      nextStep: values.suggestion
    };
  }
  return {
    title: values.title,
    observation: values.interpretation || values.fact,
    nextStep: values.suggestion
  };
}

export function evidenceCard(input: TeachingEvidenceInput, values: {
  category: EvidenceCategory;
  title: string;
  fact: string;
  interpretation: string;
  suggestion: string;
  sentiment?: TeachingEvidenceCard["sentiment"];
  segments: TranscriptSegment[];
  confidence: EvidenceConfidence;
  uncertaintyNote: string | null;
  learningCheck?: TeachingEvidenceCard["learningCheck"];
  analysis?: TeachingEvidenceCard["analysis"];
  teacherView?: TeachingEvidenceCard["teacherView"];
}): TeachingEvidenceCard {
  const startMs = Math.min(...values.segments.map((segment) => segment.startMs));
  const endMs = Math.max(...values.segments.map((segment) => segment.endMs));
  return {
    id: `evidence_${stableHash(`${input.lessonId}:${values.category}:${startMs}:${endMs}`).slice(0, 8)}`,
    category: values.category,
    sentiment: values.sentiment || inferEvidenceSentiment(values),
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
    learningCheck: values.learningCheck,
    analysis: values.analysis,
    teacherView: values.teacherView || buildDefaultTeacherView(values)
  };
}

export function buildManagementObservation(segments: TranscriptSegment[]) {
  const quotes = segments.slice(0, 3).map((segment) => `“${trimQuote(segment.text)}”`).join("、");
  return `在这一片段中，教师通过${quotes}等指令组织课堂秩序、安排任务或推动环节切换。`;
}

export function buildManagementSuggestion(segments: TranscriptSegment[]) {
  const anchor = trimQuote(segments[0]?.text || "进入下一环节");
  return `在“${anchor}”这类操作指令后，可以补充一个学习关注点，让学生带着明确任务进入下一步。`;
}

export function buildManagementExample(segments: TranscriptSegment[]) {
  const text = segments.map((segment) => segment.text).join(" ");
  if (/翻到|第/.test(text)) return "“先看这一题和刚才例题的条件有什么不同，再开始讨论。”";
  if (/小组|讨论/.test(text)) return "“小组讨论时先确定你们准备用哪一步，再说出选择理由。”";
  return "“开始之前，先想一想刚才的方法在这里要用到哪一步。”";
}

export function buildMethodObservation(segment: TranscriptSegment, context: InstructionalContext) {
  const quote = trimQuote(segment.text);
  if (context === "review_lesson" || context === "test_paper_review" || context === "exam_practice") {
    return `教师在“${quote}”这一句中，把当前题目或讲评内容连接到可复用的方法、步骤或策略。`;
  }
  return `教师在“${quote}”这一句中，开始把具体内容提炼成学生后续可以继续使用的做法。`;
}

export function buildMethodSuggestion(segment: TranscriptSegment) {
  const method = inferMethodPhrase(segment.text);
  if (method) {
    return `讲完“${method}”后，可以安排一道条件略有变化的练习，请学生先说准备采用哪一步、为什么这样选，再开始作答。`;
  }
  return "在这个方法讲解后，可以安排一道条件略有变化的练习，并请学生先说出准备采用的步骤和理由，再开始作答。";
}

export function buildMethodExample(segment: TranscriptSegment) {
  const method = inferMethodPhrase(segment.text);
  if (method) return `“这道题还能直接用${method}吗？你准备先做哪一步，为什么？”`;
  return "“这道题和刚才例题相比，条件有什么变化？你准备先做哪一步，为什么？”";
}

export function inferMethodPhrase(text: string) {
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(/(?:通过|用|使用|采用|按照|根据)([^，。！？!?]{2,24})(?:来|去|做|解决|判断|求|证明)/);
  if (match?.[1]) return match[1];
  const keyword = compact.match(/(截长补短|边角边|先[^，。！？!?]{2,18}再[^，。！？!?]{2,18}|通分|约分|辅助线|分类讨论)/);
  return keyword?.[1] || null;
}
