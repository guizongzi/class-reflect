import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";
import { LessonsModule } from "./modules/lessons/lessons.module";
import { WorkflowsModule } from "./modules/workflows/workflows.module";

@Module({
  imports: [HealthModule, LessonsModule, WorkflowsModule]
})
export class AppModule {}
