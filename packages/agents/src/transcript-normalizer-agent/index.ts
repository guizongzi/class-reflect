export { runTranscriptNormalizer } from "./run";

import type { AgentResult, TranscriptNormalizerOutput } from "../types";
import type { TranscriptSegment } from "@class-reflect/shared-types";
import { runTranscriptNormalizer } from "./run";

export const transcriptNormalizerAgentModule = {
  name: "transcript-normalizer-agent" as const,
  async run(input: unknown, options?: { traceId?: string }): Promise<AgentResult<TranscriptNormalizerOutput>> {
    if (!Array.isArray(input)) throw new Error("transcript-normalizer-agent input must be a transcript segment array");
    return runTranscriptNormalizer(input as TranscriptSegment[], options);
  }
};
