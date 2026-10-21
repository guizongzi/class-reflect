import {getWorkflowConfig} from "@class-reflect/config";
import {WorkflowFailureError} from "@class-reflect/shared-types";
import {fetchLlmJson,llmResponseFormat} from "./request";
import { loadAppConfig } from "@class-reflect/config";
import { createLogger } from "@class-reflect/observability";
import type { LlmProvider } from "../types";

const logger = createLogger("providers.llm");

export function createConfiguredLlmProvider(): LlmProvider {
  return {
    async generateJson<T>(input: { promptVersion: string; payload: unknown }): Promise<T> {
      const config = loadAppConfig();
      if (!config.llmBaseUrl || !config.llmApiKey || !config.llmModel) {
        throw new WorkflowFailureError("configuration","LLM_CONFIG_MISSING","模型服务配置缺失");
      }
      logger.info("ai call started", {
        promptVersion: input.promptVersion,
        provider: "openai-compatible",
        endpoint: trimSlash(config.llmBaseUrl),
        model: config.llmModel
      });
      const body = await fetchLlmJson(`${trimSlash(config.llmBaseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.llmApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.llmModel,
          temperature: getWorkflowConfig().llm.temperature,
          response_format: llmResponseFormat(getWorkflowConfig().schemas.evidence,config.llmModel,config.llmBaseUrl),
          messages: [
            { role: "system", content: `promptVersion=${input.promptVersion}\n输出严格 JSON，不要 Markdown。` },
            { role: "user", content: JSON.stringify(input.payload) }
          ]
        })
      });
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        logger.error("ai call failed", {
          promptVersion: input.promptVersion,
          provider: "openai-compatible",
          endpoint: trimSlash(config.llmBaseUrl),
          model: config.llmModel,
          reason: "missing_content"
        });
        throw new WorkflowFailureError("schema_invalid","LLM_CONTENT_MISSING","模型未返回有效内容");
      }
      logger.info("ai call completed", {
        promptVersion: input.promptVersion,
        provider: "openai-compatible",
        endpoint: trimSlash(config.llmBaseUrl),
        model: config.llmModel,
        responseSize: content.length
      });
      try { return parseJsonObject(content) as T; } catch { throw new WorkflowFailureError("schema_invalid","LLM_JSON_INVALID","模型输出不是有效 JSON"); }
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
