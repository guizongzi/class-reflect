import { Body, Controller, Param, Patch } from "@nestjs/common";
import { UpdateLessonSectionRequestSchema } from "@class-reflect/api-contracts";
import { TranscriptsService } from "./transcripts.service";

@Controller("api/lessons/:lessonId/transcripts")
export class TranscriptsController {
  constructor(private readonly transcripts: TranscriptsService) {}

  @Patch("sections/:sectionId")
  updateSection(
    @Param("lessonId") lessonId: string,
    @Param("sectionId") sectionId: string,
    @Body() body: unknown
  ) {
    return this.transcripts.updateSection(lessonId, sectionId, UpdateLessonSectionRequestSchema.parse(body));
  }
}
