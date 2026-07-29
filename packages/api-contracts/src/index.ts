import { z } from "zod";

export const LessonFormatSchema = z.enum([
  "offline_classroom_recording",
  "live_online_class",
  "recorded_online_class"
]);

export const CreateLessonRequestSchema = z.object({
  lessonTitle: z.string().min(1).optional(),
  lesson_title: z.string().min(1).optional(),
  courseTitle: z.string().optional(),
  course_title: z.string().optional(),
  lessonFormat: LessonFormatSchema.optional(),
  lesson_format: LessonFormatSchema.optional(),
  subject: z.string().optional(),
  grade: z.string().optional(),
  analysisGoal: z.string().optional(),
  analysis_goal: z.string().optional()
});

export type CreateLessonRequest = z.infer<typeof CreateLessonRequestSchema>;

export const ReviewEvidenceRequestSchema = z.object({
  status: z.enum(["accepted", "edited_and_accepted", "rejected", "needs_more_context"]),
  finalFact: z.string().optional(),
  finalJudgment: z.string().optional(),
  finalSuggestion: z.string().optional(),
  reviewComment: z.string().optional()
});

export type ReviewEvidenceRequest = z.infer<typeof ReviewEvidenceRequestSchema>;
