import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL || process.env.DIRECT_URL,
  directUrl: process.env.DIRECT_URL,
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    region: process.env.R2_REGION || "auto",
    endpoint: process.env.R2_ENDPOINT,
    bucket: process.env.R2_BUCKET,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    forcePathStyle: true
  },
  asrProvider: process.env.ASR_PROVIDER || "mock",
  aliyun: {
    asrModel: process.env.ALIYUN_ASR_MODEL || "qwen3-asr-flash-filetrans",
    asrBaseUrl: process.env.ALIYUN_ASR_BASE_URL || "https://dashscope.aliyuncs.com/api/v1",
    dashscopeApiKey: process.env.ALIYUN_DASHSCOPE_API_KEY || process.env.LLM_API_KEY,
    asrPollIntervalMs: Number(process.env.ALIYUN_ASR_POLL_INTERVAL_MS || 3000),
    asrTimeoutMs: Number(process.env.ALIYUN_ASR_TIMEOUT_MS || 10 * 60 * 1000),
    asrFileUrlExpiresSeconds: Number(process.env.ALIYUN_ASR_FILE_URL_EXPIRES_SECONDS || 3600),
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL
  },
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg"
};

export function assertRuntimeConfig() {
  const missing = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  for (const [key, value] of Object.entries(config.r2)) {
    if (["bucket", "accessKeyId", "secretAccessKey"].includes(key) && !value) {
      missing.push(`R2_${key.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`);
    }
  }
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
}
