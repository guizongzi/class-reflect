import { Controller, Get, Param } from "@nestjs/common";
import { WorkflowsService } from "./workflows.service";

@Controller("api/lessons/:lessonId/status")
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  getStatus(@Param("lessonId") lessonId: string) {
    return this.workflows.getLessonStatus(lessonId);
  }
}
