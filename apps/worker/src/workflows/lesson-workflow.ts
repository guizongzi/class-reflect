import { runTranscriptNormalizer } from "@class-reflect/agents";
import { calculateSpeechRate } from "@class-reflect/metrics";
import { assertEvidenceHasSource } from "@class-reflect/guardrails";

export async function runLessonWorkflowOnce(): Promise<{ claimed: boolean }> {
  // M1 skeleton: keep workflow ownership here. Real queue claiming and R2/ASR processing
  // are migrated from legacy/node-mvp into packages/database and packages/providers.
  runTranscriptNormalizer([]);
  calculateSpeechRate([]);
  assertEvidenceHasSource({ sources: [] });
  return { claimed: false };
}
