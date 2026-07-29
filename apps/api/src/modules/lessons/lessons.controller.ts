import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CreateLessonRequestSchema } from "@class-reflect/api-contracts";
import { LessonsService } from "./lessons.service";

@Controller("api/lessons")
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get()
  async listLessons() {
    return this.lessons.listLessons();
  }

  @Post()
  async createLesson(@Body() body: unknown) {
    return this.lessons.createLesson(CreateLessonRequestSchema.parse(body));
  }

  @Get(":lessonId")
  async getLesson(@Param("lessonId") lessonId: string) {
    return this.lessons.getLesson(lessonId);
  }

  @Delete(":lessonId")
  async deleteLesson(@Param("lessonId") lessonId: string) {
    return this.lessons.deleteLesson(lessonId);
  }

  @Post(":lessonId/videos/upload-url")
  async createVideoUpload(@Param("lessonId") lessonId: string, @Body() body: unknown) {
    return this.lessons.createVideoUpload(lessonId, body);
  }

  @Post("videos/:videoId/complete-upload")
  async completeVideoUpload(@Param("videoId") videoId: string) {
    return this.lessons.completeVideoUpload(videoId);
  }

  @Post("videos/:videoId/audio-upload-url")
  async createAudioUpload(@Param("videoId") videoId: string, @Body() body: unknown) {
    return this.lessons.createAudioUpload(videoId, body);
  }

  @Post("videos/:videoId/complete-audio-upload")
  async completeAudioUpload(@Param("videoId") videoId: string) {
    return this.lessons.completeAudioUpload(videoId);
  }
}
