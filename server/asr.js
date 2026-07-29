import { config } from "./config.js";

export async function transcribeAudio(audioPath, options = {}) {
  if (config.asrProvider === "aliyun") {
    return transcribeWithAliyun(options.audioUrl);
  }
  return mockTranscript();
}

async function transcribeWithAliyun(audioUrl) {
  if (!audioUrl) {
    throw new Error("audioUrl is required when ASR_PROVIDER=aliyun");
  }
  if (!config.aliyun.asrModel || !config.aliyun.dashscopeApiKey) {
    throw new Error("ALIYUN_ASR_MODEL and ALIYUN_DASHSCOPE_API_KEY are required when ASR_PROVIDER=aliyun");
  }

  const taskId = await submitAliyunTranscriptionTask(audioUrl);
  const resultUrl = await waitForAliyunTranscription(taskId);
  const result = await requestJson(resultUrl, { auth: false });
  return parseAliyunTranscriptionResult(result);
}

async function submitAliyunTranscriptionTask(audioUrl) {
  const response = await requestJson(`${trimTrailingSlash(config.aliyun.asrBaseUrl)}/services/audio/asr/transcription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.aliyun.dashscopeApiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable"
    },
    body: JSON.stringify({
      model: config.aliyun.asrModel,
      input: { file_url: audioUrl },
      parameters: {
        channel_id: [0],
        enable_itn: false,
        enable_words: true
      }
    })
  });
  const taskId = response.output?.task_id;
  if (!taskId) {
    throw new Error(`阿里云 ASR 未返回 task_id：${JSON.stringify(response).slice(0, 500)}`);
  }
  return taskId;
}

async function waitForAliyunTranscription(taskId) {
  const deadline = Date.now() + config.aliyun.asrTimeoutMs;
  while (Date.now() < deadline) {
    const response = await requestJson(`${trimTrailingSlash(config.aliyun.asrBaseUrl)}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${config.aliyun.dashscopeApiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
      }
    });
    const output = response.output || {};
    if (output.task_status === "SUCCEEDED") {
      const resultUrl = output.result?.transcription_url;
      if (!resultUrl) throw new Error("阿里云 ASR 成功但没有返回 transcription_url");
      return resultUrl;
    }
    if (["FAILED", "UNKNOWN"].includes(output.task_status)) {
      throw new Error(`阿里云 ASR 任务失败：${output.code || output.task_status} ${output.message || ""}`.trim());
    }
    await sleep(config.aliyun.asrPollIntervalMs);
  }
  throw new Error(`阿里云 ASR 任务超时：${taskId}`);
}

async function requestJson(url, options = {}) {
  const { auth = true, ...fetchOptions } = options;
  const response = await fetch(url, fetchOptions);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`阿里云 ASR 请求失败 ${response.status}：${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

function parseAliyunTranscriptionResult(result) {
  const transcripts = result.transcripts || [];
  const segments = transcripts.flatMap((transcript) => (transcript.sentences || []).map((sentence, index) => ({
    startMs: Number(sentence.begin_time ?? 0),
    endMs: Number(sentence.end_time ?? sentence.begin_time ?? 0),
    speakerLabel: guessSpeaker(sentence.text),
    originalText: String(sentence.text || "").trim(),
    translatedText: null,
    confidence: null,
    sourceMeta: {
      channelId: transcript.channel_id,
      sentenceId: sentence.sentence_id ?? index,
      language: sentence.language,
      emotion: sentence.emotion
    }
  }))).filter((segment) => segment.originalText);
  if (!segments.length) {
    throw new Error("阿里云 ASR 返回结果中没有可用句子");
  }
  return segments.sort((a, b) => a.startMs - b.startMs);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
