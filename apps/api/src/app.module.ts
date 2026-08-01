import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";
import { LessonsModule } from "./modules/lessons/lessons.module";
import { EvidenceModule } from "./modules/evidence/evidence.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { TranscriptsModule } from "./modules/transcripts/transcripts.module";
import { WorkflowsModule } from "./modules/workflows/workflows.module";
import { AgentsModule } from "./modules/agents/agents.module";

@Module({
  imports: [HealthModule, LessonsModule, TranscriptsModule, EvidenceModule, ReportsModule, WorkflowsModule, AgentsModule]
})
export class AppModule {}
