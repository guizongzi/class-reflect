import type { TranscriptSegment } from "@class-reflect/shared-types";
import type { SpeakerProfile } from "../types";
import { isLikelyChoralText, isTeacherLikeSegment, scoreTeacherLikelihood } from "./text-utils";

export function buildSpeakerProfiles(segments: TranscriptSegment[]) {
  const grouped = new Map<string, { label: string; text: string; durationMs: number; count: number; score: number }>();
  for (const segment of segments) {
    const label = segment.speakerLabel || "未知";
    const current = grouped.get(label) || { label, text: "", durationMs: 0, count: 0, score: 0 };
    current.text = `${current.text} ${segment.text || ""}`.trim();
    current.durationMs += Math.max(segment.endMs - segment.startMs, 0);
    current.count += 1;
    current.score += scoreTeacherLikelihood(segment.text || "");
    grouped.set(label, current);
  }
  const profiles = [...grouped.values()].sort((a, b) => (
    (b.score + b.durationMs / 60000 + b.count * 0.1) - (a.score + a.durationMs / 60000 + a.count * 0.1)
  ));
  const teacherRawLabel = profiles[0]?.label || "未知";
  const studentLabels = new Map<string, string>();
  let studentIndex = 0;
  const result = new Map<string, SpeakerProfile>();

  for (const profile of profiles) {
    const sample = profile.text;
    if (profile.label === teacherRawLabel || /教师|老师|teacher/i.test(profile.label)) {
      result.set(profile.label, { rawLabel: profile.label, normalizedLabel: "教师", role: "teacher", score: profile.score });
      continue;
    }
    if (/全班|齐答|大家|同学们/.test(profile.label) || isLikelyChoralText(sample)) {
      result.set(profile.label, { rawLabel: profile.label, normalizedLabel: "全班", role: "students", score: profile.score });
      continue;
    }
    if (/未知/.test(profile.label) && profile.score < 2) {
      result.set(profile.label, { rawLabel: profile.label, normalizedLabel: "未知", role: "unknown", score: profile.score });
      continue;
    }
    const label = studentLabels.get(profile.label) || `学生${String.fromCharCode(65 + studentIndex)}`;
    studentLabels.set(profile.label, label);
    studentIndex += 1;
    result.set(profile.label, { rawLabel: profile.label, normalizedLabel: label, role: "student", score: profile.score });
  }
  return result;
}

export function normalizeTranscriptSegment(
  segment: TranscriptSegment,
  index: number,
  profiles: Map<string, SpeakerProfile>
): TranscriptSegment {
  const rawLabel = segment.speakerLabel || "未知";
  const profile = profiles.get(rawLabel);
  const normalizedText = normalizeTranscriptText(segment.text || "");
  return {
    ...segment,
    speakerLabel: profile?.normalizedLabel || rawLabel,
    text: normalizedText,
    confidence: segment.confidence ?? inferNormalizationConfidence(segment, profile, index)
  };
}

function normalizeTranscriptText(text: string) {
  const trimmed = text.replace(/\s+/g, "").trim();
  if (!trimmed) return "";
  if (/[。！？!?]$/.test(trimmed)) return trimmed;
  if (/吗|呢|么|什么|为什么|怎么|哪|几|是不是|对不对$/.test(trimmed)) return `${trimmed}？`;
  return `${trimmed}。`;
}

function inferNormalizationConfidence(segment: TranscriptSegment, profile: SpeakerProfile | undefined, index: number) {
  let confidence = 0.78;
  if (!profile || profile.role === "unknown") confidence -= 0.12;
  if (index === 0 && isTeacherLikeSegment(segment)) confidence += 0.08;
  if ((segment.text || "").length < 3) confidence -= 0.08;
  return Math.max(0.45, Math.min(0.95, confidence));
}
