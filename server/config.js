await import("dotenv/config").catch(() => {});

const appConfigEnv = parseAppConfigEnv(process.env.APP_CONFIG_ENV);

export const config = {
  port: Number(readConfig("PORT", "port") || 3000),
  publicBaseUrl: readConfig("PUBLIC_BASE_URL", "publicBaseUrl") || "http://localhost:3000",
  frontendOrigin: readConfig("FRONTEND_ORIGIN", "frontendOrigin") || "http://localhost:3000",
  databaseUrl: readConfig("DATABASE_URL", "databaseUrl") || readConfig("DIRECT_URL", "directUrl"),
  directUrl: readConfig("DIRECT_URL", "directUrl"),
  supabase: {
    url: readConfig("SUPABASE_URL", "supabase.url"),
    anonKey: readConfig("SUPABASE_ANON_KEY", "supabase.anonKey"),
    serviceRoleKey: readConfig("SUPABASE_SERVICE_ROLE_KEY", "supabase.serviceRoleKey")
  },
  r2: {
    accountId: readConfig("R2_ACCOUNT_ID", "r2.accountId"),
    region: readConfig("R2_REGION", "r2.region") || "auto",
    endpoint: readConfig("R2_ENDPOINT", "r2.endpoint"),
    bucket: readConfig("R2_BUCKET", "r2.bucket"),
    accessKeyId: readConfig("R2_ACCESS_KEY_ID", "r2.accessKeyId"),
    secretAccessKey: readConfig("R2_SECRET_ACCESS_KEY", "r2.secretAccessKey"),
    forcePathStyle: true
  },
  asrProvider: readConfig("ASR_PROVIDER", "asrProvider") || "mock",
  aliyun: {
    asrModel: readConfig("ALIYUN_ASR_MODEL", "aliyun.asrModel") || "qwen3-asr-flash-filetrans",
    asrBaseUrl: readConfig("ALIYUN_ASR_BASE_URL", "aliyun.asrBaseUrl") || "https://dashscope.aliyuncs.com/api/v1",
    dashscopeApiKey: readConfig("ALIYUN_DASHSCOPE_API_KEY", "aliyun.dashscopeApiKey") || readConfig("LLM_API_KEY", "llm.apiKey"),
    asrPollIntervalMs: Number(readConfig("ALIYUN_ASR_POLL_INTERVAL_MS", "aliyun.asrPollIntervalMs") || 3000),
    asrTimeoutMs: Number(readConfig("ALIYUN_ASR_TIMEOUT_MS", "aliyun.asrTimeoutMs") || 10 * 60 * 1000),
    asrFileUrlExpiresSeconds: Number(readConfig("ALIYUN_ASR_FILE_URL_EXPIRES_SECONDS", "aliyun.asrFileUrlExpiresSeconds") || 3600),
    accessKeyId: readConfig("ALIYUN_ACCESS_KEY_ID", "aliyun.accessKeyId"),
    accessKeySecret: readConfig("ALIYUN_ACCESS_KEY_SECRET", "aliyun.accessKeySecret")
  },
  llm: {
    baseUrl: readConfig("LLM_BASE_URL", "llm.baseUrl"),
    apiKey: readConfig("LLM_API_KEY", "llm.apiKey"),
    model: readConfig("LLM_MODEL", "llm.model")
  },
  ffmpegPath: readConfig("FFMPEG_PATH", "ffmpegPath") || "ffmpeg"
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

function parseAppConfigEnv(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("APP_CONFIG_ENV must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid APP_CONFIG_ENV JSON: ${error.message}`);
  }
}

function readConfig(envKey, pathKey) {
  return process.env[envKey] ?? appConfigEnv[envKey] ?? readPath(appConfigEnv, pathKey);
}

function readPath(source, pathKey) {
  return pathKey.split(".").reduce((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return value[key];
  }, source);
}
