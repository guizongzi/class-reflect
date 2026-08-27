import assert from "node:assert/strict";
import test from "node:test";
import { runTranscriptNormalizerMockEval } from "./runner";

test("mock eval produces machine-readable metrics and report paths without paid API", async () => {
  const report = await runTranscriptNormalizerMockEval({ writeReports: false });

  assert.equal(report.mode, "mock");
  assert.equal(report.fixtures.total, 18);
  assert.ok(report.metrics.schemaPassRate >= 0);
  assert.ok(report.metrics.businessValidationPassRate >= 0);
  assert.ok(report.metrics.forbiddenModificationRate >= 0);
  assert.ok(report.metrics.totalTokenEstimate >= 0);
  assert.ok(report.metrics.latencyMs.p50 >= 0);
  assert.ok(report.baseline.currentImplementation);
  assert.ok(report.limitations.length > 0);
});
