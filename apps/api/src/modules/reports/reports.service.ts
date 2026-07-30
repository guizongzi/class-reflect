import { Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateReportRequest } from "@class-reflect/api-contracts";
import {
  getLessonRecord,
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
    const detail = await getLessonRecord(lessonId);
    if (!detail) throw new NotFoundException("lesson not found");
    const evidenceCards = await listTeachingEvidenceCards(lessonId);
    const metrics = await listClassroomMetrics({ lessonId });
    const report = buildReportFromAcceptedEvidence({
      lesson: {
        id: detail.lesson.id,
        lessonTitle: detail.lesson.lessonTitle,
        courseTitle: detail.lesson.courseTitle || "课堂复盘",
        lessonFormat: detail.lesson.lessonFormat === "live_online_class" || detail.lesson.lessonFormat === "recorded_online_class"
          ? detail.lesson.lessonFormat
          : "offline_classroom_recording",
        status: detail.lesson.status as WorkflowStatus
      },
      evidenceCards,
      metrics
    });
    const saved = await saveReportRecord({
      lessonId,
      markdownContent: report.markdownContent,
      generatedFrom: report.generatedFrom
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
