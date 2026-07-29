import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL,
  s3: {
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "true") === "true"
  },
  asrProvider: process.env.ASR_PROVIDER || "mock",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
  openaiTranslateModel: process.env.OPENAI_TRANSLATE_MODEL || "gpt-4o-mini-transcribe",
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg"
};

export function assertRuntimeConfig() {
  const missing = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  for (const [key, value] of Object.entries(config.s3)) {
    if (["bucket", "accessKeyId", "secretAccessKey"].includes(key) && !value) {
      missing.push(`S3_${key.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`);
    }
  }
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
}
