import { isStrictWorkflowExecution, getWorkflowConfig } from "@class-reflect/config";
import { WorkflowFailureError } from "@class-reflect/shared-types";
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
  systemInstruction?: string;
  validate: (value: unknown) => value is T;
}) {
  if (!readAgentLlmConfig()) { if(isStrictWorkflowExecution()) throw new WorkflowFailureError("configuration","LLM_CONFIG_MISSING","模型服务配置缺失"); return null; }

  for(let attempt=0;;attempt++) {
  try {
    const result = await callAgent<T>({
      agentName: input.agentName,
      promptVersion: input.promptVersion,
      input: input.payload,
      traceId: input.traceId,
      systemInstruction: input.systemInstruction,
      validate: input.validate
    });
    if (!result.validationResult.valid) {
      logger.error("ai call returned invalid payload", {
        promptVersion: input.promptVersion,
        payloadSummary: summarizePayload(input.payload),
        resultSummary: summarizeResult(result.parsedOutput)
      });
      if(isStrictWorkflowExecution()) throw new WorkflowFailureError("schema_invalid","SCHEMA_INVALID","模型输出不符合结构要求");
      return null;
    }

    return result.output;
  } catch (error) {
    if(isStrictWorkflowExecution() && error instanceof WorkflowFailureError && error.kind === "schema_invalid" && attempt < getWorkflowConfig().failurePolicies.schemaRetries) continue;
    logger.error("ai call threw", {
      promptVersion: input.promptVersion,
      agentName: input.agentName,
      payloadSummary: summarizePayload(input.payload),
      error: error instanceof Error ? error.message : String(error)
    });
    if(isStrictWorkflowExecution()) throw error;
    return null;
  }
  }
}
