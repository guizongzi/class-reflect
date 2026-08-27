import assert from "node:assert/strict";
import test from "node:test";
import { transcriptNormalizerEvalFixtures } from "./fixtures";

test("Agent 1 eval fixtures cover required baseline scenarios", () => {
  const requiredIds = [
    "teacher_explanation",
    "filler_words",
    "immediate_repetition",
    "teacher_self_correction",
    "asr_term_error",
    "math_science_terms",
    "student_wrong_answer",
    "teacher_student_qa",
    "same_student_continuous",
    "multiple_students",
    "choral_response",
    "overlapping_speech",
    "unknown_speaker",
    "low_confidence",
    "section_transition",
    "multi_sentence_segment",
    "split_sentence_segments",
    "invalid_llm_output"
  ];

  assert.deepEqual(transcriptNormalizerEvalFixtures.map((fixture) => fixture.id), requiredIds);
  for (const fixture of transcriptNormalizerEvalFixtures) {
    assert.ok(fixture.input.length > 0, `${fixture.id} should include input segments or sentences`);
    assert.ok(Array.isArray(fixture.mustChange), `${fixture.id} should declare required changes`);
    assert.ok(Array.isArray(fixture.mustNotChange), `${fixture.id} should declare forbidden changes`);
    assert.ok(fixture.expectedDeliveryFeatures, `${fixture.id} should declare expected delivery features`);
    assert.equal(typeof fixture.needsHumanReview, "boolean", `${fixture.id} should declare human review expectation`);
    assert.equal(typeof fixture.shouldSuggestSectionBoundary, "boolean", `${fixture.id} should declare section boundary expectation`);
  }
});
