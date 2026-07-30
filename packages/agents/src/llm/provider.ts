/// <reference types="node" />

import { readAgentLlmConfig, trimSlash } from "./config";
import { parseJsonObject } from "./json";
import { logger } from "./logger";
import { summarizePayload, summarizeResult } from "./summary";

function createAgentLlmProvider() {
  try {
    const config = readAgentLlmConfig();
    if (!config) {
      return null;
    }

    return {
      async generateJson<T>(input: { promptVersion: string; payload: unknown }): Promise<T> {
        logger.info("ai call started", {
          promptVersion: input.promptVersion,
          provider: "openai-compatible",
          endpoint: trimSlash(config.baseUrl),
          payloadSummary: summarizePayload(input.payload)
        });
        const response = await fetch(`${trimSlash(config.baseUrl)}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: config.model,
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
            endpoint: trimSlash(config.baseUrl),
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
            endpoint: trimSlash(config.baseUrl),
            reason: "missing_content"
          });
          throw new Error("LLM 没有返回内容");
        }

        logger.info("ai call completed", {
          promptVersion: input.promptVersion,
          provider: "openai-compatible",
          endpoint: trimSlash(config.baseUrl),
          responseSize: content.length
        });
        return parseJsonObject(content) as T;
      }
    };
  } catch {
    return null;
  }
}

export async function tryRunLlmAgent<T>(input: { promptVersion: string; payload: unknown; validate: (value: unknown) => value is T }) {
  const llm = createAgentLlmProvider();
  if (!llm) return null;

  try {
    const result = await llm.generateJson<T>({ promptVersion: input.promptVersion, payload: input.payload });
    if (!input.validate(result)) {
      logger.error("ai call returned invalid payload", {
        promptVersion: input.promptVersion,
        payloadSummary: summarizePayload(input.payload),
        resultSummary: summarizeResult(result)
      });
    return null;
  }

    return result;
  } catch {
    logger.error("ai call threw", {
      promptVersion: input.promptVersion,
      payloadSummary: summarizePayload(input.payload)
    });
    return null;
  }
}
