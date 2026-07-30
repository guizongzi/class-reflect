import { Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateLessonSectionRequest } from "@class-reflect/api-contracts";
import { updateLessonSectionText, updateTranscriptSegmentText } from "@class-reflect/database";

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

  async updateSegment(lessonId: string, segmentId: string, input: UpdateLessonSectionRequest) {
    const segment = await updateTranscriptSegmentText({
      lessonId,
      segmentId,
      editedText: input.editedSummaryText,
      reviewerId: input.reviewerId
    });
    if (!segment) throw new NotFoundException("segment not found");
    return { ok: true, segment };
  }
}
