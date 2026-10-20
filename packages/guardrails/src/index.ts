import type { ClassroomEvent, ClassroomMetric, LessonFormat, TeachingEvidenceCard, TranscriptSegment } from "@class-reflect/shared-types";

export function assertEvidenceHasSource(evidence: { sources?: unknown[] }) {
  if (!evidence.sources?.length) {
    return { valid: false, reason: "证据缺少来源，不能进入报告" };
  }
  return { valid: true };
}

export function validateTeachingEvidenceCard(input: {
  lesson_format: LessonFormat;
  card: TeachingEvidenceCard;
  transcriptSegments?: TranscriptSegment[];
  metrics?: ClassroomMetric[];
  classroomEvents?: ClassroomEvent[];
}): { valid: true } | { valid: false; reason: string } {
  const { lesson_format } = input;
  const card = input.transcriptSegments
    ? resolveTeachingEvidenceCardTiming(input.card, input.transcriptSegments)
    : input.card;
  if (lesson_format === "recorded_online_class" && ["wait_time", "student_response", "feedback_quality", "follow_up", "response_pattern", "classroom_management", "misconception_handling"].includes(card.category)) {
    return { valid: false, reason: "not_applicable_to_lesson_format" };
  }
  if (isTeacherCertificationInterview(lesson_format) && ["wait_time", "student_response", "response_pattern", "technical_issue", "classroom_management", "misconception_handling"].includes(card.category)) {
    return { valid: false, reason: "not_applicable_to_lesson_format" };
  }
  const sourceValidation = validateEvidenceSources({ ...input, card });
  if (!sourceValidation.valid) return sourceValidation;

  const allText = [
    card.title,
    card.fact,
    card.interpretation,
    card.quote,
    card.uncertaintyNote || "",
    card.analysis?.internalReason || "",
    card.analysis?.suggestionDirection || "",
    card.teacherView?.title || "",
    card.teacherView?.observation || "",
    card.teacherView?.teachingMeaning || "",
    card.teacherView?.nextStep || "",
    card.teacherView?.exampleWording || ""
  ].join(" ");
  if (lesson_format === "recorded_online_class" && hasRecordedLessonInteractionClaim(allText)) {
    return { valid: false, reason: "recorded_lesson_interaction_evidence_not_allowed" };
  }
  if (isTeacherCertificationInterview(lesson_format) && hasTeacherQualificationLiveInteractionCriticism(allText)) {
    return { valid: false, reason: "recorded_lesson_interaction_evidence_not_allowed" };
  }
  if (!isTeacherCertificationInterview(lesson_format) && isRecordedMaterialFormat(lesson_format) && hasNoStudentResponseClaim(allText)) {
    return { valid: false, reason: "recorded_material_no_student_response_claim_not_allowed" };
  }
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
  if (!card.transcriptSegmentIds.length) {
    return { valid: false, reason: "evidence_missing_source" };
  }
  return { valid: true };
}

export function resolveTeachingEvidenceCardTiming(
  card: TeachingEvidenceCard,
  transcriptSegments: TranscriptSegment[]
): TeachingEvidenceCard {
  if (!card.transcriptSegmentIds.length) return card;
  const byId = new Map(transcriptSegments.map((segment) => [segment.id, segment]));
  const segments = card.transcriptSegmentIds.map((id) => byId.get(id));
  if (segments.some((segment) => !segment)) return card;
  return {
    ...card,
    startMs: Math.min(...segments.map((segment) => segment!.startMs)),
    endMs: Math.max(...segments.map((segment) => segment!.endMs))
  };
}

function validateEvidenceSources(input: {
  card: TeachingEvidenceCard;
  transcriptSegments?: TranscriptSegment[];
  metrics?: ClassroomMetric[];
  classroomEvents?: ClassroomEvent[];
}): { valid: true } | { valid: false; reason: string } {
  const { card } = input;
  if (!card.transcriptSegmentIds.length && !card.metricIds.length && !card.classroomEventIds.length) {
    return { valid: false, reason: "evidence_missing_source" };
  }
  if (input.transcriptSegments) {
    const byId = new Map(input.transcriptSegments.map((segment) => [segment.id, segment]));
    const segments = card.transcriptSegmentIds.map((id) => byId.get(id));
    if (segments.some((segment) => !segment)) return { valid: false, reason: "evidence_unknown_transcript_segment" };
    if (segments.length) {
      const startMs = Math.min(...segments.map((segment) => segment!.startMs));
      const endMs = Math.max(...segments.map((segment) => segment!.endMs));
      if (card.startMs < startMs || card.endMs > endMs) return { valid: false, reason: "evidence_time_outside_source_range" };
    }
  }
  if (input.metrics) {
    const metricIds = new Set(input.metrics.map((metric) => metric.id));
    if (card.metricIds.some((id) => !metricIds.has(id))) return { valid: false, reason: "evidence_unknown_metric" };
  }
  if (input.classroomEvents) {
    const eventIds = new Set(input.classroomEvents.map((event) => event.id));
    if (card.classroomEventIds.some((id) => !eventIds.has(id))) return { valid: false, reason: "evidence_unknown_classroom_event" };
  }
  return { valid: true };
}

function hasRecordedLessonInteractionClaim(text: string) {
  return /等待学生|学生回答|学生回应|回答机会|学生思路|师生互动|互动不足|点名|举手|请一位同学|提问后.{0,12}(很快|马上|立刻|继续|进入)|很快进入教师说明|教师自问自答|自问自答|约\d+(?:\.\d+)?秒/.test(text);
}

function isRecordedMaterialFormat(lessonFormat: LessonFormat) {
  return lessonFormat === "recorded_online_class" || lessonFormat === "offline_classroom_recording" || isTeacherCertificationInterview(lessonFormat);
}

function hasNoStudentResponseClaim(text: string) {
  return /没有真实学生回应|未见真实.?学生回应|缺乏真实.?学生.{0,8}(回应|参与|互动|反馈)|没有学生.{0,8}(回应|回答|参与|互动)|无学生.{0,8}(回应|回答|参与|互动)|所有回答均由教师|教师自己完成|自问自答/.test(text);
}

function hasTeacherQualificationLiveInteractionCriticism(text: string) {
  return /没有真实学生回应|未见真实.?学生回应|缺乏真实.?学生.{0,8}(回应|参与|互动|反馈)|缺乏真实互动|没有真实互动|等待真实学生|真实学生回答不足|真实学生反馈不足/.test(text);
}

function isTeacherCertificationInterview(lessonFormat: LessonFormat) {
  return lessonFormat === "teacher_certification_interview" || lessonFormat === "teacher_qualification_demo";
}
