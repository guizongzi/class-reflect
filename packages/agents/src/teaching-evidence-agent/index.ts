export { runTeachingEvidenceAgent } from "./run";

import type { AgentResult, TeachingEvidenceInput, TeachingEvidenceOutput } from "../types";
import { runTeachingEvidenceAgent } from "./run";

export const teachingEvidenceAgentModule = {
  name: "teaching-evidence-agent" as const,
  async run(input: unknown, options?: { traceId?: string }): Promise<AgentResult<TeachingEvidenceOutput>> {
    if (!isTeachingEvidenceInput(input)) throw new Error("teaching-evidence-agent input is invalid");
    return runTeachingEvidenceAgent({ ...input, traceId: options?.traceId || input.traceId });
  }
};

function isTeachingEvidenceInput(value: unknown): value is TeachingEvidenceInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TeachingEvidenceInput>;
  return typeof candidate.lessonId === "string"
    && typeof candidate.lesson_format === "string"
    && Array.isArray(candidate.transcriptSegments)
    && Array.isArray(candidate.metrics);
}
