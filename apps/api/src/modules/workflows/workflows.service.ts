import { Injectable } from "@nestjs/common";
import { loadAppConfig } from "@class-reflect/config";
import {
  cancelWorkflowRunForLesson,
  confirmTranscriptReviewForLesson,
  getWorkflowStatusForLesson,
  retryWorkflowRunForLesson,
  type WorkflowRunRecord,
  type WorkflowStatusRecord
} from "@class-reflect/database";
import { workflowStepOptions, type WorkflowStepKey } from "@class-reflect/shared-types";

@Injectable()
export class WorkflowsService {
  private readonly config = loadAppConfig();

  getLessonStatus(lessonId: string) {
    return getWorkflowStatusForLesson(lessonId);
  }

  async ensureLessonWorkflowQueued(lessonId: string): Promise<WorkflowStatusRecord> {
    const current = await getWorkflowStatusForLesson(lessonId);
    if (!current.task) return current;
    if (current.task.status === "completed" || current.task.status === "cancelled") return current;
    if (current.task.status !== "queued" && current.task.status !== "failed") return current;

    await this.dispatchWorkflowRun(current.task);
    return getWorkflowStatusForLesson(lessonId);
  }

  cancelLessonWorkflow(lessonId: string) {
    return cancelWorkflowRunForLesson(lessonId);
  }

  async retryLessonWorkflow(lessonId: string, body: unknown) {
    const fromStepKey = parseWorkflowStepKey(body);
    await retryWorkflowRunForLesson({ lessonId, fromStepKey });
    return this.ensureLessonWorkflowQueued(lessonId);
  }

  async confirmTranscriptReview(lessonId: string) {
    await confirmTranscriptReviewForLesson(lessonId);
    return this.ensureLessonWorkflowQueued(lessonId);
  }

  private async dispatchWorkflowRun(workflowRun: WorkflowRunRecord) {
    const workerBaseUrl = this.config.workerBaseUrl;
    if (!workerBaseUrl) {
      throw new Error("WORKER_BASE_URL is required to dispatch workflow runs");
    }

    const taskPath = this.config.workflowTaskPath || "/api/workflows/process";
    const requestBody = {
      workflowRunId: workflowRun.id,
      lessonId: workflowRun.lessonId,
      videoId: workflowRun.videoId
    };

    if (this.config.cloudTasksProjectId && this.config.cloudTasksQueue) {
      await createCloudTask({
        projectId: this.config.cloudTasksProjectId,
        location: this.config.cloudTasksLocation,
        queue: this.config.cloudTasksQueue,
        taskId: `workflow-${workflowRun.id}-retry-${workflowRun.retryCount}`,
        url: new URL(taskPath, workerBaseUrl).toString(),
        body: requestBody
      });
      return;
    }

    const response = await fetch(new URL(taskPath, workerBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`workflow dispatch failed with ${response.status}`);
    }
  }
}

async function createCloudTask(input: {
  projectId: string;
  location: string;
  queue: string;
  taskId: string;
  url: string;
  body: Record<string, unknown>;
}) {
  const accessToken = await getMetadataAccessToken();
  const parent = `projects/${encodeURIComponent(input.projectId)}/locations/${encodeURIComponent(input.location)}/queues/${encodeURIComponent(input.queue)}`;
  const response = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      task: {
        name: `${parent}/tasks/${encodeURIComponent(input.taskId)}`,
        httpRequest: {
          httpMethod: "POST",
          url: input.url,
          headers: { "Content-Type": "application/json" },
          body: Buffer.from(JSON.stringify(input.body)).toString("base64")
        }
      }
    })
  });

  if (response.ok) return;
  const text = await response.text();
  if (response.status === 409 || text.includes("ALREADY_EXISTS")) {
    throw new Error(`cloud task already exists: ${input.taskId}`);
  }
  throw new Error(`cloud task creation failed with ${response.status}: ${text}`);
}

async function getMetadataAccessToken() {
  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    {
      headers: { "Metadata-Flavor": "Google" }
    }
  );
  if (!response.ok) {
    throw new Error(`failed to read metadata access token: ${response.status}`);
  }
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("metadata access token missing");
  }
  return payload.access_token;
}

function parseWorkflowStepKey(body: unknown): WorkflowStepKey | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { fromStepKey?: unknown }).fromStepKey;
  return workflowStepOptions.some((step) => step.key === value) ? value as WorkflowStepKey : null;
}
