import {createLogger} from '@class-reflect/observability';
import {getTraceContext} from "@class-reflect/observability";
import {getWorkflowConfig,isStrictWorkflowExecution,matchesWorkflowSchema} from "@class-reflect/config";
import {WorkflowFailureError} from "@class-reflect/shared-types";
import {fetchLlmJson,llmResponseFormat} from "@class-reflect/providers";
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
  systemInstruction?: string;
  validate: (value: unknown) => value is T;
}): Promise<{ output: T; rawOutput: string; parsedOutput: unknown; validationResult: AgentValidationResult }> {
  const config = readAgentLlmConfig();
  if (!config) throw new WorkflowFailureError("configuration","LLM_CONFIG_MISSING","模型服务配置缺失");

  const traceId = getTraceContext()?.traceId || input.traceId || createAgentTraceId(input.agentName);
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

  let schemaChecked:boolean|null=null,domainChecked:boolean|null=null,failureKind:string|undefined;
  try {
    const responseBody = await fetchLlmJson(`${trimSlash(config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: getWorkflowConfig().llm.temperature,
        ...(process.env.LLM_DISABLE_THINKING === "false" ? {} : { enable_thinking: false }),
        response_format: llmResponseFormat(input.agentName.includes("transcript") ? getWorkflowConfig().schemas.normalizer : getWorkflowConfig().schemas.evidence,config.model,config.baseUrl),
        messages: [
          { role: "system", content: buildSystemPrompt(input.promptVersion, input.systemInstruction, input.agentName) },
          { role: "user", content: JSON.stringify(input.input) }
        ]
      })
    });
    const rawOutput = responseBody.choices?.[0]?.message?.content;
    if (!rawOutput || typeof rawOutput!=="string") throw new WorkflowFailureError("schema_invalid","LLM_CONTENT_MISSING","模型未返回有效内容");
    let parsedOutput: unknown;
    try { parsedOutput = parseJsonObject(rawOutput); } catch { throw new WorkflowFailureError("schema_invalid","LLM_JSON_INVALID","模型输出不是有效 JSON"); }
    const schema = input.agentName.includes("transcript") ? getWorkflowConfig().schemas.normalizer : getWorkflowConfig().schemas.evidence;
    const schemaValid=matchesWorkflowSchema(parsedOutput,schema);
    schemaChecked=schemaValid;
    if(isStrictWorkflowExecution()&&!schemaValid)throw new WorkflowFailureError("schema_invalid","SCHEMA_INVALID","模型输出不符合结构要求");
    const domainValid=input.validate(parsedOutput);
    domainChecked=domainValid;
    if(isStrictWorkflowExecution()&&!domainValid)throw new WorkflowFailureError("business_rule_rejected","AGENT_DOMAIN_REJECTED","模型输出未通过上下文业务核验，请优先人工复核");
    const validationResult: AgentValidationResult = domainValid
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
    failureKind=error instanceof WorkflowFailureError?error.kind:'internal';
    if(failureKind==='schema_invalid')schemaChecked=false;
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
  }finally{createLogger('agents.attempt').info('llm attempt finished',{requestId,agentName:input.agentName,model:config.model,schemaValid:schemaChecked,businessValid:domainChecked,failureKind,durationMs:Date.now()-startedAt});}
}

function buildSystemPrompt(promptVersion: string, systemInstruction?: string, agentName='') {
  const config=getWorkflowConfig();
  const base=`promptVersion=${promptVersion}\n${systemInstruction || config.prompts.defaultSystem}`;
  if(!isStrictWorkflowExecution()||config.llm.responseFormat!=='json_object')return base;
  const schema=agentName.includes('transcript')?config.schemas.normalizer:config.schemas.evidence;
  return `${base}\n${config.prompts.schemaContractLabel}\n${JSON.stringify(schema)}`;
}

export async function callAgentTool<T>(input: {
  agentName: string;
  toolName: string;
  traceId?: string;
  input: unknown;
  execute: () => Promise<T>;
}): Promise<T> {
  const traceId = getTraceContext()?.traceId || input.traceId || createAgentTraceId(input.agentName);
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
