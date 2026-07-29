import { config } from "./config.js";

export async function generateEvidenceCards({ lesson, sections, goal }) {
  if (!config.llm.baseUrl || !config.llm.apiKey || !config.llm.model) {
    throw new Error("LLM 配置缺失：需要 LLM_BASE_URL、LLM_API_KEY、LLM_MODEL");
  }
  if (!sections.length) throw new Error("还没有可分析的课堂记录");

  const sectionPayload = sections.map((section, index) => ({
    section_id: section.id,
    index: index + 1,
    title: section.title,
    start_ms: section.start_ms,
    end_ms: section.end_ms,
    text: section.edited_summary_text || section.summary_text || ""
  }));

  const observations = await runAgent({
    name: "课堂事实观察 Agent",
    instruction: [
      "你只负责从课堂记录中提取可复核的事实观察。",
      "不要提出建议，不要评价教师表现。",
      "输出 JSON：{ observations: [{ section_id, start_ms, end_ms, observation, quote_text }] }。"
    ].join("\n"),
    payload: {
      lesson: lessonPayload(lesson),
      analysis_goal: goal,
      sections: sectionPayload
    }
  });

  const evidence = await runAgent({
    name: "教学证据分析 Agent",
    instruction: [
      "你负责把事实观察转成候选教学分析证据卡。",
      "每条卡必须有 section_id、时间范围、原文依据和可复核结论。",
      "不要使用视频画面、OCR、表情或板书判断。",
      "输出 JSON：{ cards: [{ section_id, evidence_type, conclusion, start_ms, end_ms, quote_text, confidence_label }] }。"
    ].join("\n"),
    payload: {
      lesson: lessonPayload(lesson),
      analysis_goal: goal || "复盘课堂节奏、提问互动、学生理解线索和下节课改进点",
      observations: observations.observations || [],
      sections: sectionPayload
    }
  });

  const suggestions = await runAgent({
    name: "教学改进建议 Agent",
    instruction: [
      "你负责给候选证据卡补充温和、具体、可执行的教学改进建议。",
      "建议必须基于证据卡，不要新增无法追溯的结论。",
      "输出 JSON：{ suggestions: [{ conclusion, suggestion }] }。"
    ].join("\n"),
    payload: {
      lesson: lessonPayload(lesson),
      cards: evidence.cards || []
    }
  });

  const suggestionByConclusion = new Map((suggestions.suggestions || []).map((item) => [
    String(item.conclusion || "").trim(),
    String(item.suggestion || "").trim()
  ]));
  const rawCards = Array.isArray(evidence.cards) ? evidence.cards : [];
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  return rawCards
    .map((card) => ({
      ...card,
      suggestion: card.suggestion || suggestionByConclusion.get(String(card.conclusion || "").trim()) || ""
    }))
    .map((card) => normalizeCard(card, sectionById))
    .filter(Boolean)
    .slice(0, 6);
}

export async function translateTranscriptSegments({ lesson, segments }) {
  if (!config.llm.baseUrl || !config.llm.apiKey || !config.llm.model) {
    throw new Error("LLM 配置缺失：需要 LLM_BASE_URL、LLM_API_KEY、LLM_MODEL");
  }
  if (!segments.length) return [];

  const results = [];
  for (const chunk of chunkArray(segments, 40)) {
    const translated = await runAgent({
      name: "课堂逐字稿翻译 Agent",
      instruction: [
        "你只负责把课堂逐字稿翻译成自然、准确的中文。",
        "保留教师课堂口语的意思，不要加入教学分析、总结或评价。",
        "数学、英语和课堂指令要按中国教师可读的表达翻译。",
        "必须逐条返回，不要合并或删除片段。",
        "输出 JSON：{ translations: [{ id, translated_text }] }。"
      ].join("\n"),
      payload: {
        lesson: lessonPayload(lesson),
        segments: chunk.map((segment) => ({
          id: segment.id,
          start_ms: segment.start_ms,
          end_ms: segment.end_ms,
          speaker_label: segment.speaker_label,
          original_text: segment.original_text
        }))
      }
    });
    const items = Array.isArray(translated.translations) ? translated.translations : [];
    for (const item of items) {
      const id = String(item.id || "").trim();
      const text = String(item.translated_text || "").trim();
      if (id && text) results.push({ id, translatedText: text });
    }
  }
  return results;
}

async function runAgent({ name, instruction, payload }) {
  const response = await fetch(`${trimSlash(config.llm.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.llm.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${name}\n${instruction}\n输出必须是严格 JSON，不要 Markdown。`
        },
        {
          role: "user",
          content: JSON.stringify(payload)
        }
      ]
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`LLM 分析请求失败 ${response.status}：${bodyText}`);
  }

  const body = JSON.parse(bodyText);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 没有返回分析内容");

  return parseJsonObject(content);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function lessonPayload(lesson) {
  return {
    course_title: lesson.course_title,
    lesson_title: lesson.lesson_title,
    grade: lesson.grade,
    subject: lesson.subject
  };
}

function normalizeCard(card, sectionById) {
  const section = sectionById.get(card.section_id);
  if (!section) return null;

  const startMs = clampNumber(card.start_ms, section.start_ms, section.start_ms, section.end_ms);
  const endMs = clampNumber(card.end_ms, Math.min(section.end_ms, startMs + 180000), startMs + 1000, section.end_ms);
  const conclusion = String(card.conclusion || "").trim();
  if (!conclusion) return null;

  return {
    sectionId: section.id,
    evidenceType: ["事实", "判断", "建议"].includes(card.evidence_type) ? card.evidence_type : "判断",
    conclusion,
    suggestion: String(card.suggestion || "").trim(),
    startMs,
    endMs,
    quoteText: String(card.quote_text || "").trim().slice(0, 500),
    confidenceLabel: ["证据充分", "需要复核", "证据不足"].includes(card.confidence_label) ? card.confidence_label : "需要复核",
    raw: card
  };
}

function parseJsonObject(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM 返回内容不是 JSON");
    return JSON.parse(match[0]);
  }
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
