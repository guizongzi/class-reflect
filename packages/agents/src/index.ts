export type AgentResult<T> = {
  output: T;
  promptVersion: string;
  warnings: string[];
};

export type WorkflowAgentStep = {
  stepKey: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
};

export type WorkflowAgentSnapshot = {
  lessonId: string;
  videoId?: string | null;
  status?: string | null;
  hasUploadedVideo: boolean;
  hasUploadedAudio: boolean;
  steps: WorkflowAgentStep[];
};

export type WorkflowAgentDecision = {
  action: "wait_for_upload" | "continue_pipeline" | "wait_for_human" | "complete" | "fail";
  nextStepKey: string | null;
  assistantMessage: string;
  warnings: string[];
};

export function runTranscriptNormalizer<T>(segments: T[]): AgentResult<T[]> {
  return {
    output: segments,
    promptVersion: "transcript-normalizer.v0",
    warnings: []
  };
}

export function runWorkflowAgent(snapshot: WorkflowAgentSnapshot): AgentResult<WorkflowAgentDecision> {
  const failedStep = snapshot.steps.find((step) => step.status === "failed");
  if (failedStep) {
    return workflowDecision({
      action: "fail",
      nextStepKey: failedStep.stepKey,
      assistantMessage: `处理在「${failedStep.stepKey}」失败：${failedStep.errorMessage || "请查看日志"}`,
      warnings: []
    });
  }

  if (!snapshot.hasUploadedVideo) {
    return workflowDecision({
      action: "wait_for_upload",
      nextStepKey: "upload_video",
      assistantMessage: "请先完成原始视频上传，系统会保存到对象存储后再进入后台处理。",
      warnings: []
    });
  }

  if (!snapshot.hasUploadedAudio) {
    return workflowDecision({
      action: "continue_pipeline",
      nextStepKey: "upload_audio",
      assistantMessage: "视频已上传。音频仍未完成时，后台可回退到从视频抽取音频。",
      warnings: ["audio_upload_not_completed"]
    });
  }

  const waitingHumanStep = snapshot.steps.find((step) => step.stepKey === "wait_human_review" && step.status === "running");
  if (waitingHumanStep) {
    return workflowDecision({
      action: "wait_for_human",
      nextStepKey: "wait_human_review",
      assistantMessage: "候选证据已经生成，请教师复核后再生成最终报告。",
      warnings: []
    });
  }

  const nextStep = snapshot.steps.find((step) => ["waiting", "queued"].includes(step.status));
  if (nextStep) {
    return workflowDecision({
      action: "continue_pipeline",
      nextStepKey: nextStep.stepKey,
      assistantMessage: `下一步处理「${nextStep.stepKey}」。`,
      warnings: []
    });
  }

  return workflowDecision({
    action: "complete",
    nextStepKey: null,
    assistantMessage: "课堂复盘工作流已完成。",
    warnings: []
  });
}

export class AgentOrchestrator {
  decide(snapshot: WorkflowAgentSnapshot) {
    return runWorkflowAgent(snapshot);
  }
}

function workflowDecision(decision: WorkflowAgentDecision): AgentResult<WorkflowAgentDecision> {
  return {
    output: decision,
    promptVersion: "workflow-agent.v0",
    warnings: decision.warnings
  };
}
