import { Injectable } from "@nestjs/common";
import { listAgentModules, runRegisteredAgent } from "@class-reflect/agents";
import type { RunAgentRequest } from "@class-reflect/api-contracts";

@Injectable()
export class AgentsService {
  listAgents() {
    return listAgentModules();
  }

  runAgent(input: RunAgentRequest) {
    return runRegisteredAgent({
      agentName: input.agentName,
      input: input.input,
      traceId: input.traceId
    });
  }
}
