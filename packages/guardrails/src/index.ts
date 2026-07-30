import type { LessonFormat, TeachingEvidenceCard } from "@class-reflect/shared-types";

export function assertEvidenceHasSource(evidence: { sources?: unknown[] }) {
  if (!evidence.sources?.length) {
    return { valid: false, reason: "证据缺少来源，不能进入报告" };
  }
  return { valid: true };
}

export function validateTeachingEvidenceCard(input: {
  lesson_format: LessonFormat;
  card: TeachingEvidenceCard;
}): { valid: true } | { valid: false; reason: string } {
  const { lesson_format, card } = input;
  if (lesson_format === "recorded_online_class" && ["wait_time", "student_response", "classroom_management"].includes(card.category)) {
    return { valid: false, reason: "not_applicable_to_lesson_format" };
  }

  const allText = [card.title, card.fact, card.interpretation, card.suggestion, card.uncertaintyNote || ""].join(" ");
  const responsePattern = card.learningCheck?.responsePattern;
  if (responsePattern === "choral_response" && /学生已经掌握|全班都理解|所有学生都会|学生掌握情况良好/.test(allText)) {
    return { valid: false, reason: "choral_response_overclaim" };
  }
  if (responsePattern === "teacher_self_answer" && /学生回答成功|学生理解证据|有效学生反馈/.test(allText)) {
    return { valid: false, reason: "teacher_self_answer_overclaim" };
  }
  if (card.learningCheck?.level === 1 && ["strong", "very_strong"].includes(card.learningCheck.evidenceStrength)) {
    return { valid: false, reason: "oral_confirmation_strength_too_high" };
  }
  if (!card.transcriptSegmentIds.length || !card.quote.trim()) {
    return { valid: false, reason: "evidence_missing_source" };
  }
  return { valid: true };
}
