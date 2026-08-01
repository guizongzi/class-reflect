import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateLessonRequest, UpdateLessonRequest } from "@class-reflect/api-contracts";
import { z } from "zod";
import { createLessonDraft, type Lesson } from "@class-reflect/domain";
import {
  createLessonRecord,
  createLessonVideoRecord,
  deleteLessonRecord,
  getLessonRecord,
  getTranslationTarget,
  getLessonVideoRecord,
  listLessonRecords,
  markLessonVideoAudioUploaded,
  markLessonVideoUploaded,
  setLessonVideoAudioObject,
  updateLessonVideoObjectKey,
  updateLessonRecord,
  saveTranslationResult
} from "@class-reflect/database";
import { WorkflowsService } from "../workflows/workflows.service";
import {
  assertR2ObjectExists,
  createLessonAudioObjectKey,
  createLessonVideoObjectKey,
  createR2ReadUrl,
  createR2UploadUrl,
  createConfiguredTranslationProvider
} from "@class-reflect/providers";

const CreateVideoUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().nonnegative().optional(),
  mimeType: z.string().min(1).optional()
});

const CreateAudioUploadSchema = z.object({
  mimeType: z.string().min(1).default("audio/wav")
});

const TranslateTargetSchema = z.object({
  targetType: z.enum(["section", "segment"]),
  targetId: z.string().min(1),
  sourceLanguage: z.string().default("en"),
  targetLanguage: z.string().default("zh-CN"),
  force: z.boolean().default(false)
});

@Injectable()
export class LessonsService {
  constructor(private readonly workflows: WorkflowsService) {}

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
    const videos = await Promise.all((lesson.videos || []).map(async (video) => {
      if (video.uploadStatus !== "uploaded" || !video.objectKey) return video;
      try {
        return {
          ...video,
          playbackUrl: await createR2ReadUrl({ objectKey: video.objectKey, expiresInSeconds: 3600 }),
          playbackUrlExpiresInSeconds: 3600
        };
      } catch (error) {
        return {
          ...video,
          playbackError: error instanceof Error ? error.message : "无法生成视频播放链接"
        };
      }
    }));
    return { ...lesson, videos };
  }

  async updateLesson(lessonId: string, request: UpdateLessonRequest) {
    const lesson = await updateLessonRecord({
      lessonId,
      lessonFormat: request.lessonFormat || request.lesson_format
    });
    if (!lesson) throw new NotFoundException("lesson not found");
    return { lesson };
  }

  async deleteLesson(lessonId: string) {
    const deleted = await deleteLessonRecord(lessonId);
    if (!deleted) throw new NotFoundException("lesson not found");
    return { ok: true, deletedLessonId: lessonId };
  }

  async createLessonWorkflow(lessonId: string) {
    return this.workflows.ensureLessonWorkflowQueued(lessonId);
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
    if (updated) {
      await this.workflows.ensureLessonWorkflowQueued(updated.lessonId);
    }
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
    if (updated) {
      await this.workflows.ensureLessonWorkflowQueued(updated.lessonId);
    }
    return { ok: true, video: updated };
  }

  async translateLessonText(lessonId: string, body: unknown) {
    const lesson = await getLessonRecord(lessonId);
    if (!lesson) throw new NotFoundException("lesson not found");

    const input = TranslateTargetSchema.parse(body);
    const target = await getTranslationTarget({
      lessonId,
      targetType: input.targetType,
      targetId: input.targetId
    });
    if (!target) throw new NotFoundException("translation target not found");
    if (!target.originalText.trim()) {
      throw new Error("该段落没有可翻译的原文");
    }
    if (target.translatedText && !input.force) {
      return { ok: true, translation: target, cached: true };
    }

    const provider = createConfiguredTranslationProvider();
    const translatedText = await provider.translate({
      text: target.originalText,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage
    });
    const saved = await saveTranslationResult({
      lessonId,
      targetType: input.targetType,
      targetId: input.targetId,
      translatedText
    });
    return { ok: true, translation: saved, cached: false };
  }
}
