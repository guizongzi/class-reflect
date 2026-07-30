/// <reference types="node" />

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
  type LessonSection,
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

export type TranscriptNormalizerOutput = {
  normalizedSegments: TranscriptSegment[];
  displaySections: LessonSection[];
  analysisProjection: {
    sentenceCount: number;
    teacherSentenceCount: number;
    studentSentenceCount: number;
    lowConfidenceSentenceCount: number;
    flags: string[];
  };
};

const logger = {
  info(message: string, meta?: unknown) {
    console.log(JSON.stringify({ level: "info", scope: "agents.llm", message, meta }));
  },
  error(message: string, meta?: unknown) {
    console.error(JSON.stringify({ level: "error", scope: "agents.llm", message, meta }));
  }
};

function createAgentLlmProvider() {
  try {
    const config = readAgentLlmConfig();
    if (!config) {
      return null;
    }

    return {
      async generateJson<T>(input: { promptVersion: string; payload: unknown }): Promise<T> {
        logger.info("ai call started", {
          promptVersion: input.promptVersion,
          provider: "openai-compatible",
          endpoint: trimSlash(config.baseUrl),
          payloadSummary: summarizePayload(input.payload)
        });
        const response = await fetch(`${trimSlash(config.baseUrl)}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: `promptVersion=${input.promptVersion}\n输出严格 JSON，不要 Markdown。` },
              { role: "user", content: JSON.stringify(input.payload) }
            ]
          })
        });

        const bodyText = await response.text();
        if (!response.ok) {
          logger.error("ai call failed", {
            promptVersion: input.promptVersion,
            provider: "openai-compatible",
            endpoint: trimSlash(config.baseUrl),
            status: response.status,
            bodyPreview: bodyText.slice(0, 500)
          });
          throw new Error(`LLM 请求失败 ${response.status}：${bodyText.slice(0, 500)}`);
        }

        const body = JSON.parse(bodyText);
        const content = body.choices?.[0]?.message?.content;
        if (!content) {
          logger.error("ai call failed", {
            promptVersion: input.promptVersion,
            provider: "openai-compatible",
            endpoint: trimSlash(config.baseUrl),
            reason: "missing_content"
          });
          throw new Error("LLM 没有返回内容");
        }

        logger.info("ai call completed", {
          promptVersion: input.promptVersion,
          provider: "openai-compatible",
          endpoint: trimSlash(config.baseUrl),
          responseSize: content.length
        });
        return parseJsonObject(content) as T;
      }
    };
  } catch {
    return null;
  }
}

async function tryRunLlmAgent<T>(input: { promptVersion: string; payload: unknown; validate: (value: unknown) => value is T }) {
  const llm = createAgentLlmProvider();
  if (!llm) return null;

  try {
    const result = await llm.generateJson<T>({ promptVersion: input.promptVersion, payload: input.payload });
    if (!input.validate(result)) {
      logger.error("ai call returned invalid payload", {
        promptVersion: input.promptVersion,
        payloadSummary: summarizePayload(input.payload),
        resultSummary: summarizeResult(result)
      });
    return null;
  }

    return result;
  } catch {
    logger.error("ai call threw", {
      promptVersion: input.promptVersion,
      payloadSummary: summarizePayload(input.payload)
    });
    return null;
  }
}

function readAgentLlmConfig() {
  try {
    const raw = process.env.APP_CONFIG_ENV ? JSON.parse(process.env.APP_CONFIG_ENV) : {};
    const baseUrl = process.env.LLM_BASE_URL || raw.LLM_BASE_URL || raw.llm?.baseUrl;
    const apiKey = process.env.LLM_API_KEY || raw.LLM_API_KEY || raw.llm?.apiKey;
    const model = process.env.LLM_MODEL || raw.LLM_MODEL || raw.llm?.model;

    if (!baseUrl || !apiKey || !model) {
      return null;
    }

    return { baseUrl: String(baseUrl), apiKey: String(apiKey), model: String(model) };
  } catch {
    return null;
  }
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型返回内容不是 JSON");
    return JSON.parse(match[0]);
  }
}

function trimSlash(value: string) {
  return String(value || "").replace(/\/+$/, "");
}

function summarizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return { type: typeof payload };

  const candidate = payload as Record<string, unknown>;
  return {
    type: "object",
    keys: Object.keys(candidate).slice(0, 10),
    segmentCount: Array.isArray(candidate.segments) ? candidate.segments.length : undefined,
    metricCount: Array.isArray(candidate.metrics) ? candidate.metrics.length : undefined,
    classroomEventCount: Array.isArray(candidate.classroomEvents) ? candidate.classroomEvents.length : undefined
  };
}

function summarizeResult(value: unknown) {
  if (value === null) {
    return {
      type: "null"
    };
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      firstItemType:
        value.length > 0
          ? Array.isArray(value[0])
            ? "array"
            : typeof value[0]
          : undefined
    };
  }

  if (typeof value !== "object") {
    return {
      type: typeof value,
      valuePreview: String(value).slice(0, 200)
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    type: "object",
    keys: Object.keys(candidate).slice(0, 30),

    lessonIdType: typeof candidate.lessonId,
    lessonFormatType:
      typeof candidate.lesson_format !== "undefined"
        ? typeof candidate.lesson_format
        : typeof candidate.lessonFormat,

    instructionalContextType:
      candidate.instructionalContext === null
        ? "null"
        : Array.isArray(candidate.instructionalContext)
          ? "array"
          : typeof candidate.instructionalContext,

    evidenceCardsType: Array.isArray(candidate.evidenceCards)
      ? "array"
      : candidate.evidenceCards === null
        ? "null"
        : typeof candidate.evidenceCards,

    evidenceCardsCount: Array.isArray(candidate.evidenceCards)
      ? candidate.evidenceCards.length
      : undefined,

    skippedCategoriesType: Array.isArray(candidate.skippedCategories)
      ? "array"
      : candidate.skippedCategories === null
        ? "null"
        : typeof candidate.skippedCategories,

    skippedCategoriesCount: Array.isArray(candidate.skippedCategories)
      ? candidate.skippedCategories.length
      : undefined,

    generationSummaryType:
      candidate.generationSummary === null
        ? "null"
        : Array.isArray(candidate.generationSummary)
          ? "array"
          : typeof candidate.generationSummary
  };
}

function isTranscriptNormalizerOutput(value: unknown): value is TranscriptNormalizerOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.normalizedSegments)
    && Array.isArray(candidate.displaySections)
    && !!candidate.analysisProjection
    && typeof candidate.analysisProjection === "object";
}

function isTeachingEvidenceOutput(value: unknown): value is TeachingEvidenceOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.lessonId === "string"
    && Array.isArray(candidate.evidenceCards)
    && Array.isArray(candidate.skippedCategories)
    && !!candidate.generationSummary
    && typeof candidate.generationSummary === "object";
}

const teachingEvidenceOutputInstruction = `
你是课堂教学证据分析 Agent。

请根据输入的课堂逐字稿、课堂指标、课堂事件、课程形式和能力矩阵，
生成可被教师复核的教学证据。

你必须只返回一个合法 JSON 对象：
- 不要返回 Markdown。
- 不要使用代码块。
- 不要添加 JSON 之外的解释。
- 所有字段名必须与下面结构完全一致。
- 不允许把字段名改成 cards、summary、lessonFormat 等其他名称。
- 数组没有内容时返回 []，不要省略。
- 可选对象没有依据时可以省略。
- nullable 字段没有内容时必须返回 null。
- 不得虚构逐字稿中不存在的话语、时间、指标或课堂事件。
- transcriptSegmentIds、metricIds、classroomEventIds 只能引用输入中真实存在的 ID。
- startMs 和 endMs 必须来自引用证据的真实时间范围。
- quote 必须来自逐字稿原文；无法获得原文时返回空字符串。
- 输出语言为简体中文。

必须严格返回以下 JSON 结构：

{
  "lessonId": "string",
  "lesson_format": "offline_classroom_recording | live_online_class | recorded_online_class",
  "instructionalContext": "new_instruction | exam_practice | review_lesson | test_paper_review | mixed | unknown",
  "evidenceCards": [
    {
      "id": "string",
      "category": "lecture_duration | question_quality | wait_time | student_response | feedback_quality | follow_up | lesson_structure | practice_check | self_check | information_density | technical_issue | lesson_summary | response_pattern | learning_check_level | classroom_management | error_analysis | method_generalization | variation_practice | knowledge_connection | structured_review | weakness_detection",
      "sentiment": "positive | neutral | negative",
      "title": "string",
      "fact": "string",
      "interpretation": "string",
      "suggestion": "string",

      "analysis": {
        "evidenceCategory": "lecture_duration | question_quality | wait_time | student_response | feedback_quality | follow_up | lesson_structure | practice_check | self_check | information_density | technical_issue | lesson_summary | response_pattern | learning_check_level | classroom_management | error_analysis | method_generalization | variation_practice | knowledge_connection | structured_review | weakness_detection",
        "utteranceType": "string",
        "includedInQuestionCount": true,
        "includedInInteractionCount": true,
        "evidenceStrength": "very_weak | weak | medium | strong | very_strong",
        "internalReason": "string",
        "suggestionDirection": "string"
      },

      "teacherView": {
        "title": "string",
        "observation": "string",
        "teachingMeaning": "string",
        "nextStep": "string",
        "exampleWording": "string"
      },

      "startMs": 0,
      "endMs": 0,
      "quote": "string",
      "transcriptSegmentIds": ["string"],
      "metricIds": ["string"],
      "classroomEventIds": ["string"],

      "applicableLessonFormats": [
        "offline_classroom_recording | live_online_class | recorded_online_class"
      ],

      "confidence": "low | medium | high | needs_review",
      "uncertaintyNote": "string | null",
      "reviewStatus": "pending_review",

      "learningCheck": {
        "level": 1,
        "checkType": "oral_confirmation | concept_restatement | specific_question | reason_explanation | transfer_or_task",
        "responsePattern": "individual_student_response | choral_response | teacher_self_answer | multiple_student_overlap | no_audible_response | unknown_response",
        "evidenceStrength": "very_weak | weak | medium | strong | very_strong",
        "limitationNote": "string | null"
      }
    }
  ],

  "skippedCategories": [
    {
      "category": "lecture_duration | question_quality | wait_time | student_response | feedback_quality | follow_up | lesson_structure | practice_check | self_check | information_density | technical_issue | lesson_summary | response_pattern | learning_check_level | classroom_management | error_analysis | method_generalization | variation_practice | knowledge_connection | structured_review | weakness_detection",
      "reason": "capability_not_supported | insufficient_evidence | category_disabled | not_applicable_to_lesson_format"
    }
  ],

  "generationSummary": {
    "analyzedTranscriptSegmentCount": 0,
    "analyzedMetricCount": 0,
    "generatedEvidenceCount": 0
  }
}

额外要求：

1. lessonId 必须原样复制输入中的 lessonId。
2. lesson_format 必须原样复制输入中的 lessonFormat。
3. generationSummary.analyzedTranscriptSegmentCount 必须等于输入 transcriptSegments 的数量。
4. generationSummary.analyzedMetricCount 必须等于输入 metrics 的数量。
5. generationSummary.generatedEvidenceCount 必须等于 evidenceCards.length。
6. reviewStatus 固定返回 "pending_review"。
7. evidenceCards 必须遵守 generationConfig.maxEvidenceCards。
8. 只能生成 generationConfig.enabledCategories 允许的类别。
9. 对能力矩阵不支持的类别，不要生成 evidenceCards，放入 skippedCategories。
10. 对证据不足的类别，放入 skippedCategories，并使用 reason="insufficient_evidence"。
11. analysis.evidenceCategory 必须与外层 category 完全一致。
12. learningCheck 只在学习检查相关证据中返回，否则省略。
13. analysis 和 teacherView 缺少可靠依据时可以省略。
14. sentiment 无法确定时返回 "neutral"。
15. confidence 不能仅根据主观判断，必须结合逐字稿、指标或课堂事件。
`;

export async function runTranscriptNormalizer(segments: TranscriptSegment[]): Promise<AgentResult<TranscriptNormalizerOutput>> {
  const llmOutput = await tryRunLlmAgent<TranscriptNormalizerOutput>({
    promptVersion: "transcript-agent.llm.v1",
    payload: {
      instruction: "请把逐字稿整理成规范化的句子列表，并给出展示分段与分析投影。",
      segments
    },
    validate: isTranscriptNormalizerOutput
  });

  if (llmOutput) {
    return {
      output: llmOutput,
      promptVersion: "transcript-agent.llm.v1",
      warnings: []
    };
  }

  const sortedSegments = [...segments].sort((a, b) => a.startMs - b.startMs);
  const speakerProfiles = buildSpeakerProfiles(sortedSegments);
  const normalizedSegments = sortedSegments.map((segment, index) => normalizeTranscriptSegment(segment, index, speakerProfiles));
  const displaySections = buildDisplayTranscriptSections(normalizedSegments);
  const flags = [...new Set(normalizedSegments.flatMap((segment) => inferTranscriptFlags(segment)))];
  return {
    output: {
      normalizedSegments,
      displaySections,
      analysisProjection: {
        sentenceCount: normalizedSegments.length,
        teacherSentenceCount: normalizedSegments.filter(isTeacherLikeSegment).length,
        studentSentenceCount: normalizedSegments.filter((segment) => /学生|同学|全班|齐答/.test(segment.speakerLabel || "")).length,
        lowConfidenceSentenceCount: normalizedSegments.filter((segment) => (segment.confidence ?? 1) < 0.65).length,
        flags
      }
    },
    promptVersion: "transcript-agent.rule-based.v0.1",
    warnings: []
  };
}

export async function runTeachingEvidenceAgent(
  input: TeachingEvidenceInput
): Promise<AgentResult<TeachingEvidenceOutput>> {
  const llmOutput = await tryRunLlmAgent<TeachingEvidenceOutput>({
    promptVersion: "teaching-evidence.llm.v1",
    payload: {
      instruction: teachingEvidenceOutputInstruction,

      lessonId: input.lessonId,
      lessonFormat: input.lesson_format,

      capabilityMatrix:
        input.capabilityMatrix ||
        capabilityMatrixByLessonFormat[input.lesson_format],

      transcriptSegments: input.transcriptSegments,
      metrics: input.metrics,
      classroomEvents: input.classroomEvents || [],

      generationConfig:
        input.generationConfig || {
          language: "zh-CN"
        }
    },
    validate: isTeachingEvidenceOutput
  });

  if (llmOutput) {
    return {
      output: llmOutput,
      promptVersion: "teaching-evidence.llm.v1",
      warnings: []
    };
  }

  // 原有 rule-based fallback 继续保留
  // ...
}

type SpeakerProfile = {
  rawLabel: string;
  normalizedLabel: string;
  role: "teacher" | "student" | "students" | "unknown";
  score: number;
};

function buildSpeakerProfiles(segments: TranscriptSegment[]) {
  const grouped = new Map<string, { label: string; text: string; durationMs: number; count: number; score: number }>();
  for (const segment of segments) {
    const label = segment.speakerLabel || "未知";
    const current = grouped.get(label) || { label, text: "", durationMs: 0, count: 0, score: 0 };
    current.text = `${current.text} ${segment.text || ""}`.trim();
    current.durationMs += Math.max(segment.endMs - segment.startMs, 0);
    current.count += 1;
    current.score += scoreTeacherLikelihood(segment.text || "");
    grouped.set(label, current);
  }
  const profiles = [...grouped.values()].sort((a, b) => (
    (b.score + b.durationMs / 60000 + b.count * 0.1) - (a.score + a.durationMs / 60000 + a.count * 0.1)
  ));
  const teacherRawLabel = profiles[0]?.label || "未知";
  const studentLabels = new Map<string, string>();
  let studentIndex = 0;
  const result = new Map<string, SpeakerProfile>();

  for (const profile of profiles) {
    const sample = profile.text;
    if (profile.label === teacherRawLabel || /教师|老师|teacher/i.test(profile.label)) {
      result.set(profile.label, { rawLabel: profile.label, normalizedLabel: "教师", role: "teacher", score: profile.score });
      continue;
    }
    if (/全班|齐答|大家|同学们/.test(profile.label) || isLikelyChoralText(sample)) {
      result.set(profile.label, { rawLabel: profile.label, normalizedLabel: "全班", role: "students", score: profile.score });
      continue;
    }
    if (/未知/.test(profile.label) && profile.score < 2) {
      result.set(profile.label, { rawLabel: profile.label, normalizedLabel: "未知", role: "unknown", score: profile.score });
      continue;
    }
    const label = studentLabels.get(profile.label) || `学生${String.fromCharCode(65 + studentIndex)}`;
    studentLabels.set(profile.label, label);
    studentIndex += 1;
    result.set(profile.label, { rawLabel: profile.label, normalizedLabel: label, role: "student", score: profile.score });
  }
  return result;
}

function normalizeTranscriptSegment(
  segment: TranscriptSegment,
  index: number,
  profiles: Map<string, SpeakerProfile>
): TranscriptSegment {
  const rawLabel = segment.speakerLabel || "未知";
  const profile = profiles.get(rawLabel);
  const normalizedText = normalizeTranscriptText(segment.text || "");
  return {
    ...segment,
    speakerLabel: profile?.normalizedLabel || rawLabel,
    text: normalizedText,
    confidence: segment.confidence ?? inferNormalizationConfidence(segment, profile, index)
  };
}

function buildDisplayTranscriptSections(segments: TranscriptSegment[]): LessonSection[] {
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

function normalizeTranscriptText(text: string) {
  const trimmed = text.replace(/\s+/g, "").trim();
  if (!trimmed) return "";
  if (/[。！？!?]$/.test(trimmed)) return trimmed;
  if (/吗|呢|么|什么|为什么|怎么|哪|几|是不是|对不对$/.test(trimmed)) return `${trimmed}？`;
  return `${trimmed}。`;
}

function displayTextForSegment(segment: TranscriptSegment) {
  return (segment.text || "")
    .replace(/^(嗯|啊|呃|额|那个|这个)[，,、\s]*/g, "")
    .replace(/([，,、])?(这个|那个)\2([，,、])/g, "$2$3")
    .trim();
}

function countDisplayCharacters(segments: TranscriptSegment[]) {
  return segments.reduce((sum, segment) => sum + displayTextForSegment(segment).length, 0);
}

function speakerTurnStartsNewBlock(previous: TranscriptSegment, segment: TranscriptSegment, currentTextLength: number) {
  if ((previous.speakerLabel || "") === (segment.speakerLabel || "")) return false;
  if (currentTextLength < 120) return false;
  return isTeacherLikeSegment(previous) !== isTeacherLikeSegment(segment);
}

function activityBoundary(previousText = "", currentText = "") {
  const value = `${previousText} ${currentText}`;
  return /接下来|下面|现在我们|开始练习|小组讨论|总结一下|回顾一下|请大家|谁来说|为什么|再来看/.test(value);
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

function inferTranscriptFlags(segment: TranscriptSegment) {
  const flags: string[] = [];
  const text = segment.text || "";
  if (/嗯|呃|额|那个|这个/.test(text)) flags.push("filler_words");
  if (/([一-龥]{1,4})[，,、]?\1/.test(text)) flags.push("repetition");
  if (/[？?]|为什么|怎么|什么|哪|几|是不是|对不对/.test(text)) flags.push("question");
  if ((segment.confidence ?? 1) < 0.65) flags.push("low_confidence");
  if ((segment.endMs - segment.startMs) > 20_000 && text.length < 8) flags.push("timing_uncertain");
  return flags;
}

function inferNormalizationConfidence(segment: TranscriptSegment, profile: SpeakerProfile | undefined, index: number) {
  let confidence = 0.78;
  if (!profile || profile.role === "unknown") confidence -= 0.12;
  if (index === 0 && isTeacherLikeSegment(segment)) confidence += 0.08;
  if ((segment.text || "").length < 3) confidence -= 0.08;
  return Math.max(0.45, Math.min(0.95, confidence));
}

function scoreTeacherLikelihood(text: string) {
  let score = 0;
  if (/请大家|我们来看|想一想|回答|举手|翻到|开始|停|安静/.test(text)) score += 2;
  if (/为什么|怎么|什么|哪|几|是不是|对不对/.test(text)) score += 1.5;
  if (/很好|不错|对了|再想想|哪里不对|总结/.test(text)) score += 1.5;
  if (/同学们|孩子们|老师/.test(text)) score += 1;
  return score;
}

function isLikelyChoralText(text: string) {
  const compact = text.replace(/\s+/g, "");
  return /^(懂了|会了|明白了|对|是|不是|好|可以)[。！!？?]?$/.test(compact);
}

function isTeacherLikeSegment(segment: TranscriptSegment) {
  const label = segment.speakerLabel || "";
  if (/学生|全班|齐答/.test(label)) return false;
  return /教师|老师|teacher/i.test(label) || scoreTeacherLikelihood(segment.text || "") >= 1.5;
}

function msToClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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

function buildClassroomManagementCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
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

function buildTechnicalIssueCard(input: TeachingEvidenceInput, segments: TranscriptSegment[]): TeachingEvidenceCard | null {
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
    sentiment: "positive",
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

function buildKnowledgeConnectionCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
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

function buildVariationPracticeCard(input: TeachingEvidenceInput, segments: TranscriptSegment[], context: InstructionalContext): TeachingEvidenceCard | null {
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
    sentiment: "positive",
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
    sentiment: "neutral",
    segments: [segment],
    confidence: "medium",
    uncertaintyNote: null
  });
}

function buildManagementObservation(segments: TranscriptSegment[]) {
  const quotes = segments.slice(0, 3).map((segment) => `“${trimQuote(segment.text)}”`).join("、");
  return `在这一片段中，教师通过${quotes}等指令组织课堂秩序、安排任务或推动环节切换。`;
}

function buildManagementSuggestion(segments: TranscriptSegment[]) {
  const anchor = trimQuote(segments[0]?.text || "进入下一环节");
  return `在“${anchor}”这类操作指令后，可以补充一个学习关注点，让学生带着明确任务进入下一步。`;
}

function buildManagementExample(segments: TranscriptSegment[]) {
  const text = segments.map((segment) => segment.text).join(" ");
  if (/翻到|第/.test(text)) return "“先看这一题和刚才例题的条件有什么不同，再开始讨论。”";
  if (/小组|讨论/.test(text)) return "“小组讨论时先确定你们准备用哪一步，再说出选择理由。”";
  return "“开始之前，先想一想刚才的方法在这里要用到哪一步。”";
}

function buildMethodObservation(segment: TranscriptSegment, context: InstructionalContext) {
  const quote = trimQuote(segment.text);
  if (context === "review_lesson" || context === "test_paper_review" || context === "exam_practice") {
    return `教师在“${quote}”这一句中，把当前题目或讲评内容连接到可复用的方法、步骤或策略。`;
  }
  return `教师在“${quote}”这一句中，开始把具体内容提炼成学生后续可以继续使用的做法。`;
}

function buildMethodSuggestion(segment: TranscriptSegment) {
  const method = inferMethodPhrase(segment.text);
  if (method) {
    return `讲完“${method}”后，可以安排一道条件略有变化的练习，请学生先说准备采用哪一步、为什么这样选，再开始作答。`;
  }
  return "在这个方法讲解后，可以安排一道条件略有变化的练习，并请学生先说出准备采用的步骤和理由，再开始作答。";
}

function buildMethodExample(segment: TranscriptSegment) {
  const method = inferMethodPhrase(segment.text);
  if (method) return `“这道题还能直接用${method}吗？你准备先做哪一步，为什么？”`;
  return "“这道题和刚才例题相比，条件有什么变化？你准备先做哪一步，为什么？”";
}

function inferMethodPhrase(text: string) {
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(/(?:通过|用|使用|采用|按照|根据)([^，。！？!?]{2,24})(?:来|去|做|解决|判断|求|证明)/);
  if (match?.[1]) return match[1];
  const keyword = compact.match(/(截长补短|边角边|先[^，。！？!?]{2,18}再[^，。！？!?]{2,18}|通分|约分|辅助线|分类讨论)/);
  return keyword?.[1] || null;
}

function evidenceCard(input: TeachingEvidenceInput, values: {
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

function buildDefaultTeacherView(values: {
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

function inferEvidenceSentiment(values: {
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
