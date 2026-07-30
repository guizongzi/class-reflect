import { claimNextWorkflowRun, claimWorkflowRunById, getWorkflowRunById } from "@class-reflect/database";
import { createLogger } from "@class-reflect/observability";
import { runLessonAnalysisPipeline } from "../pipelines/lesson-analysis-pipeline";

const logger = createLogger("lesson-workflow");

export async function runLessonWorkflowOnce(workerId = process.env.WORKER_ID || `worker-${process.pid}`): Promise<{ claimed: boolean }> {
  const workflow = await claimNextWorkflowRun(workerId);
  if (!workflow) return { claimed: false };

  logger.info("claimed workflow", {
    workflowRunId: workflow.id,
    lessonId: workflow.lessonId,
    videoId: workflow.videoId
  });
  await runLessonAnalysisPipeline(workflow);
  return { claimed: true };
}

export async function runLessonWorkflowById(input: {
  workflowRunId: string;
  workerId?: string;
}): Promise<{ processed: boolean; reason?: string }> {
  const workerId = input.workerId || process.env.WORKER_ID || `worker-${process.pid}`;
  const workflow = await claimWorkflowRunById(input.workflowRunId, workerId);
  if (!workflow) {
    const current = await getWorkflowRunById(input.workflowRunId);
    if (!current) return { processed: false, reason: "not_found" };
    if (current.status === "running") return { processed: false, reason: "already_running" };
    if (current.status === "completed" || current.status === "cancelled") {
      return { processed: false, reason: current.status };
    }
    return { processed: false, reason: current.status };
  }

  logger.info("claimed workflow by id", {
    workflowRunId: workflow.id,
    lessonId: workflow.lessonId,
    videoId: workflow.videoId
  });
  await runLessonAnalysisPipeline(workflow);
  return { processed: true };
}
