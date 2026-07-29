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
  asrProvider: z.string().default("mock"),
  aliyunAsrModel: z.string().default("qwen3-asr-flash-filetrans")
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
      asrProvider: process.env.ASR_PROVIDER || raw.ASR_PROVIDER || raw.asrProvider || "mock",
    aliyunAsrModel:
      process.env.ALIYUN_ASR_MODEL ||
      raw.ALIYUN_ASR_MODEL ||
      raw.aliyun?.asrModel ||
      "qwen3-asr-flash-filetrans"
  });
}
