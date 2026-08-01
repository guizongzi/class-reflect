import type { WorkflowRunRecord, WorkflowStepRunRecord } from "@class-reflect/database";

export type ProcessorContext = {
  workflow: WorkflowRunRecord;
  steps: WorkflowStepRunRecord[];
  traceId?: string;
};

export type ProcessorResult = {
  output?: Record<string, unknown>;
  warnings?: string[];
};

export interface WorkflowProcessor {
  stepKey: string;
  run(context: ProcessorContext): Promise<ProcessorResult>;
}
