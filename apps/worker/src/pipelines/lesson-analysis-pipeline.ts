import {getWorkflowConfig,withWorkflowConfig} from '@class-reflect/config';
import {withTraceContext} from '@class-reflect/observability';
import {createHash} from 'node:crypto';
import {executeStep} from './execute-step';
import {resolveWorkflowFailures,pinWorkflowConfig,withExecutionGuard,getExecutionGuard,claimWorkflowStep,completeWorkflowStep,renewWorkflowLease,getCompletedStepResult,getWorkflowInputVersion,checkModelCircuit,resetModelCircuit,persistWorkflowFailure} from '@class-reflect/database';
import {classifyWorkflowFailure} from '@class-reflect/shared-types';
import { AgentOrchestrator } from "@class-reflect/agents";
import {
  getWorkflowStatusById,
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

export async function runLessonAnalysisPipeline(workflow: WorkflowRunRecord, correlationId?: string) {
 const snapshot=await pinWorkflowConfig(workflow.id);
 if(!workflow.traceId||!workflow.fencingToken)throw new Error('工作流缺少追踪或租约信息，请执行底座迁移');
 return withWorkflowConfig(snapshot,()=>withTraceContext({traceId:workflow.traceId!,runId:workflow.id,attemptId:String(workflow.fencingToken)},()=>withExecutionGuard({runId:workflow.id,token:workflow.fencingToken!,traceId:workflow.traceId!},()=>runPipeline({...workflow,configSnapshot:snapshot}))),{strictFailures:true});
}
async function runPipeline(workflow:WorkflowRunRecord){
  const orchestrator = new AgentOrchestrator();
  const traceId = workflow.traceId!;
  const config=getWorkflowConfig();
  const providerKey=createHash('sha256').update((process.env.LLM_BASE_URL||'configured')+':'+(process.env.LLM_MODEL||'configured')).digest('hex');
  let status = await getWorkflowStatusById(workflow.id);
  if (status.task?.status === "cancelled") {
    logger.info("workflow cancelled before pipeline start", { correlationId: traceId, workflowRunId: workflow.id, retryCount: workflow.retryCount });
    return;
  }

  const decision = orchestrator.decide({
    lessonId: workflow.lessonId,
    videoId: workflow.videoId,
    status: workflow.status,
    hasUploadedVideo: status.steps.find((step) => step.stepKey === "upload_video")?.status === "completed",
    hasUploadedAudio: status.steps.find((step) => step.stepKey === "upload_audio")?.status === "completed",
    steps: status.steps
  });
  logger.info("workflow agent decision", { correlationId: traceId, workflowRunId: workflow.id, retryCount: workflow.retryCount, decision: decision.output });

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

  for (const configuredStep of config.steps) {
    const step=workflowStepOptions.find(s=>s.key===configuredStep.key)!;
    status = await getWorkflowStatusById(workflow.id);
    if (status.task?.status === "cancelled") {
      logger.info("workflow cancelled before step", { correlationId: traceId, workflowRunId: workflow.id, retryCount: workflow.retryCount, stepKey: step.key });
      return;
    }

    if (step.key === "create_lesson") {
      await updateWorkflowStep({ workflowRunId: workflow.id, stepKey: step.key, status: "completed", progress: 100 });
      continue;
    }

    const currentWorkflow = status.task || workflow;
    const stepState = status.steps.find((item) => item.stepKey === step.key);
    if(step.key==='build_sections' && stepState?.status==='completed' && !(currentWorkflow.output.build_sections as any)?.confirmedAt){
      await updateWorkflowRunStatus({workflowRunId:workflow.id,status:'waiting_for_human',currentStep:'build_sections',progress:currentWorkflow.progress});return;
    }
    if(step.key==='wait_human_review' && stepState?.status==='completed' && !(currentWorkflow.output.wait_human_review as any)?.confirmedAt){
      await updateWorkflowRunStatus({workflowRunId:workflow.id,status:'waiting_for_human',currentStep:'wait_human_review',progress:currentWorkflow.progress});return;
    }
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

    let providerProbe:Awaited<ReturnType<typeof checkModelCircuit>>|undefined;
    try {
      const context: ProcessorContext = { workflow: currentWorkflow, steps: status.steps, traceId };
      const version=await getWorkflowInputVersion(workflow.lessonId,workflow.videoId);
      const inputHash=createHash('sha256').update(JSON.stringify({config:workflow.configSnapshot?.hash||config.version,manualRetry:workflow.retryCount,step:step.key,version})).digest('hex');
      const result=await executeStep({
        claim:()=>claimWorkflowStep({runId:workflow.id,stepKey:step.key,inputHash,workerToken:workflow.fencingToken!,leaseMs:config.execution.leaseMs}),
        cached:()=>getCompletedStepResult(workflow.id,step.key,inputHash),
        renew:()=>renewWorkflowLease(workflow.id,workflow.fencingToken!,config.execution.leaseMs),
        complete:(lease,result)=>completeWorkflowStep(lease,result as Record<string,unknown>)
      },async(lease)=>{
        if(['normalize_transcript','generate_evidence'].includes(step.key))providerProbe=await checkModelCircuit(providerKey,config.failurePolicies.circuitOpenMs);
        const result=await withTraceContext({traceId,runId:workflow.id,attemptId:String(workflow.fencingToken),stepKey:step.key},()=>withExecutionGuard({...getExecutionGuard()!,lessonId:workflow.lessonId,videoId:workflow.videoId,inputVersion:version,executionId:lease.executionId},()=>processor.run(context)));
        if(['normalize_transcript','generate_evidence'].includes(step.key))if(providerProbe)await resetModelCircuit(providerKey,providerProbe);
        return result;
      },config.execution.heartbeatMs);
      await resolveWorkflowFailures(workflow.id,step.key);
      workflow.retryAttempt=0;
      const latestStatus = await getWorkflowStatusById(workflow.id);
      if (latestStatus.task?.status === "cancelled") {
        logger.info("workflow cancelled after step processor", { correlationId: traceId, workflowRunId: workflow.id, retryCount: workflow.retryCount, stepKey: step.key });
        return;
      }

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

      if (step.key === "build_sections") {
        await updateWorkflowRunStatus({
          workflowRunId: workflow.id,
          status: "waiting_for_human",
          currentStep: step.key,
          progress,
          output: {
            [step.key]: {
              ...(result.output || {}),
              waitingFor: "teacher_transcript_confirmation",
              warnings: result.warnings || []
            }
          }
        });
        return;
      }

      if (step.key === "wait_human_review") return;
    } catch (error) {
      const failure=classifyWorkflowFailure(error,{traceId,runId:workflow.id,stepKey:step.key,attempt:(workflow.retryAttempt||0)+1});
      logger.error('workflow step failed',failure);
      await updateWorkflowStep({workflowRunId:workflow.id,stepKey:step.key,status:'failed',progress:100,errorMessage:failure.safeMessage});
      await persistWorkflowFailure(failure,{...config.failurePolicies,schemaRetries:0},providerKey,providerProbe);
      return;
    }
  }

  await updateWorkflowRunStatus({
    workflowRunId: workflow.id,
    status: "completed",
    currentStep: "export_report",
    progress: 100
  });
  logger.info("workflow completed", { correlationId: traceId, workflowRunId: workflow.id, retryCount: workflow.retryCount });
}

function calculateWorkflowProgress(stepKey: WorkflowStepKey) {
  const index = workflowStepOptions.findIndex((step) => step.key === stepKey);
  if (index < 0) return 0;
  return Math.round((index / Math.max(workflowStepOptions.length - 1, 1)) * 100);
}

function buildWorkflowCorrelationId(workflowRunId: string, retryCount: number) {
  return `workflow-${workflowRunId}-retry-${retryCount}`;
}
