import { claimNextWorkflowRun } from "@class-reflect/database";
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
