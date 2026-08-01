import { Body, Controller, ForbiddenException, Get, Post } from "@nestjs/common";
import { RunAgentRequestSchema } from "@class-reflect/api-contracts";
import { AgentsService } from "./agents.service";

@Controller("api/agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  listAgents() {
    this.assertEnabled();
    return { agents: this.agents.listAgents() };
  }

  @Post("run")
  async runAgent(@Body() body: unknown) {
    this.assertEnabled();
    return this.agents.runAgent(RunAgentRequestSchema.parse(body));
  }

  private assertEnabled() {
    if (process.env.NODE_ENV === "production" && process.env.AI_AGENT_API_ENABLED !== "true") {
      throw new ForbiddenException("AI Agent development API is disabled");
    }
  }
}
