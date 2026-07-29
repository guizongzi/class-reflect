import { Injectable } from "@nestjs/common";
import type { CreateLessonRequest } from "@class-reflect/api-contracts";
import { createLessonDraft, type Lesson } from "@class-reflect/domain";

@Injectable()
export class LessonsService {
  async listLessons(): Promise<{ lessons: Lesson[] }> {
    return { lessons: [] };
  }

  async createLesson(request: CreateLessonRequest): Promise<Lesson> {
    return createLessonDraft(request);
  }

  async getLesson(lessonId: string) {
    return {
      lesson: {
        id: lessonId,
        lessonTitle: "课堂视频复盘",
        lessonFormat: "offline_classroom_recording",
        status: "created"
      },
      sections: [],
      transcriptSegments: [],
      evidenceCards: []
    };
  }
}
