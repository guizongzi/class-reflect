import { Controller, Get } from "@nestjs/common";
import { loadAppConfig } from "@class-reflect/config";

@Controller("api/health")
export class HealthController {
  @Get()
  getHealth() {
    const config = loadAppConfig();
    return {
      ok: true,
      service: "class-reflect-api",
      runtime: "nestjs",
      asr_provider: config.asrProvider,
      asr_model: config.aliyunAsrModel,
      llm_provider: config.llmBaseUrl ? "openai-compatible" : "not_configured",
      llm_model: config.llmModel || null
    };
  }
}
