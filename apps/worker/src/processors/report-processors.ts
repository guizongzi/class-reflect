import {
  getLessonRecord,
  getTeachingEvidenceSource,
  listClassroomMetrics,
  listTeachingEvidenceCards,
  saveReportRecord,
  updateWorkflowRunStatus
} from "@class-reflect/database";
import { buildReportFromAcceptedEvidence } from "@class-reflect/domain";
import { buildEvaluationContext, type LessonFormat } from "@class-reflect/shared-types";
import type { ProcessorResult, WorkflowProcessor } from "./types";

export const waitHumanReviewProcessor: WorkflowProcessor = {
  stepKey: "wait_human_review",
  async run(): Promise<ProcessorResult> {
    return {
      output: { waitingFor: "teacher_evidence_review" }
    };
  }
};

export const generateReportProcessor: WorkflowProcessor = {
  stepKey: "generate_report",
  async run(context): Promise<ProcessorResult> {
    const detail = await getLessonRecord(context.workflow.lessonId);
    if (!detail) throw new Error(`课堂记录不存在：${context.workflow.lessonId}`);
    const evidenceCards = await listTeachingEvidenceCards(context.workflow.lessonId);
    const metrics = await listClassroomMetrics({ lessonId: context.workflow.lessonId });
    const source=await getTeachingEvidenceSource({lessonId:context.workflow.lessonId,videoId:context.workflow.videoId});
    const scene=buildEvaluationContext(source?.lesson.sceneLabelConfirmed?source.lesson.lessonFormat:null,source?.transcriptSegments||[],source?.lesson.sceneRevision||detail.lesson.sceneRevision);
    const report = buildReportFromAcceptedEvidence({
      evaluationContext:scene,
      lesson: {
        id: detail.lesson.id,
        lessonTitle: detail.lesson.lessonTitle,
        courseTitle: detail.lesson.courseTitle || "课堂复盘",
        lessonFormat: normalizeReportLessonFormat(detail.lesson.lessonFormat),
        status: detail.lesson.status as never
      },
      evidenceCards,
      metrics
    });
    const saved = await saveReportRecord({
      lessonId: context.workflow.lessonId,
      markdownContent: report.markdownContent,
      generatedFrom: report.generatedFrom
    });
    return {
      output: {
        reportId: saved.id,
        acceptedEvidenceCount: Number(saved.generatedFrom.evidenceCount || 0),
        metricCount: Number(saved.generatedFrom.metricCount || 0)
      },
      warnings: Number(saved.generatedFrom.evidenceCount || 0) === 0 ? ["no_accepted_evidence_for_report"] : []
    };
  }
};

function normalizeReportLessonFormat(value: string | null | undefined): LessonFormat {
  if (
    value === "offline_classroom_recording" ||
    value === "live_online_class" ||
    value === "recorded_online_class" ||
    value === "teacher_certification_interview" ||
    value === "teacher_qualification_demo"
  ) {
    return value === "teacher_qualification_demo" ? "teacher_certification_interview" : value;
  }
  return "offline_classroom_recording";
}

export const exportReportProcessor: WorkflowProcessor = {
  stepKey: "export_report",
  async run(context): Promise<ProcessorResult> {
    await updateWorkflowRunStatus({
      workflowRunId: context.workflow.id,
      status: "running",
      currentStep: "export_report",
      output: {
        export_report: {
          exportMode: "markdown_in_database",
          message: "M1 本地版已将报告 Markdown 保存到数据库，R2 文件导出留作后续增强。"
        }
      }
    });
    return {
      output: {
        exportMode: "markdown_in_database"
      }
    };
  }
};
