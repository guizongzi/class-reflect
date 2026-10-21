import type { LessonFormat } from "@class-reflect/shared-types";
import { getWorkflowConfig } from "@class-reflect/config";
export function buildTeachingEvidenceOutputInstruction(lessonFormat: LessonFormat) {
 const config=getWorkflowConfig(); const key=lessonFormat === "teacher_qualification_demo" ? "teacher_certification_interview" : lessonFormat;
 return `${config.prompts.evidence}\n\n${config.prompts.sceneInstructions[key] || config.prompts.sceneInstructions.offline_classroom_recording}`.trim();
}
export const teachingEvidenceOutputInstruction = buildTeachingEvidenceOutputInstruction("offline_classroom_recording");
