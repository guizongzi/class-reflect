import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { UpdateReportRequestSchema } from "@class-reflect/api-contracts";
import { ReportsService } from "./reports.service";

@Controller("api/lessons/:lessonId/reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  listReports(@Param("lessonId") lessonId: string) {
    return this.reports.listReports(lessonId);
  }

  @Post()
  generateReport(@Param("lessonId") lessonId: string) {
    return this.reports.generateReport(lessonId);
  }

  @Patch(":reportId")
  updateReport(
    @Param("lessonId") lessonId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown
  ) {
    return this.reports.updateReport(lessonId, reportId, UpdateReportRequestSchema.parse(body));
  }
}
