import { Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateLessonSectionRequest } from "@class-reflect/api-contracts";
import { updateLessonSectionText } from "@class-reflect/database";

@Injectable()
export class TranscriptsService {
  async updateSection(lessonId: string, sectionId: string, input: UpdateLessonSectionRequest) {
    const section = await updateLessonSectionText({
      lessonId,
      sectionId,
      editedSummaryText: input.editedSummaryText,
      reviewerId: input.reviewerId
    });
    if (!section) throw new NotFoundException("section not found");
    return { ok: true, section };
  }
}
