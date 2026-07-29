import type { ProcessorResult, WorkflowProcessor } from "./types";

export const waitHumanReviewProcessor: WorkflowProcessor = {
  stepKey: "wait_human_review",
  async run(): Promise<ProcessorResult> {
    return {
      output: { waitingFor: "teacher_evidence_review" }
    };
  }
};

export const generateReportProcessor: WorkflowProcessor = {
  stepKey: "generate_report",
  async run(): Promise<ProcessorResult> {
    throw new Error("generate_report processor not implemented: 只能使用 accepted 或 edited_and_accepted 证据");
  }
};

export const exportReportProcessor: WorkflowProcessor = {
  stepKey: "export_report",
  async run(): Promise<ProcessorResult> {
    throw new Error("export_report processor not implemented: 需要报告导出对象存储通道");
  }
};
