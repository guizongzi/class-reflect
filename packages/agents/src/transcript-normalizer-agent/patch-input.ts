import type { TranscriptSegment } from "@class-reflect/shared-types";
import {
  transcriptNormalizerWindowOverlap,
  transcriptNormalizerWindowSize,
  type TranscriptNormalizerPatchInput,
  type TranscriptNormalizerWindow
} from "./schema";

export function buildTranscriptNormalizerWindows(segments: TranscriptSegment[]): TranscriptNormalizerWindow[] {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  if (!sorted.length) return [];
  const windows: TranscriptNormalizerWindow[] = [];
  let writableStart = 0;
  let windowIndex = 0;
  while (writableStart < sorted.length) {
    const writableEnd = Math.min(writableStart + transcriptNormalizerWindowSize, sorted.length);
    const contextStart = Math.max(0, writableStart - transcriptNormalizerWindowOverlap);
    const contextEnd = Math.min(sorted.length, writableEnd + transcriptNormalizerWindowOverlap);
    windows.push({
      windowId: `window-${windowIndex}`,
      writableSegments: sorted.slice(writableStart, writableEnd),
      contextSegments: sorted.slice(contextStart, contextEnd)
    });
    writableStart = writableEnd;
    windowIndex += 1;
  }
  return windows;
}

export function buildTranscriptNormalizerPatchInput(window: TranscriptNormalizerWindow): TranscriptNormalizerPatchInput {
  const writableIds = new Set(window.writableSegments.map((segment) => segment.id));
  return {
    firstSentenceId: window.contextSegments[0].id,
    speakerRegistry: { A: "teacher", B: "student", C: "unknown" },
    sentences: window.contextSegments.map((segment) => [
      writableIds.has(segment.id) ? "w" : "c",
      speakerCodeForSegment(segment),
      segment.confidence ?? null,
      segment.text
    ]),
    glossary: inferWindowGlossary(window.contextSegments)
  };
}

function speakerCodeForSegment(segment: TranscriptSegment) {
  const role = inferSpeakerRoleHint((segment as TranscriptSegment & { speakerRoleHint?: string }).speakerRoleHint || segment.speakerLabel);
  if (role === "teacher") return "A" as const;
  if (role === "student" || role === "students") return "B" as const;
  return "C" as const;
}

function inferSpeakerRoleHint(label: string | null | undefined) {
  if (!label) return "unknown" as const;
  if (label === "teacher" || label === "student" || label === "students" || label === "multiple" || label === "unknown") return label;
  if (/教师|老师|teacher/i.test(label)) return "teacher" as const;
  if (/全班|齐答|同学们/.test(label)) return "students" as const;
  if (/多人|重叠/.test(label)) return "multiple" as const;
  if (/学生/.test(label)) return "student" as const;
  return "unknown" as const;
}

function inferWindowGlossary(segments: TranscriptSegment[]) {
  const text = segments.map((segment) => segment.text).join("");
  const glossary = [
    "二氧化碳",
    "CO2",
    "分数",
    "分数单位",
    "等腰三角形",
    "底角",
    "通分",
    "公分母"
  ];
  return glossary.filter((term) => text.includes(term) || (term === "CO2" && /CO\s*[23兔]/i.test(text)));
}
