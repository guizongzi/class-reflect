import type { TranscriptSegment } from "@class-reflect/shared-types";
import { tryRunLlmAgent } from "../llm";
import { transcriptNormalizerInstruction } from "./prompt";
import type { AgentResult, TranscriptNormalizerOutput } from "../types";
import { isTranscriptNormalizerOutput } from "./validator";
import { buildDisplayTranscriptSections } from "./sections";
import { buildSpeakerProfiles, normalizeTranscriptSegment } from "./speaker-profiles";
import { inferTranscriptFlags, isTeacherLikeSegment } from "./text-utils";

export async function runTranscriptNormalizer(
  segments: TranscriptSegment[],
  options?: { traceId?: string }
): Promise<AgentResult<TranscriptNormalizerOutput>> {
  const llmOutput = await tryRunLlmAgent<TranscriptNormalizerOutput>({
    agentName: "transcript-normalizer-agent",
    promptVersion: "transcript-agent.llm.v1",
    traceId: options?.traceId,
    payload: {
      instruction: transcriptNormalizerInstruction,
      segments
    },
    validate: isTranscriptNormalizerOutput
  });

  if (llmOutput) {
    return {
      output: llmOutput,
      promptVersion: "transcript-agent.llm.v1",
      warnings: []
    };
  }

  const sortedSegments = [...segments].sort((a, b) => a.startMs - b.startMs);
  const speakerProfiles = buildSpeakerProfiles(sortedSegments);
  const normalizedSegments = sortedSegments.map((segment, index) => normalizeTranscriptSegment(segment, index, speakerProfiles));
  const displaySections = buildDisplayTranscriptSections(normalizedSegments);
  const flags = [...new Set(normalizedSegments.flatMap((segment) => inferTranscriptFlags(segment)))];
  return {
    output: {
      normalizedSegments,
      displaySections,
      analysisProjection: {
        sentenceCount: normalizedSegments.length,
        teacherSentenceCount: normalizedSegments.filter(isTeacherLikeSegment).length,
        studentSentenceCount: normalizedSegments.filter((segment) => /学生|同学|全班|齐答/.test(segment.speakerLabel || "")).length,
        lowConfidenceSentenceCount: normalizedSegments.filter((segment) => (segment.confidence ?? 1) < 0.65).length,
        flags
      }
    },
    promptVersion: "transcript-agent.rule-based.v0.1",
    warnings: []
  };
}
