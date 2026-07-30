import { loadAppConfig } from "@class-reflect/config";
import { createLogger } from "@class-reflect/observability";
import type { LlmProvider } from "../types";

const logger = createLogger("providers.llm");

export function createConfiguredLlmProvider(): LlmProvider {
  return {
    async generateJson<T>(input: { promptVersion: string; payload: unknown }): Promise<T> {
      const config = loadAppConfig();
      if (!config.llmBaseUrl || !config.llmApiKey || !config.llmModel) {
        throw new Error("LLM 配置缺失：需要 LLM_BASE_URL、LLM_API_KEY、LLM_MODEL");
      }
      logger.info("ai call started", {
        promptVersion: input.promptVersion,
        provider: "openai-compatible",
        endpoint: trimSlash(config.llmBaseUrl),
        model: config.llmModel
      });
      const response = await fetch(`${trimSlash(config.llmBaseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.llmApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.llmModel,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `promptVersion=${input.promptVersion}\n输出严格 JSON，不要 Markdown。` },
            { role: "user", content: JSON.stringify(input.payload) }
          ]
        })
      });
      const bodyText = await response.text();
      if (!response.ok) {
        logger.error("ai call failed", {
          promptVersion: input.promptVersion,
          provider: "openai-compatible",
          endpoint: trimSlash(config.llmBaseUrl),
          model: config.llmModel,
          status: response.status,
          bodyPreview: bodyText.slice(0, 500)
        });
        throw new Error(`LLM 请求失败 ${response.status}：${bodyText.slice(0, 500)}`);
      }
      const body = JSON.parse(bodyText);
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        logger.error("ai call failed", {
          promptVersion: input.promptVersion,
          provider: "openai-compatible",
          endpoint: trimSlash(config.llmBaseUrl),
          model: config.llmModel,
          reason: "missing_content"
        });
        throw new Error("LLM 没有返回内容");
      }
      logger.info("ai call completed", {
        promptVersion: input.promptVersion,
        provider: "openai-compatible",
        endpoint: trimSlash(config.llmBaseUrl),
        model: config.llmModel,
        responseSize: content.length
      });
      return parseJsonObject(content) as T;
    }
  };
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型返回内容不是 JSON");
    return JSON.parse(match[0]);
  }
}

function trimSlash(value: string) {
  return String(value || "").replace(/\/+$/, "");
}
