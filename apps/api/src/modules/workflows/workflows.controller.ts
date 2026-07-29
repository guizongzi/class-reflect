import { Controller, Get, Param } from "@nestjs/common";

@Controller("api/lessons/:lessonId/status")
export class WorkflowsController {
  @Get()
  getStatus(@Param("lessonId") lessonId: string) {
    return {
      task: {
        lessonId,
        status: "created",
        currentStep: "created",
        errorMessage: null
      },
      steps: []
    };
  }
}
