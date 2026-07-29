import { runTranscriptNormalizer } from "@class-reflect/agents";
import { assertEvidenceHasSource } from "@class-reflect/guardrails";
import { calculateSpeechRate } from "@class-reflect/metrics";
import type { ProcessorResult, WorkflowProcessor } from "./types";

export const normalizeTranscriptProcessor: WorkflowProcessor = {
  stepKey: "normalize_transcript",
  async run(): Promise<ProcessorResult> {
    const result = runTranscriptNormalizer([]);
    return {
      output: {
        promptVersion: result.promptVersion,
        normalizedSegmentCount: result.output.length
      },
      warnings: result.warnings
    };
  }
};

export const buildSectionsProcessor: WorkflowProcessor = {
  stepKey: "build_sections",
  async run(): Promise<ProcessorResult> {
    throw new Error("build_sections processor not implemented: 需要 lesson_sections repository");
  }
};

export const calculateMetricsProcessor: WorkflowProcessor = {
  stepKey: "calculate_metrics",
  async run(): Promise<ProcessorResult> {
    const speechRate = calculateSpeechRate([]);
    return { output: { speechRate } };
  }
};

export const detectEventsProcessor: WorkflowProcessor = {
  stepKey: "detect_events",
  async run(): Promise<ProcessorResult> {
    throw new Error("detect_events processor not implemented: 需要课堂事件 Agent 和事件 repository");
  }
};

export const generateEvidenceProcessor: WorkflowProcessor = {
  stepKey: "generate_evidence",
  async run(): Promise<ProcessorResult> {
    throw new Error("generate_evidence processor not implemented: 需要 evidence_cards repository 和 LLM Provider");
  }
};

export const validateEvidenceProcessor: WorkflowProcessor = {
  stepKey: "validate_evidence",
  async run(): Promise<ProcessorResult> {
    const validation = assertEvidenceHasSource({ sources: [] });
    if (!validation.valid) {
      return {
        output: { validEvidenceCount: 0, rejectedReason: validation.reason },
        warnings: ["no_evidence_to_validate"]
      };
    }
    return { output: { validEvidenceCount: 1 } };
  }
};
