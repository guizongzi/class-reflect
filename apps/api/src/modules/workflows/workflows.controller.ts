import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { WorkflowsService } from "./workflows.service";

@Controller("api/lessons/:lessonId/status")
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  getStatus(@Param("lessonId") lessonId: string) {
    return this.workflows.getLessonStatus(lessonId);
  }

  @Post("cancel")
  cancel(@Param("lessonId") lessonId: string) {
    return this.workflows.cancelLessonWorkflow(lessonId);
  }

  @Post("retry")
  retry(@Param("lessonId") lessonId: string, @Body() body: unknown) {
    return this.workflows.retryLessonWorkflow(lessonId, body);
  }
}
