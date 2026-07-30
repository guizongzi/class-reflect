import { z } from "zod";

const AppConfigSchema = z.object({
  port: z.number().default(8080),
  frontendOrigin: z.string().default("*"),
  databaseUrl: z.string().optional(),
  r2AccountId: z.string().optional(),
  r2Endpoint: z.string().optional(),
  r2Bucket: z.string().optional(),
  r2AccessKeyId: z.string().optional(),
  r2SecretAccessKey: z.string().optional(),
  r2Region: z.string().default("auto"),
  cloudTasksProjectId: z.string().optional(),
  cloudTasksLocation: z.string().default("asia-southeast1"),
  cloudTasksQueue: z.string().optional(),
  workerBaseUrl: z.string().optional(),
  workflowTaskPath: z.string().default("/api/workflows/process"),
  asrProvider: z.string().default("mock"),
  aliyunAsrModel: z.string().default("qwen3-asr-flash-filetrans"),
  aliyunAsrBaseUrl: z.string().default("https://dashscope.aliyuncs.com/api/v1"),
  aliyunDashscopeApiKey: z.string().optional(),
  aliyunAsrTimeoutMs: z.number().default(600000),
  aliyunAsrPollIntervalMs: z.number().default(3000),
  llmBaseUrl: z.string().optional(),
  llmApiKey: z.string().optional(),
  llmModel: z.string().optional(),
  translationProvider: z.string().default("mymemory"),
  myMemoryEmail: z.string().optional()
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadAppConfig(): AppConfig {
  const raw = process.env.APP_CONFIG_ENV ? JSON.parse(process.env.APP_CONFIG_ENV) : {};
  return AppConfigSchema.parse({
      port: Number(process.env.PORT || raw.PORT || raw.port || 8080),
      frontendOrigin: process.env.FRONTEND_ORIGIN || raw.FRONTEND_ORIGIN || raw.frontendOrigin || "*",
      databaseUrl: process.env.DATABASE_URL || raw.DATABASE_URL || raw.databaseUrl,
      r2AccountId: process.env.R2_ACCOUNT_ID || raw.R2_ACCOUNT_ID || raw.r2?.accountId,
      r2Endpoint: process.env.R2_ENDPOINT || raw.R2_ENDPOINT || raw.r2?.endpoint,
      r2Bucket: process.env.R2_BUCKET || raw.R2_BUCKET || raw.r2?.bucket,
      r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || raw.R2_ACCESS_KEY_ID || raw.r2?.accessKeyId,
      r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || raw.R2_SECRET_ACCESS_KEY || raw.r2?.secretAccessKey,
    r2Region: process.env.R2_REGION || raw.R2_REGION || raw.r2?.region || "auto",
      cloudTasksProjectId: process.env.CLOUD_TASKS_PROJECT_ID || raw.CLOUD_TASKS_PROJECT_ID || raw.cloudTasksProjectId,
      cloudTasksLocation: process.env.CLOUD_TASKS_LOCATION || raw.CLOUD_TASKS_LOCATION || raw.cloudTasksLocation || "asia-southeast1",
      cloudTasksQueue: process.env.CLOUD_TASKS_QUEUE || raw.CLOUD_TASKS_QUEUE || raw.cloudTasksQueue,
      workerBaseUrl: process.env.WORKER_BASE_URL || raw.WORKER_BASE_URL || raw.workerBaseUrl,
      workflowTaskPath: process.env.WORKFLOW_TASK_PATH || raw.WORKFLOW_TASK_PATH || raw.workflowTaskPath || "/api/workflows/process",
    asrProvider: process.env.ASR_PROVIDER || raw.ASR_PROVIDER || raw.asrProvider || "mock",
    aliyunAsrModel:
      process.env.ALIYUN_ASR_MODEL ||
      raw.ALIYUN_ASR_MODEL ||
      raw.aliyun?.asrModel ||
      "qwen3-asr-flash-filetrans",
    aliyunAsrBaseUrl:
      process.env.ALIYUN_ASR_BASE_URL ||
      raw.ALIYUN_ASR_BASE_URL ||
      raw.aliyun?.asrBaseUrl ||
      "https://dashscope.aliyuncs.com/api/v1",
    aliyunDashscopeApiKey:
      process.env.ALIYUN_DASHSCOPE_API_KEY ||
      raw.ALIYUN_DASHSCOPE_API_KEY ||
      raw.aliyun?.dashscopeApiKey,
    aliyunAsrTimeoutMs: Number(
      process.env.ALIYUN_ASR_TIMEOUT_MS ||
      raw.ALIYUN_ASR_TIMEOUT_MS ||
      raw.aliyun?.asrTimeoutMs ||
      600000
    ),
    aliyunAsrPollIntervalMs: Number(
      process.env.ALIYUN_ASR_POLL_INTERVAL_MS ||
      raw.ALIYUN_ASR_POLL_INTERVAL_MS ||
      raw.aliyun?.asrPollIntervalMs ||
      3000
    ),
    llmBaseUrl: process.env.LLM_BASE_URL || raw.LLM_BASE_URL || raw.llm?.baseUrl,
    llmApiKey: process.env.LLM_API_KEY || raw.LLM_API_KEY || raw.llm?.apiKey,
    llmModel: process.env.LLM_MODEL || raw.LLM_MODEL || raw.llm?.model,
    translationProvider:
      process.env.TRANSLATION_PROVIDER ||
      raw.TRANSLATION_PROVIDER ||
      raw.translation?.provider ||
      "mymemory",
    myMemoryEmail: process.env.MYMEMORY_EMAIL || raw.MYMEMORY_EMAIL || raw.translation?.myMemoryEmail
  });
}
