import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateLessonRequest } from "@class-reflect/api-contracts";
import { z } from "zod";
import { createLessonDraft, type Lesson } from "@class-reflect/domain";
import {
  createLessonRecord,
  createLessonVideoRecord,
  deleteLessonRecord,
  getLessonRecord,
  getLessonVideoRecord,
  listLessonRecords,
  markLessonVideoAudioUploaded,
  markLessonVideoUploaded,
  setLessonVideoAudioObject,
  updateLessonVideoObjectKey
} from "@class-reflect/database";
import {
  assertR2ObjectExists,
  createLessonAudioObjectKey,
  createLessonVideoObjectKey,
  createR2UploadUrl
} from "@class-reflect/providers";

const CreateVideoUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().nonnegative().optional(),
  mimeType: z.string().min(1).optional()
});

const CreateAudioUploadSchema = z.object({
  mimeType: z.string().min(1).default("audio/wav")
});

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

  async createVideoUpload(lessonId: string, body: unknown) {
    const lesson = await getLessonRecord(lessonId);
    if (!lesson) throw new NotFoundException("lesson not found");

    const input = CreateVideoUploadSchema.parse(body);
    const video = await createLessonVideoRecord({
      lessonId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType
    });
    const objectKey = createLessonVideoObjectKey({
      lessonId,
      videoId: video.id,
      fileName: input.fileName
    });
    await updateLessonVideoObjectKey({ videoId: video.id, objectKey });
    const upload = await createR2UploadUrl({
      objectKey,
      contentType: input.mimeType || "application/octet-stream"
    });

    return {
      videoId: video.id,
      lessonId,
      ...upload
    };
  }

  async completeVideoUpload(videoId: string) {
    const video = await getLessonVideoRecord(videoId);
    if (!video) throw new NotFoundException("video not found");
    await assertR2ObjectExists(video.objectKey);
    const updated = await markLessonVideoUploaded(videoId);
    return { ok: true, video: updated };
  }

  async createAudioUpload(videoId: string, body: unknown) {
    const video = await getLessonVideoRecord(videoId);
    if (!video) throw new NotFoundException("video not found");

    const input = CreateAudioUploadSchema.parse(body);
    const objectKey = createLessonAudioObjectKey({
      lessonId: video.lessonId,
      videoId: video.id
    });
    await setLessonVideoAudioObject({
      videoId,
      audioObjectKey: objectKey,
      audioMimeType: input.mimeType
    });
    const upload = await createR2UploadUrl({
      objectKey,
      contentType: input.mimeType
    });

    return {
      videoId: video.id,
      lessonId: video.lessonId,
      ...upload
    };
  }

  async completeAudioUpload(videoId: string) {
    const video = await getLessonVideoRecord(videoId);
    if (!video) throw new NotFoundException("video not found");
    if (!video.audioObjectKey) throw new NotFoundException("audio upload not created");
    await assertR2ObjectExists(video.audioObjectKey);
    const updated = await markLessonVideoAudioUploaded(videoId);
    return { ok: true, video: updated };
  }
}
