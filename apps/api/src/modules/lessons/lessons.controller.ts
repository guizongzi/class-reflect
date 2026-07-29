import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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
}
