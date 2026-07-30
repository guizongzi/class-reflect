import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ReviewEvidenceRequestSchema } from "@class-reflect/api-contracts";
import { EvidenceService } from "./evidence.service";

@Controller("api/lessons/:lessonId/evidence")
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get()
  listEvidence(@Param("lessonId") lessonId: string) {
    return this.evidence.listEvidence(lessonId);
  }

  @Patch(":evidenceId/review")
  reviewEvidence(
    @Param("lessonId") lessonId: string,
    @Param("evidenceId") evidenceId: string,
    @Body() body: unknown
  ) {
    return this.evidence.reviewEvidence(lessonId, evidenceId, ReviewEvidenceRequestSchema.parse(body));
  }
}
