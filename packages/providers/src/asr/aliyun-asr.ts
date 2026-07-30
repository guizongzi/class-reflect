import { loadAppConfig } from "@class-reflect/config";
import type { AsrProvider } from "../types";

export function createAliyunAsrProvider(): AsrProvider {
  return {
    async transcribe(input: { audioUrl: string }) {
      const config = loadAppConfig();
      if (!input.audioUrl) throw new Error("audioUrl is required when ASR_PROVIDER=aliyun");
      if (!config.aliyunAsrModel || !config.aliyunDashscopeApiKey) {
        throw new Error("ALIYUN_ASR_MODEL and ALIYUN_DASHSCOPE_API_KEY are required when ASR_PROVIDER=aliyun");
      }
      const taskId = await submitAliyunTranscriptionTask(input.audioUrl);
      const resultUrl = await waitForAliyunTranscription(taskId);
      const result = await requestJson(resultUrl, { auth: false });
      return parseAliyunTranscriptionResult(result);
    }
  };
}

async function submitAliyunTranscriptionTask(audioUrl: string) {
  const config = loadAppConfig();
  const response = await requestJson(`${trimSlash(config.aliyunAsrBaseUrl)}/services/audio/asr/transcription`, {
    phase: "submit",
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.aliyunDashscopeApiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable"
    },
    body: JSON.stringify({
      model: config.aliyunAsrModel,
      input: { file_url: audioUrl },
      parameters: {
        channel_id: [0],
        diarization_enabled: true,
        enable_itn: false,
        enable_words: true
      }
    })
  });
  const taskId = response.output?.task_id;
  if (!taskId) throw new Error(`阿里云 ASR 未返回 task_id：${JSON.stringify(response).slice(0, 500)}`);
  return String(taskId);
}

async function waitForAliyunTranscription(taskId: string) {
  const config = loadAppConfig();
  const deadline = Date.now() + config.aliyunAsrTimeoutMs;
  while (Date.now() < deadline) {
    const response = await requestJson(`${trimSlash(config.aliyunAsrBaseUrl)}/tasks/${taskId}`, {
      phase: "poll",
      headers: {
        Authorization: `Bearer ${config.aliyunDashscopeApiKey}`,
        "Content-Type": "application/json"
      }
    });
    const output = response.output || {};
    if (output.task_status === "SUCCEEDED") {
      const resultUrl = output.result?.transcription_url
        || output.transcription_url
        || output.results?.[0]?.transcription_url;
      if (!resultUrl) throw new Error("阿里云 ASR 成功但没有返回 transcription_url");
      return String(resultUrl);
    }
    if (["FAILED", "UNKNOWN"].includes(output.task_status)) {
      throw new Error(`阿里云 ASR 任务失败：${output.code || output.task_status} ${output.message || ""}`.trim());
    }
    await sleep(config.aliyunAsrPollIntervalMs);
  }
  throw new Error(`阿里云 ASR 任务超时：${taskId}`);
}

async function requestJson(url: string, options: RequestInit & { auth?: boolean; phase?: string } = {}) {
  const { auth: _auth = true, phase = "request", ...fetchOptions } = options;
  const response = await fetch(url, fetchOptions);
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) throw new Error(`阿里云 ASR ${phase} 请求失败 ${response.status}：${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

function parseAliyunTranscriptionResult(result: any) {
  const transcripts = Array.isArray(result.transcripts) ? result.transcripts : [];
  const segments = transcripts.flatMap((transcript: any) => {
    const sentences = Array.isArray(transcript.sentences) ? transcript.sentences : [];
    return sentences.map((sentence: any, index: number) => {
      const speakerId = readSpeakerId(sentence);
      return {
        startMs: Number(sentence.begin_time ?? 0),
        endMs: Number(sentence.end_time ?? sentence.begin_time ?? 0),
        speakerId,
        speakerLabel: speakerId == null ? guessSpeaker(String(sentence.text || "")) : formatSpeakerLabel(speakerId),
        text: String(sentence.text || "").trim(),
        sourceMeta: {
          channelId: transcript.channel_id,
          sentenceId: sentence.sentence_id ?? index,
          speakerId,
          language: sentence.language,
          emotion: sentence.emotion
        }
      };
    });
  }).filter((segment: { text: string }) => segment.text);
  if (!segments.length) throw new Error("阿里云 ASR 返回结果中没有可用句子");
  return segments.sort((a: { startMs: number }, b: { startMs: number }) => a.startMs - b.startMs);
}

function readSpeakerId(sentence: any) {
  const value = sentence.speaker_id ?? sentence.speaker ?? sentence.spk ?? sentence.spk_id;
  if (value === undefined || value === null || value === "") return null;
  return value;
}

function formatSpeakerLabel(speakerId: string | number) {
  const numeric = Number(speakerId);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < 26) {
    return `说话人 ${String.fromCharCode(65 + numeric)}`;
  }
  return `说话人 ${speakerId}`;
}

function guessSpeaker(text: string) {
  if (/老师|请大家|想一想|同学|我们来看|回答/.test(text)) return "教师";
  return "未知";
}

function trimSlash(value: string) {
  return String(value || "").replace(/\/+$/, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
