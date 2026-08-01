/// <reference types="node" />

import { readAgentLlmConfig, trimSlash } from "../llm/config";
import { parseJsonObject } from "../llm/json";
import { emitAiAgentDebugLog } from "./agent-logger";
import { createAgentRequestId, createAgentTraceId } from "./trace-context";

export type AgentValidationResult = { valid: boolean; errors: string[] };

export async function callAgent<T>(input: {
  agentName: string;
  promptVersion: string;
  input: unknown;
  traceId?: string;
  validate: (value: unknown) => value is T;
}): Promise<{ output: T; rawOutput: string; parsedOutput: unknown; validationResult: AgentValidationResult }> {
  const config = readAgentLlmConfig();
  if (!config) throw new Error("LLM 配置缺失：需要 LLM_BASE_URL、LLM_API_KEY、LLM_MODEL");

  const traceId = input.traceId || createAgentTraceId(input.agentName);
  const requestId = createAgentRequestId();
  const startedAt = Date.now();
  const operation = "llm.generate_json";
  emitAiAgentDebugLog("agent.request", {
    traceId,
    requestId,
    agentName: input.agentName,
    operation,
    model: config.model,
    input: input.input,
    toolCalls: [],
    status: "started",
    error: null
  });

  try {
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
          { role: "user", content: JSON.stringify(input.input) }
        ]
      })
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`LLM 请求失败 ${response.status}：${responseText.slice(0, 500)}`);
    }

    const responseBody = JSON.parse(responseText) as Record<string, any>;
    const rawOutput = responseBody.choices?.[0]?.message?.content;
    if (!rawOutput) throw new Error("LLM 没有返回内容");
    const parsedOutput = parseJsonObject(rawOutput);
    const validationResult: AgentValidationResult = input.validate(parsedOutput)
      ? { valid: true, errors: [] }
      : { valid: false, errors: ["schema validation returned false"] };
    const tokenUsage = normalizeTokenUsage(responseBody.usage);

    emitAiAgentDebugLog("agent.response", {
      traceId,
      requestId,
      agentName: input.agentName,
      operation,
      model: config.model,
      status: validationResult.valid ? "success" : "invalid",
      durationMs: Date.now() - startedAt,
      tokenUsage,
      output: parsedOutput,
      rawOutput,
      parsedOutput,
      validationResult,
      toolCalls: [],
      error: null
    });
    return { output: parsedOutput as T, rawOutput, parsedOutput, validationResult };
  } catch (error) {
    emitAiAgentDebugLog("agent.error", {
      traceId,
      requestId,
      agentName: input.agentName,
      operation,
      model: config.model,
      status: "error",
      durationMs: Date.now() - startedAt,
      toolCalls: [],
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function callAgentTool<T>(input: {
  agentName: string;
  toolName: string;
  traceId?: string;
  input: unknown;
  execute: () => Promise<T>;
}): Promise<T> {
  const traceId = input.traceId || createAgentTraceId(input.agentName);
  const requestId = createAgentRequestId();
  const startedAt = Date.now();
  emitAiAgentDebugLog("tool.request", {
    traceId,
    requestId,
    agentName: input.agentName,
    operation: input.toolName,
    input: input.input
  });
  try {
    const output = await input.execute();
    emitAiAgentDebugLog("tool.response", {
      traceId,
      requestId,
      agentName: input.agentName,
      operation: input.toolName,
      status: "success",
      durationMs: Date.now() - startedAt,
      output
    });
    return output;
  } catch (error) {
    emitAiAgentDebugLog("tool.error", {
      traceId,
      requestId,
      agentName: input.agentName,
      operation: input.toolName,
      status: "error",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function normalizeTokenUsage(usage: unknown) {
  const candidate = usage && typeof usage === "object" ? usage as Record<string, unknown> : {};
  return {
    input: Number(candidate.prompt_tokens ?? candidate.input_tokens ?? 0),
    output: Number(candidate.completion_tokens ?? candidate.output_tokens ?? 0),
    total: Number(candidate.total_tokens ?? 0)
  };
}
