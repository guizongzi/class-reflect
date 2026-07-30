import { AgentOrchestrator } from "@class-reflect/agents";
import {
  getWorkflowStatusForLesson,
  updateWorkflowRunStatus,
  updateWorkflowStep,
  type WorkflowRunRecord
} from "@class-reflect/database";
import { workflowStepOptions, type WorkflowStepKey } from "@class-reflect/shared-types";
import { createLogger } from "@class-reflect/observability";
import {
  buildSectionsProcessor,
  calculateMetricsProcessor,
  detectEventsProcessor,
  generateEvidenceProcessor,
  normalizeTranscriptProcessor,
  validateEvidenceProcessor
} from "../processors/analysis-processors";
import { persistTranscriptProcessor, pollAsrProcessor, submitAsrProcessor } from "../processors/asr-processors";
import { probeMediaProcessor } from "../processors/media-processors";
import { exportReportProcessor, generateReportProcessor, waitHumanReviewProcessor } from "../processors/report-processors";
import type { ProcessorContext, WorkflowProcessor } from "../processors/types";
import { uploadAudioProcessor, uploadVideoProcessor } from "../processors/upload-processors";

const logger = createLogger("lesson-analysis-pipeline");

const processors = new Map<string, WorkflowProcessor>([
  [uploadVideoProcessor.stepKey, uploadVideoProcessor],
  [uploadAudioProcessor.stepKey, uploadAudioProcessor],
  [probeMediaProcessor.stepKey, probeMediaProcessor],
  [submitAsrProcessor.stepKey, submitAsrProcessor],
  [pollAsrProcessor.stepKey, pollAsrProcessor],
  [persistTranscriptProcessor.stepKey, persistTranscriptProcessor],
  [normalizeTranscriptProcessor.stepKey, normalizeTranscriptProcessor],
  [buildSectionsProcessor.stepKey, buildSectionsProcessor],
  [calculateMetricsProcessor.stepKey, calculateMetricsProcessor],
  [detectEventsProcessor.stepKey, detectEventsProcessor],
  [generateEvidenceProcessor.stepKey, generateEvidenceProcessor],
  [validateEvidenceProcessor.stepKey, validateEvidenceProcessor],
  [waitHumanReviewProcessor.stepKey, waitHumanReviewProcessor],
  [generateReportProcessor.stepKey, generateReportProcessor],
  [exportReportProcessor.stepKey, exportReportProcessor]
]);

export async function runLessonAnalysisPipeline(workflow: WorkflowRunRecord) {
  const orchestrator = new AgentOrchestrator();
  let status = await getWorkflowStatusForLesson(workflow.lessonId);

  const decision = orchestrator.decide({
    lessonId: workflow.lessonId,
    videoId: workflow.videoId,
    status: workflow.status,
    hasUploadedVideo: status.steps.find((step) => step.stepKey === "upload_video")?.status === "completed",
    hasUploadedAudio: status.steps.find((step) => step.stepKey === "upload_audio")?.status === "completed",
    steps: status.steps
  });
  logger.info("workflow agent decision", { workflowRunId: workflow.id, decision: decision.output });

  if (decision.output.action === "wait_for_upload") {
    await updateWorkflowRunStatus({
      workflowRunId: workflow.id,
      status: "queued",
      currentStep: decision.output.nextStepKey as WorkflowStepKey,
      progress: workflow.progress,
      output: { workflowAgent: decision }
    });
    return;
  }

  for (const step of workflowStepOptions) {
    if (step.key === "create_lesson") {
      await updateWorkflowStep({ workflowRunId: workflow.id, stepKey: step.key, status: "completed", progress: 100 });
      continue;
    }

    status = await getWorkflowStatusForLesson(workflow.lessonId);
    const currentWorkflow = status.task || workflow;
    const stepState = status.steps.find((item) => item.stepKey === step.key);
    if (stepState?.status === "completed" || stepState?.status === "skipped") continue;

    const processor = processors.get(step.key);
    if (!processor) {
      await updateWorkflowStep({
        workflowRunId: workflow.id,
        stepKey: step.key,
        status: "failed",
        progress: 0,
        errorMessage: `processor missing: ${step.key}`
      });
      throw new Error(`processor missing: ${step.key}`);
    }

    const progress = calculateWorkflowProgress(step.key);
    await updateWorkflowRunStatus({
      workflowRunId: workflow.id,
      status: "running",
      currentStep: step.key,
      progress
    });
    await updateWorkflowStep({
      workflowRunId: workflow.id,
      stepKey: step.key,
      status: "running",
      progress: 25
    });

    try {
      const context: ProcessorContext = { workflow: currentWorkflow, steps: status.steps };
      const result = await processor.run(context);
      await updateWorkflowStep({
        workflowRunId: workflow.id,
        stepKey: step.key,
        status: step.key === "wait_human_review" ? "running" : "completed",
        progress: step.key === "wait_human_review" ? 50 : 100
      });
      await updateWorkflowRunStatus({
        workflowRunId: workflow.id,
        status: step.key === "wait_human_review" ? "waiting_for_human" : "running",
        currentStep: step.key,
        progress,
        output: {
          [step.key]: {
            ...(result.output || {}),
            warnings: result.warnings || []
          }
        }
      });

      if (step.key === "wait_human_review") return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateWorkflowStep({
        workflowRunId: workflow.id,
        stepKey: step.key,
        status: "failed",
        progress: 100,
        errorMessage: message
      });
      await updateWorkflowRunStatus({
        workflowRunId: workflow.id,
        status: "failed",
        currentStep: step.key,
        progress,
        errorMessage: message
      });
      throw error;
    }
  }

  await updateWorkflowRunStatus({
    workflowRunId: workflow.id,
    status: "completed",
    currentStep: "export_report",
    progress: 100
  });
}

function calculateWorkflowProgress(stepKey: WorkflowStepKey) {
  const index = workflowStepOptions.findIndex((step) => step.key === stepKey);
  if (index < 0) return 0;
  return Math.round((index / Math.max(workflowStepOptions.length - 1, 1)) * 100);
}
