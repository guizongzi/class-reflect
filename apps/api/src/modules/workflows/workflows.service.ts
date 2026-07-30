import { Injectable } from "@nestjs/common";
import {
  cancelWorkflowRunForLesson,
  confirmTranscriptReviewForLesson,
  getWorkflowStatusForLesson,
  retryWorkflowRunForLesson
} from "@class-reflect/database";
import { workflowStepOptions, type WorkflowStepKey } from "@class-reflect/shared-types";

@Injectable()
export class WorkflowsService {
  getLessonStatus(lessonId: string) {
    return getWorkflowStatusForLesson(lessonId);
  }

  cancelLessonWorkflow(lessonId: string) {
    return cancelWorkflowRunForLesson(lessonId);
  }

  retryLessonWorkflow(lessonId: string, body: unknown) {
    const fromStepKey = parseWorkflowStepKey(body);
    return retryWorkflowRunForLesson({ lessonId, fromStepKey });
  }

  confirmTranscriptReview(lessonId: string) {
    return confirmTranscriptReviewForLesson(lessonId);
  }
}

function parseWorkflowStepKey(body: unknown): WorkflowStepKey | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { fromStepKey?: unknown }).fromStepKey;
  return workflowStepOptions.some((step) => step.key === value) ? value as WorkflowStepKey : null;
}
