import type { CreateLessonRequest } from "@class-reflect/api-contracts";
import type { LessonFormat, WorkflowStatus } from "@class-reflect/shared-types";

export type Lesson = {
  id: string;
  lessonTitle: string;
  courseTitle: string;
  lessonFormat: LessonFormat;
  status: WorkflowStatus;
};

export function createLessonDraft(request: CreateLessonRequest): Lesson {
  return {
    id: crypto.randomUUID(),
    lessonTitle: request.lessonTitle || request.lesson_title || "课堂视频复盘",
    courseTitle: request.courseTitle || request.course_title || "课堂复盘",
    lessonFormat: request.lessonFormat || request.lesson_format || "offline_classroom_recording",
    status: "created"
  };
}
