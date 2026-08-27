import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDiagnosticFailure,
  containsExtraTextAroundJson,
  containsMarkdownCodeFence,
  evaluateDiagnosticBusinessRules,
  getRealDiagnosticFixtures,
  summarizeRawModelOutput
} from "./real-diagnostic";

test("real diagnostic fixture set is limited to the agreed five samples", () => {
  assert.deepEqual(getRealDiagnosticFixtures().map((fixture) => fixture.id), [
    "teacher_explanation",
    "asr_term_error",
    "student_wrong_answer",
    "unknown_speaker",
    "section_transition"
  ]);
});

test("real diagnostic detects markdown fences and extra prose around JSON", () => {
  assert.equal(containsMarkdownCodeFence("```json\n{\"patches\":[],\"warnings\":[]}\n```"), true);
  assert.equal(containsExtraTextAroundJson("Sure:\n{\"patches\":[],\"warnings\":[]}\n谢谢"), true);
  assert.equal(containsExtraTextAroundJson("{\"patches\":[],\"warnings\":[]}"), false);
});

test("real diagnostic summarizes raw model output without keeping full text", () => {
  const summary = summarizeRawModelOutput("```json\n{\"patches\":[{\"sentenceId\":\"sent-a\",\"correctedText\":\"测试文本\"}],\"warnings\":[]}\n```");
  assert.equal(summary.hasMarkdownCodeFence, true);
  assert.equal(summary.includesJsonObject, true);
  assert.ok(summary.length > 0);
  assert.ok(summary.preview.length <= 240);
  assert.equal(summary.preview.includes("测试文本"), false);
});

test("real diagnostic maps validator errors to failure classes", () => {
  assert.equal(classifyDiagnosticFailure({ schemaErrors: ["patch_field_not_allowed:debug"], businessErrors: [] }), "UNKNOWN_FIELD");
  assert.equal(classifyDiagnosticFailure({ schemaErrors: ["illegal_change_type"], businessErrors: [] }), "INVALID_ENUM");
  assert.equal(classifyDiagnosticFailure({ schemaErrors: ["unknown_sentence_id"], businessErrors: [] }), "UNKNOWN_SENTENCE_ID");
  assert.equal(classifyDiagnosticFailure({ schemaErrors: ["student_answer_correction_not_allowed"], businessErrors: [] }), "STUDENT_ANSWER_PROTECTION");
  assert.equal(classifyDiagnosticFailure({ schemaErrors: [], businessErrors: ["section_boundary_missing"] }), "SECTION_REFERENCE_ERROR");
});

test("real diagnostic business rules catch missing required fixture behavior", () => {
  const fixture = getRealDiagnosticFixtures().find((item) => item.id === "teacher_explanation");
  assert.ok(fixture);
  const result = evaluateDiagnosticBusinessRules({ patches: [], warnings: [] }, fixture);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("required_change_missing"));
});
