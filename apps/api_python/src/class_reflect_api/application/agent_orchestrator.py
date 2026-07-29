from dataclasses import dataclass
from enum import StrEnum


class AgentType(StrEnum):
    TRANSCRIPTION = "transcription_agent"
    TRANSLATION = "translation_agent"
    EVIDENCE = "evidence_agent"
    REPORT = "report_agent"
    TEACHER_REVIEW = "teacher_review_agent"


class OrchestratorAction(StrEnum):
    EXECUTE = "execute"
    ASK_TEACHER = "ask_teacher"
    RETRY_OR_WAIT = "retry_or_wait_for_teacher"


@dataclass(frozen=True)
class OrchestratorDecision:
    action: OrchestratorAction
    next_agent: AgentType
    reason: str


def decide_next_action(
    *,
    task_status: str | None = None,
    workflow_status: str | None = None,
    requires_translation: bool = False,
) -> OrchestratorDecision:
    if task_status == "failed" or workflow_status == "failed":
        return OrchestratorDecision(
            action=OrchestratorAction.RETRY_OR_WAIT,
            next_agent=AgentType.TEACHER_REVIEW,
            reason="当前流程失败，需要教师确认后重试或调整条件。",
        )

    if requires_translation:
        return OrchestratorDecision(
            action=OrchestratorAction.EXECUTE,
            next_agent=AgentType.TRANSLATION,
            reason="教师主动要求翻译，进入可选翻译 Agent。",
        )

    return OrchestratorDecision(
        action=OrchestratorAction.EXECUTE,
        next_agent=AgentType.TRANSCRIPTION,
        reason="默认执行课堂视频转写与分段流程。",
    )

