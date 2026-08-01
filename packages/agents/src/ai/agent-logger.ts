/// <reference types="node" />

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prepareAgentLogData } from "./redact-log-data";

export type AiAgentDebugEvent = "agent.request" | "agent.response" | "agent.error" | "tool.request" | "tool.response" | "tool.error";

type AiAgentDebugConfig = {
  enabled: boolean;
  includeBody: boolean;
  writeToFile: boolean;
  filePath: string;
};

export function emitAiAgentDebugLog(event: AiAgentDebugEvent, payload: Record<string, unknown>) {
  const config = readAiAgentDebugConfig();
  if (!config.enabled) return;

  const preparedPayload = prepareAgentLogData(payload, { includeBody: config.includeBody });
  const safePayload = preparedPayload && typeof preparedPayload === "object" && !Array.isArray(preparedPayload)
    ? preparedPayload as Record<string, unknown>
    : { payload: preparedPayload };
  const entry = {
    scope: "ai-agent-debug",
    event,
    ...safePayload,
    timestamp: new Date().toISOString()
  };
  const line = JSON.stringify(entry);
  console.log(line);

  if (config.writeToFile) {
    try {
      mkdirSync(dirname(config.filePath), { recursive: true });
      appendFileSync(config.filePath, `${line}\n`, "utf8");
    } catch (error) {
      console.error(JSON.stringify({
        scope: "ai-agent-debug",
        event: "agent.error",
        status: "log_write_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }));
    }
  }
}

export function isAiAgentDebugLoggingEnabled() {
  return readAiAgentDebugConfig().enabled;
}

function readAiAgentDebugConfig(): AiAgentDebugConfig {
  const raw = readRawConfig();
  const enabled = readBoolean(process.env.AI_AGENT_DEBUG_LOG ?? raw.AI_AGENT_DEBUG_LOG ?? raw.aiAgentDebugLog, false);
  return {
    enabled,
    includeBody: readBoolean(process.env.AI_AGENT_LOG_BODY ?? raw.AI_AGENT_LOG_BODY ?? raw.aiAgentLogBody, false),
    writeToFile: readBoolean(process.env.AI_AGENT_LOG_FILE ?? raw.AI_AGENT_LOG_FILE ?? raw.aiAgentLogFile, false),
    filePath: String(process.env.AI_AGENT_LOG_FILE_PATH ?? raw.AI_AGENT_LOG_FILE_PATH ?? raw.aiAgentLogFilePath ?? resolve(process.cwd(), "logs/ai-agent-debug.log"))
  };
}

function readRawConfig(): Record<string, unknown> {
  try {
    return process.env.APP_CONFIG_ENV ? JSON.parse(process.env.APP_CONFIG_ENV) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}
