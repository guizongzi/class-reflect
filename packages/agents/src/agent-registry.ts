import { teachingEvidenceAgentModule } from "./teaching-evidence-agent";
import { transcriptNormalizerAgentModule } from "./transcript-normalizer-agent";
import type { AgentResult } from "./types";
import { workflowAgentModule } from "./workflow-agent";

const agentModules = [
  teachingEvidenceAgentModule,
  transcriptNormalizerAgentModule,
  workflowAgentModule
] as const;

export type RegisteredAgentName = (typeof agentModules)[number]["name"];

export function listAgentModules() {
  return agentModules.map(({ name }) => ({ name }));
}

export async function runRegisteredAgent(input: {
  agentName: RegisteredAgentName;
  input: unknown;
  traceId?: string;
}): Promise<AgentResult<unknown>> {
  const agent = agentModules.find((item) => item.name === input.agentName);
  if (!agent) throw new Error(`unknown agent: ${input.agentName}`);
  return agent.run(input.input, { traceId: input.traceId }) as Promise<AgentResult<unknown>>;
}
