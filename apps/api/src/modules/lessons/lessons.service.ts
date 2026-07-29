import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateLessonRequest } from "@class-reflect/api-contracts";
import { createLessonDraft, type Lesson } from "@class-reflect/domain";
import { createLessonRecord, deleteLessonRecord, getLessonRecord, listLessonRecords } from "@class-reflect/database";

@Injectable()
export class LessonsService {
  async listLessons(): Promise<{ lessons: Lesson[] }> {
    const lessons = await listLessonRecords();
    return { lessons: lessons as unknown as Lesson[] };
  }

  async createLesson(request: CreateLessonRequest): Promise<Lesson> {
    const draft = createLessonDraft(request);
    return createLessonRecord({
      courseTitle: draft.courseTitle,
      lessonTitle: draft.lessonTitle,
      lessonFormat: draft.lessonFormat,
      grade: request.grade,
      subject: request.subject,
      analysisGoal: request.analysisGoal || request.analysis_goal
    }) as unknown as Lesson;
  }

  async getLesson(lessonId: string) {
    const lesson = await getLessonRecord(lessonId);
    if (!lesson) throw new NotFoundException("lesson not found");
    return lesson;
  }

  async deleteLesson(lessonId: string) {
    const deleted = await deleteLessonRecord(lessonId);
    if (!deleted) throw new NotFoundException("lesson not found");
    return { ok: true, deletedLessonId: lessonId };
  }
}
