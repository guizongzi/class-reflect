import assert from "node:assert/strict";
import test from "node:test";
import { runTeachingEvidenceAgent } from "./run";

test("teaching evidence agent generates deterministic wait-time evidence without LLM", async () => {
  const previousBaseUrl = process.env.LLM_BASE_URL;
  const previousApiKey = process.env.LLM_API_KEY;
  const previousModel = process.env.LLM_MODEL;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_MODEL;

  try {
    const result = await runTeachingEvidenceAgent({
      lessonId: "lesson-1",
      lesson_format: "offline_classroom_recording",
      transcriptSegments: [
        {
          id: "sent-q",
          startMs: 1000,
          endMs: 2000,
          speakerLabel: "教师",
          text: "这个角为什么等于四十度？",
          confidence: 0.94
        },
        {
          id: "sent-a",
          startMs: 2500,
          endMs: 4200,
          speakerLabel: "教师",
          text: "因为它们是对应角。",
          confidence: 0.93
        }
      ],
      metrics: [],
      classroomEvents: [],
      generationConfig: {
        language: "zh-CN",
        enabledCategories: ["wait_time", "question_quality"],
        maxEvidenceCards: 4,
        minimumConfidence: "low"
      }
    });

    const waitCard = result.output.evidenceCards.find((card) => card.category === "wait_time");
    assert.ok(waitCard);
    assert.deepEqual(waitCard.transcriptSegmentIds, ["sent-q", "sent-a"]);
    assert.equal(waitCard.startMs, 1000);
    assert.equal(waitCard.endMs, 4200);
  } finally {
    restoreEnv("LLM_BASE_URL", previousBaseUrl);
    restoreEnv("LLM_API_KEY", previousApiKey);
    restoreEnv("LLM_MODEL", previousModel);
  }
});

test("teaching evidence agent filters LLM cards by allowed polarity, supported category, and duplicate sources", async () => {
  const previousBaseUrl = process.env.LLM_BASE_URL;
  const previousApiKey = process.env.LLM_API_KEY;
  const previousModel = process.env.LLM_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.LLM_BASE_URL = "https://llm.example.test";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "test-model";
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          lessonId: "lesson-filter",
          lesson_format: "recorded_online_class",
          instructionalContext: "unknown",
          evidenceCards: [
            llmCard("card-1", "question_quality", "negative", ["s0"], "自学问题目标模糊"),
            llmCard("card-2", "feedback_quality", "negative", ["s1"], "录播课不应生成实时反馈负证据"),
            llmCard("card-3", "question_quality", "negative", ["s0"], "重复的自学问题目标模糊"),
            llmCard("card-4", "self_check", "negative", ["s2"], "自测任务缺少标准")
          ]
        })
      }
    }],
    usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }
  }), { status: 200 });

  try {
    const result = await runTeachingEvidenceAgent({
      lessonId: "lesson-filter",
      lesson_format: "recorded_online_class",
      transcriptSegments: [
        {
          id: "sent-1",
          startMs: 1000,
          endMs: 2000,
          speakerLabel: "教师",
          text: "请暂停视频，想一想这个问题到底要你判断什么。",
          confidence: 0.94
        },
        {
          id: "sent-2",
          startMs: 3000,
          endMs: 4000,
          speakerLabel: "教师",
          text: "很好。",
          confidence: 0.92
        },
        {
          id: "sent-3",
          startMs: 5000,
          endMs: 6000,
          speakerLabel: "教师",
          text: "接下来我们忽然换到另一个没有说明关系的知识点。",
          confidence: 0.91
        }
      ],
      metrics: [],
      classroomEvents: [],
      generationConfig: {
        language: "zh-CN",
        enabledCategories: ["question_quality", "feedback_quality", "lesson_structure"],
        maxEvidenceCards: 6,
        minimumConfidence: "low"
      }
    });

    assert.deepEqual(result.output.evidenceCards.map((card) => card.id), ["card-1"]);
    assert.deepEqual(result.output.evidenceCards[0]?.transcriptSegmentIds, ["sent-1"]);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("LLM_BASE_URL", previousBaseUrl);
    restoreEnv("LLM_API_KEY", previousApiKey);
    restoreEnv("LLM_MODEL", previousModel);
  }
});

test("teaching evidence agent keeps same-category cards when they point to different events", async () => {
  const previousBaseUrl = process.env.LLM_BASE_URL;
  const previousApiKey = process.env.LLM_API_KEY;
  const previousModel = process.env.LLM_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.LLM_BASE_URL = "https://llm.example.test";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "test-model";
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          lessonId: "lesson-same-category",
          lesson_format: "teacher_certification_interview",
          instructionalContext: "unknown",
          evidenceCards: [
            llmCard("card-q1", "question_quality", "negative", ["s0"], "第一处低阶提问"),
            llmCard("card-q2", "question_quality", "negative", ["s2"], "第二处低阶提问"),
            llmCard("card-q3", "question_quality", "negative", ["s2"], "第二处低阶提问重复")
          ]
        })
      }
    }],
    usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }
  }), { status: 200 });

  try {
    const result = await runTeachingEvidenceAgent({
      lessonId: "lesson-same-category",
      lesson_format: "teacher_certification_interview",
      transcriptSegments: [
        {
          id: "sent-1",
          startMs: 1000,
          endMs: 2000,
          speakerLabel: "教师",
          text: "看到了吗？对吧？",
          confidence: 0.94
        },
        {
          id: "sent-2",
          startMs: 3000,
          endMs: 4000,
          speakerLabel: "教师",
          text: "我们继续看例题。",
          confidence: 0.92
        },
        {
          id: "sent-3",
          startMs: 5000,
          endMs: 6000,
          speakerLabel: "教师",
          text: "是不是相等？很好。",
          confidence: 0.91
        }
      ],
      metrics: [],
      classroomEvents: [],
      generationConfig: {
        language: "zh-CN",
        enabledCategories: ["question_quality"],
        maxEvidenceCards: 6,
        minimumConfidence: "low"
      }
    });

    assert.deepEqual(result.output.evidenceCards.map((card) => card.id), ["card-q1", "card-q2"]);
    assert.deepEqual(result.output.evidenceCards.map((card) => card.transcriptSegmentIds), [["sent-1"], ["sent-3"]]);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("LLM_BASE_URL", previousBaseUrl);
    restoreEnv("LLM_API_KEY", previousApiKey);
    restoreEnv("LLM_MODEL", previousModel);
  }
});

function llmCard(
  id: string,
  category: string,
  sentiment: "positive" | "neutral" | "negative",
  transcriptSegmentIds: string[],
  title: string
) {
  return {
    id,
    category,
    sentiment,
    title,
    fact: title,
    interpretation: title,
    quote: "",
    transcriptSegmentIds,
    metricIds: [],
    classroomEventIds: [],
    applicableLessonFormats: ["offline_classroom_recording", "live_online_class", "recorded_online_class", "teacher_certification_interview"],
    confidence: "medium",
    uncertaintyNote: null,
    reviewStatus: "pending_review",
    analysis: {
      evidenceCategory: category,
      reasonTags: ["missed_opportunity"],
      internalReason: title
    }
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}
