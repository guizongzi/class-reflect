import { config } from "./config.js";

export async function transcribeAudio(audioPath) {
  if (config.asrProvider === "aliyun") {
    return transcribeWithAliyun(audioPath);
  }
  return mockTranscript();
}

async function transcribeWithAliyun(audioPath) {
  if (!config.aliyun.asrModel || !config.aliyun.asrAppKey || !config.aliyun.accessKeyId || !config.aliyun.accessKeySecret) {
    throw new Error("ALIYUN_ASR_MODEL, ALIYUN_ASR_APP_KEY, ALIYUN_ACCESS_KEY_ID and ALIYUN_ACCESS_KEY_SECRET are required when ASR_PROVIDER=aliyun");
  }
  throw new Error("阿里云 ASR 接入点已预留，第一版本地演示请先使用 ASR_PROVIDER=mock");
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
