export function assertEvidenceHasSource(evidence: { sources?: unknown[] }) {
  if (!evidence.sources?.length) {
    return { valid: false, reason: "证据缺少来源，不能进入报告" };
  }
  return { valid: true };
}
