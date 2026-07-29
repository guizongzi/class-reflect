import { z } from "zod";

const AppConfigSchema = z.object({
  port: z.number().default(8080),
  frontendOrigin: z.string().default("*"),
  asrProvider: z.string().default("mock"),
  aliyunAsrModel: z.string().default("qwen3-asr-flash-filetrans")
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadAppConfig(): AppConfig {
  const raw = process.env.APP_CONFIG_ENV ? JSON.parse(process.env.APP_CONFIG_ENV) : {};
  return AppConfigSchema.parse({
    port: Number(process.env.PORT || raw.PORT || raw.port || 8080),
    frontendOrigin: process.env.FRONTEND_ORIGIN || raw.FRONTEND_ORIGIN || raw.frontendOrigin || "*",
    asrProvider: process.env.ASR_PROVIDER || raw.ASR_PROVIDER || raw.asrProvider || "mock",
    aliyunAsrModel:
      process.env.ALIYUN_ASR_MODEL ||
      raw.ALIYUN_ASR_MODEL ||
      raw.aliyun?.asrModel ||
      "qwen3-asr-flash-filetrans"
  });
}
