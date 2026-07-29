import fs from "node:fs";
import OpenAI from "openai";
import { config } from "./config.js";

export async function transcribeAudio(audioPath) {
  if (config.asrProvider === "openai") {
    return transcribeWithOpenAI(audioPath);
  }
  return mockTranscript();
}

async function transcribeWithOpenAI(audioPath) {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when ASR_PROVIDER=openai");
  }
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const transcription = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: config.openaiTranscribeModel,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"]
  });
  const segments = transcription.segments || [];
  return segments.map((segment, index) => ({
    startMs: Math.round((segment.start || index * 30) * 1000),
    endMs: Math.round((segment.end || index * 30 + 25) * 1000),
    speakerLabel: guessSpeaker(segment.text),
    originalText: segment.text?.trim() || "",
    translatedText: null,
    confidence: null
  })).filter((segment) => segment.originalText);
}

function mockTranscript() {
  return [
    ["教师", 0, 270000, "今天我们复习分数的意义。请大家想一想，什么叫做平均分？"],
    ["学生", 270000, 550000, "把一个整体分成一样多的几份。"],
    ["教师", 680000, 890000, "如果把三分之五再平均分成四份，每一份是它的几分之几？"],
    ["学生", 892100, 900000, "十二分之一。"],
    ["教师", 900000, 1240000, "很好。像这样表示其中一份的数，就叫作这个分数的分数单位。"]
  ].map(([speakerLabel, startMs, endMs, originalText]) => ({
    speakerLabel,
    startMs,
    endMs,
    originalText,
    translatedText: null,
    confidence: 0.92
  }));
}

function guessSpeaker(text = "") {
  if (/老师|请大家|想一想|同学/.test(text)) return "教师";
  return "未知";
}
