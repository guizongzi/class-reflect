import { getWorkflowConfig } from "@class-reflect/config";
export function getTranscriptNormalizerInstruction(){ return getWorkflowConfig().prompts.normalizer; }
export const transcriptNormalizerPatchInstruction = getTranscriptNormalizerInstruction();
export const transcriptNormalizerInstruction = transcriptNormalizerPatchInstruction;
