import { buildEvaluationContext,canonicalLessonFormat } from "@class-reflect/shared-types";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateReportRequest } from "@class-reflect/api-contracts";
import {
  getLessonRecord,
  getTeachingEvidenceSource,
  getWorkflowStatusForLesson,
  listClassroomMetrics,
  listReportRecords,
  listTeachingEvidenceCards,
  saveReportRecord,
  updateReportRecord
} from "@class-reflect/database";
import { buildReportFromAcceptedEvidence } from "@class-reflect/domain";
import type { WorkflowStatus } from "@class-reflect/shared-types";

@Injectable()
export class ReportsService {
  async listReports(lessonId: string) {
    return { reports: await listReportRecords(lessonId) };
  }

  async generateReport(lessonId: string) {
    const workflow=await getWorkflowStatusForLesson(lessonId);
    if(!(workflow.task?.output.wait_human_review as any)?.confirmedAt)throw new Error('请先完成证据人工终审');
    const detail = await getLessonRecord(lessonId);
    if (!detail) throw new NotFoundException("lesson not found");
    const videoId=detail.videos[0]?.id;if(!videoId)throw new NotFoundException('video not found');
    const source=await getTeachingEvidenceSource({lessonId,videoId});
    const evidenceCards = await listTeachingEvidenceCards(lessonId,videoId);
    const metrics = await listClassroomMetrics({ lessonId,videoId });
    const report = buildReportFromAcceptedEvidence({
      evaluationContext:source?buildEvaluationContext(source.lesson.lessonFormat,source.transcriptSegments,source.lesson.sceneRevision):detail.evaluationContext,
      lesson: {
        id: detail.lesson.id,
        lessonTitle: detail.lesson.lessonTitle,
        courseTitle: detail.lesson.courseTitle || "课堂复盘",
        lessonFormat: canonicalLessonFormat(detail.lesson.lessonFormat)||"offline_classroom_recording",
        status: detail.lesson.status as WorkflowStatus
      },
      evidenceCards,
      metrics
    });
    const saved = await saveReportRecord({
      lessonId,
      markdownContent: report.markdownContent,
      generatedFrom: {...report.generatedFrom,videoId:detail.videos[0]?.id}
    });
    return { ok: true, report: saved };
  }

  async updateReport(lessonId: string, reportId: string, input: UpdateReportRequest) {
    const report = await updateReportRecord({
      lessonId,
      reportId,
      markdownContent: input.markdownContent
    });
    if (!report) throw new NotFoundException("report not found");
    return { ok: true, report };
  }
}
