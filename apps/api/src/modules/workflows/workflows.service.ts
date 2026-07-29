import { Injectable } from "@nestjs/common";
import { getWorkflowStatusForLesson } from "@class-reflect/database";

@Injectable()
export class WorkflowsService {
  getLessonStatus(lessonId: string) {
    return getWorkflowStatusForLesson(lessonId);
  }
}
