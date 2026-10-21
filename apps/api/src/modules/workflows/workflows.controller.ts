import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { WorkflowsService } from "./workflows.service";

@Controller("api/lessons/:lessonId/status")
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  getStatus(@Param("lessonId") lessonId: string) {
    return this.workflows.getLessonStatus(lessonId);
  }

  @Get("trace/:traceId")
  trace(@Param("lessonId") lessonId:string,@Param("traceId") traceId:string){return this.workflows.traceTimeline(lessonId,traceId);}

  @Post("cancel")
  cancel(@Param("lessonId") lessonId: string) {
    return this.workflows.cancelLessonWorkflow(lessonId);
  }

  @Post("retry")
  retry(@Param("lessonId") lessonId: string, @Body() body: unknown) {
    return this.workflows.retryLessonWorkflow(lessonId, body);
  }

  @Get('quality')
  quality(@Param('lessonId') lessonId:string){return this.workflows.qualityMetrics(lessonId);}

  @Get('review-queue')
  queue(@Param('lessonId') lessonId:string){return this.workflows.reviewQueue(lessonId);}

  @Post('confirm-evidence')
  evidence(@Param('lessonId') lessonId:string){return this.workflows.confirmEvidenceReview(lessonId);}

  @Post("confirm-transcript")
  confirmTranscript(@Param("lessonId") lessonId: string) {
    return this.workflows.confirmTranscriptReview(lessonId);
  }
}
