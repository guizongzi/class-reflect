import type { TranscriptSegment } from "@class-reflect/shared-types";
import { tryRunLlmAgent } from "../llm";
import type { AgentResult, TranscriptNormalizerOutput } from "../types";
import { buildDisplayTranscriptSections } from "./sections";
import { buildSpeakerProfiles, normalizeTranscriptSegment } from "./speaker-profiles";
import { inferTranscriptFlags, isTeacherLikeSegment } from "./text-utils";
import { applyTranscriptNormalizerPatches } from "./patch-apply";
import { buildTranscriptNormalizerPatchInput, buildTranscriptNormalizerWindows } from "./patch-input";
import { transcriptNormalizerPatchInstruction } from "./prompt";
import {
  transcriptNormalizerPatchPromptVersion,
  type TranscriptNormalizerIndexedPatchOutput,
  type TranscriptNormalizerPatchOutput
} from "./schema";
import {
  isTranscriptNormalizerIndexedPatchOutputForWindow,
  validateAndAdaptTranscriptNormalizerIndexedOutput
} from "./validator";

export async function runTranscriptNormalizer(
  segments: TranscriptSegment[],
  options?: { traceId?: string }
): Promise<AgentResult<TranscriptNormalizerOutput>> {
  const windows = buildTranscriptNormalizerWindows(segments);
  if (windows.length) {
    const patchOutputs: TranscriptNormalizerPatchOutput[] = [];
    let allWindowsValid = true;

    for (const window of windows) {
      const llmOutput = await tryRunLlmAgent<TranscriptNormalizerIndexedPatchOutput>({
        agentName: "transcript-normalizer-agent",
        promptVersion: transcriptNormalizerPatchPromptVersion,
        traceId: options?.traceId,
        systemInstruction: transcriptNormalizerPatchInstruction,
        payload: buildTranscriptNormalizerPatchInput(window),
        validate: (value): value is TranscriptNormalizerIndexedPatchOutput => (
          isTranscriptNormalizerIndexedPatchOutputForWindow(value, window)
        )
      });

      if (!llmOutput) {
        allWindowsValid = false;
        break;
      }
      const adapted = validateAndAdaptTranscriptNormalizerIndexedOutput(llmOutput, window);
      if (!adapted.valid || !adapted.output) {
        allWindowsValid = false;
        break;
      }
      patchOutputs.push(adapted.output);
    }

    if (allWindowsValid) {
      const mergedPatchOutput: TranscriptNormalizerPatchOutput = {
        patches: patchOutputs.flatMap((output) => output.patches),
        warnings: patchOutputs.flatMap((output) => output.warnings || [])
      };
      return {
        output: buildCompatibleTranscriptNormalizerOutput(
          applyTranscriptNormalizerPatches(segments, mergedPatchOutput),
          mergedPatchOutput
        ),
        promptVersion: transcriptNormalizerPatchPromptVersion,
        warnings: mergedPatchOutput.warnings
      };
    }
  }

  return buildRuleBasedTranscriptNormalizerOutput(segments);
}

function buildRuleBasedTranscriptNormalizerOutput(segments: TranscriptSegment[]): AgentResult<TranscriptNormalizerOutput> {
  const sortedSegments = [...segments].sort((a, b) => a.startMs - b.startMs);
  const speakerProfiles = buildSpeakerProfiles(sortedSegments);
  const normalizedSegments = sortedSegments.map((segment, index) => normalizeTranscriptSegment(segment, index, speakerProfiles));
  return {
    output: buildCompatibleTranscriptNormalizerOutput(normalizedSegments),
    promptVersion: "transcript-agent.rule-based.v0.1",
    warnings: []
  };
}

function buildCompatibleTranscriptNormalizerOutput(
  normalizedSegments: TranscriptSegment[],
  patchOutput?: TranscriptNormalizerPatchOutput
): TranscriptNormalizerOutput {
  const displaySections = buildDisplayTranscriptSections(normalizedSegments);
  const flags = [...new Set([
    ...normalizedSegments.flatMap((segment) => inferTranscriptFlags(segment)),
    ...(patchOutput?.patches.some((patch) => patch.needsHumanReview) ? ["needs_human_review"] : [])
  ])];
  return {
    normalizedSegments,
    displaySections,
    analysisProjection: {
      sentenceCount: normalizedSegments.length,
      teacherSentenceCount: normalizedSegments.filter(isTeacherLikeSegment).length,
      studentSentenceCount: normalizedSegments.filter((segment) => /学生|同学|全班|齐答/.test(segment.speakerLabel || "")).length,
      lowConfidenceSentenceCount: normalizedSegments.filter((segment) => (segment.confidence ?? 1) < 0.65).length,
      flags
    }
  };
}
