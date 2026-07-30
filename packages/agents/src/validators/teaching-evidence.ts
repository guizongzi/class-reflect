import type { TeachingEvidenceOutput } from "../types";

export function isTeachingEvidenceOutput(value: unknown): value is TeachingEvidenceOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.lessonId === "string"
    && Array.isArray(candidate.evidenceCards)
    && Array.isArray(candidate.skippedCategories)
    && !!candidate.generationSummary
    && typeof candidate.generationSummary === "object";
}
