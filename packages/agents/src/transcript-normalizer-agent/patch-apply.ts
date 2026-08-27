import type { TranscriptSegment } from "@class-reflect/shared-types";
import type { TranscriptNormalizerPatchOutput } from "./schema";

export function applyTranscriptNormalizerPatches(
  segments: TranscriptSegment[],
  patchOutput: TranscriptNormalizerPatchOutput
): TranscriptSegment[] {
  const patchById = new Map(patchOutput.patches.map((patch) => [patch.sentenceId, patch]));
  return [...segments].sort((a, b) => a.startMs - b.startMs).map((segment) => {
    const patch = patchById.get(segment.id);
    if (!patch) return { ...segment };
    const correctedText = typeof patch.correctedText === "string" && hasMeaningfulTextChange(patch.correctedText, segment.text)
      ? patch.correctedText
      : segment.text;
    return {
      ...segment,
      text: correctedText,
      speakerLabel: patch.speakerRole ? displayLabelForRole(patch.speakerRole, segment.speakerLabel) : segment.speakerLabel,
      confidence: patch.confidence
    };
  });
}

function hasMeaningfulTextChange(candidate: string, original: string) {
  return candidate.trim().replace(/\s+/g, "") !== original.trim().replace(/\s+/g, "");
}

function displayLabelForRole(role: string, fallback: string | null | undefined) {
  if (role === "teacher") return "教师";
  if (role === "student") return fallback && /学生/.test(fallback) ? fallback : "学生A";
  if (role === "students") return "全班";
  if (role === "multiple") return "多人";
  if (role === "unknown") return "未知";
  return fallback ?? null;
}
