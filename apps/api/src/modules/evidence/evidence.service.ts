import { Injectable, NotFoundException } from "@nestjs/common";
import type { ReviewEvidenceRequest } from "@class-reflect/api-contracts";
import { listTeachingEvidenceCards, reviewEvidenceCardRecord } from "@class-reflect/database";

@Injectable()
export class EvidenceService {
  async listEvidence(lessonId: string) {
    return { evidenceCards: await listTeachingEvidenceCards(lessonId) };
  }

  async reviewEvidence(lessonId: string, evidenceId: string, input: ReviewEvidenceRequest) {
    const evidence = await reviewEvidenceCardRecord({
      lessonId,
      evidenceCardId: evidenceId,
      status: input.status,
      finalFact: input.finalFact,
      finalJudgment: input.finalJudgment,
      finalSuggestion: input.finalSuggestion,
      reviewComment: input.reviewComment
    });
    if (!evidence) throw new NotFoundException("evidence card not found");
    return { ok: true, evidence };
  }
}
