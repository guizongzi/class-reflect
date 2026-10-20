import assert from "node:assert/strict";
import test from "node:test";
import { buildSentenceIdMap, restoreMappedSentenceIds } from "./sentence-id-map";

test("sentence id map assigns short ids and restores real ids", () => {
  const mapper = buildSentenceIdMap([
    { id: "uuid-a" },
    { id: "uuid-b" }
  ]);

  assert.equal(mapper.toShortId("uuid-a"), "s0");
  assert.equal(mapper.toShortId("uuid-b"), "s1");
  assert.equal(mapper.toRealId("s1"), "uuid-b");
  assert.deepEqual(restoreMappedSentenceIds(["s0", "s1"], mapper), ["uuid-a", "uuid-b"]);
});

test("sentence id map leaves unknown ids unchanged for guardrails to reject later", () => {
  const mapper = buildSentenceIdMap([{ id: "uuid-a" }]);

  assert.equal(mapper.toRealId("missing"), "missing");
  assert.deepEqual(restoreMappedSentenceIds(["s0", "missing"], mapper), ["uuid-a", "missing"]);
});
