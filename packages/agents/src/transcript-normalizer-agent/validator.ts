import type { TranscriptNormalizerOutput } from "../types";

export function isTranscriptNormalizerOutput(value: unknown): value is TranscriptNormalizerOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.normalizedSegments)
    && Array.isArray(candidate.displaySections)
    && !!candidate.analysisProjection
    && typeof candidate.analysisProjection === "object";
}
