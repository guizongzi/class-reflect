import {
  claimNextWorkflowRun as claimWorkflowRun,
  processVideoTask,
  processWorkflowRun
} from "../../processor.js";

export const AGENT_ORCHESTRATOR_ROLES = {
  orchestrator: "decide_next_action",
  worker: "execute_background_work",
  pipeline: "run_single_processing_chain",
  integration: "connect_external_systems"
};

export const AGENT_TYPES = {
  transcription: "transcription_agent",
  translation: "translation_agent",
  evidence: "evidence_agent",
  report: "report_agent",
  teacherReview: "teacher_review_agent"
};

export async function claimNextWorkflowRun(options = {}) {
  return claimWorkflowRun(options);
}

export async function executeWorkflowRun(workflowRunId, context = {}) {
  const decision = decideWorkflowAction(context);
  if (decision.action !== "execute") return decision;
  await processWorkflowRun(workflowRunId);
  return { ...decision, status: "completed" };
}

export async function executeTask(taskId, context = {}) {
  const decision = decideWorkflowAction(context);
  if (decision.action !== "execute") return decision;
  await processVideoTask(taskId);
  return { ...decision, status: "completed" };
}

export function decideWorkflowAction({ task, workflow, userIntent } = {}) {
  if (workflow?.status === "failed" || task?.status === "failed") {
    return {
      action: "retry_or_wait_for_teacher",
      nextAgent: AGENT_TYPES.teacherReview,
      reason: "当前流程失败，需要教师确认后重试或调整配置。"
    };
  }

  if (userIntent?.requiresTranslation) {
    return {
      action: "execute",
      nextAgent: AGENT_TYPES.translation,
      reason: "教师主动要求翻译，进入可选翻译 Agent。"
    };
  }

  return {
    action: "execute",
    nextAgent: AGENT_TYPES.transcription,
    reason: "默认执行课堂视频转写与分段流程。"
  };
}
