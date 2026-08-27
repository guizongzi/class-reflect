import assert from "node:assert/strict";
import test from "node:test";
import { transcriptNormalizerEvalFixtures } from "./fixtures";
import { validateTranscriptNormalizerPatchOutput } from "./patch-validator";
import type { TranscriptNormalizerPatchOutput } from "./types";

const fixture = transcriptNormalizerEvalFixtures.find((item) => item.id === "teacher_explanation");
if (!fixture) throw new Error("teacher_explanation fixture missing");

test("strict patch validator accepts a grounded minimal patch", () => {
  const output: TranscriptNormalizerPatchOutput = {
    patches: [{
      sentenceId: fixture.input[0].id,
      correctedText: "同学们，我们今天学习分数的意义。",
      confidence: 0.92,
      changeTypes: ["punctuation"],
      needsHumanReview: false
    }],
    warnings: []
  };

  assert.deepEqual(validateTranscriptNormalizerPatchOutput(output, fixture).valid, true);
});

test("strict patch validator rejects unsafe and malformed outputs", () => {
  const unsafeOutputs: Array<[string, unknown]> = [
    ["unknown id", patch({ sentenceId: "missing" })],
    ["duplicate id", { patches: [patch(), patch()], warnings: [] }],
    ["missing id", { patches: [{ confidence: 0.8, changeTypes: ["punctuation"], needsHumanReview: false }], warnings: [] }],
    ["timestamp mutation", { patches: [{ ...patch(), startMs: 10 }], warnings: [] }],
    ["empty correctedText", patch({ correctedText: "" })],
    ["confidence out of range", patch({ confidence: 1.2 })],
    ["illegal changeTypes", patch({ changeTypes: ["semantic_repair"] })],
    ["illegal speaker role", patch({ speakerRole: "parent" })],
    ["illegal identity", patch({ speakerIdentityId: "not in registry" })],
    ["ungrounded expansion", patch({ correctedText: "同学们，我们今天学习分数的意义，并且掌握所有考试技巧。" })],
    ["student answer correction", patchForStudentWrongAnswer()],
    ["missing section sentence", { patches: [], sectionBoundarySuggestions: [{ beforeSentenceId: "missing", activityType: "practice", topicKeywords: ["练习"], confidence: 0.8 }], warnings: [] }],
    ["too many patches", { patches: [patch(), patch({ sentenceId: fixture.input[0].id })], warnings: [] }],
    ["unallowed field", patch({ debugExplanation: "because I said so" })]
  ];

  for (const [name, output] of unsafeOutputs) {
    const result = validateTranscriptNormalizerPatchOutput(output, fixture);
    assert.equal(result.valid, false, `${name} should be rejected`);
  }
});

function patch(overrides: Record<string, unknown> = {}) {
  return {
    patches: [{
      sentenceId: fixture!.input[0].id,
      correctedText: "同学们，我们今天学习分数的意义。",
      confidence: 0.9,
      changeTypes: ["punctuation"],
      needsHumanReview: false,
      ...overrides
    }],
    warnings: []
  };
}

function patchForStudentWrongAnswer() {
  const studentFixture = transcriptNormalizerEvalFixtures.find((item) => item.id === "student_wrong_answer");
  if (!studentFixture) throw new Error("student_wrong_answer fixture missing");
  return {
    patches: [{
      sentenceId: studentFixture.input[0].id,
      correctedText: "二氧化碳的化学式是 CO2。",
      confidence: 0.95,
      changeTypes: ["term_correction"],
      needsHumanReview: false
    }],
    warnings: []
  };
}
