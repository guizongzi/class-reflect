/// <reference types="node" />

import { callAgent } from "../ai";
import { readAgentLlmConfig } from "./config";
import { logger } from "./logger";
import { summarizePayload, summarizeResult } from "./summary";

export async function tryRunLlmAgent<T>(input: {
  agentName: string;
  promptVersion: string;
  payload: unknown;
  traceId?: string;
  validate: (value: unknown) => value is T;
}) {
  if (!readAgentLlmConfig()) return null;

  try {
    const result = await callAgent<T>({
      agentName: input.agentName,
      promptVersion: input.promptVersion,
      input: input.payload,
      traceId: input.traceId,
      validate: input.validate
    });
    if (!result.validationResult.valid) {
      logger.error("ai call returned invalid payload", {
        promptVersion: input.promptVersion,
        payloadSummary: summarizePayload(input.payload),
        resultSummary: summarizeResult(result.parsedOutput)
      });
      return null;
    }

    return result.output;
  } catch (error) {
    logger.error("ai call threw", {
      promptVersion: input.promptVersion,
      agentName: input.agentName,
      payloadSummary: summarizePayload(input.payload),
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}
