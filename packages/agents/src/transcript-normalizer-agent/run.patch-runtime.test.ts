import assert from "node:assert/strict";
import test from "node:test";
import { runTranscriptNormalizer } from "./run";
import { buildTranscriptNormalizerPatchInput, buildTranscriptNormalizerWindows } from "./patch-input";
import { transcriptNormalizerPatchInstruction } from "./prompt";
import { validateAndAdaptTranscriptNormalizerIndexedOutput } from "./validator";

const sampleSegments = [
  {
    id: "seg-1",
    startMs: 1000,
    endMs: 2400,
    speakerLabel: "说话人 A",
    text: "同学们我们今天学习分数的意义",
    confidence: 0.9
  },
  {
    id: "seg-2",
    startMs: 2500,
    endMs: 3600,
    speakerLabel: "说话人 B",
    text: "二氧化碳的化学式是 CO3。",
    confidence: 0.84
  }
];

test("runTranscriptNormalizer asks the LLM for patch-only output and adapts valid patches to the legacy worker output", async () => {
  const calls: unknown[] = [];
  await withMockLlm(async () => {
    globalThis.fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          patches: [{
            i: 0,
            correctedText: "同学们，我们今天学习分数的意义。",
            confidence: 0.93,
            changeTypes: ["punctuation"],
            needsHumanReview: false
          }],
          warnings: []
        }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
      }), { status: 200 });
    };

    const result = await runTranscriptNormalizer(sampleSegments, { traceId: "patch-runtime-test" });

    assert.equal(result.promptVersion, "transcript-agent.patch-index.v2");
    assert.equal(result.output.normalizedSegments.length, 2);
    assert.equal(result.output.normalizedSegments[0].text, "同学们，我们今天学习分数的意义。");
    assert.equal(result.output.normalizedSegments[0].startMs, 1000);
    assert.equal(result.output.normalizedSegments[0].endMs, 2400);
    assert.equal(result.output.normalizedSegments[1].text, "二氧化碳的化学式是 CO3。");
    assert.equal(result.output.analysisProjection.sentenceCount, 2);

    const body = calls[0] as { messages: Array<{ role: string; content: string }> };
    const userPayload = JSON.parse(body.messages.find((message) => message.role === "user")?.content || "{}");
    assert.ok(Array.isArray(userPayload.sentences));
    assert.equal(userPayload.segments, undefined);
    assert.equal(userPayload.instruction, undefined);
    assert.equal(userPayload.sentenceCount, undefined);
    assert.equal(userPayload.windowId, undefined);
    assert.equal(userPayload.writableSentenceIds, undefined);
    assert.equal(userPayload.displaySections, undefined);
    assert.equal(userPayload.analysisProjection, undefined);
    assert.equal(userPayload.firstSentenceId, "seg-1");
    assert.deepEqual(userPayload.speakerRegistry, { A: "teacher", B: "student", C: "unknown" });
    assert.deepEqual(userPayload.sentences[0], ["w", "C", 0.9, "同学们我们今天学习分数的意义"]);
    assert.equal(JSON.stringify(userPayload.sentences).includes("sentenceId"), false);
    assert.equal(JSON.stringify(userPayload.sentences).includes("sequenceIndex"), false);
    assert.equal(body.messages.find((message) => message.role === "system")?.content.includes("sectionBoundarySuggestions"), false);
  });
});

test("runTranscriptNormalizer rejects an out-of-range patch index and falls back for the whole window", async () => {
  await withMockLlm(async () => {
    globalThis.fetch = async () => llmResponse({
      patches: [{
        i: 2,
        correctedText: "越界文本",
        confidence: 0.9,
        changeTypes: ["asr_correction"],
        needsHumanReview: false
      }],
      warnings: []
    });

    const result = await runTranscriptNormalizer(sampleSegments);

    assert.equal(result.promptVersion, "transcript-agent.rule-based.v0.1");
    assert.notEqual(result.output.normalizedSegments[0].text, "越界文本");
  });
});

test("runTranscriptNormalizer rejects duplicate patch indexes and applies no partial changes", async () => {
  await withMockLlm(async () => {
    globalThis.fetch = async () => llmResponse({
      patches: [
        {
          i: 0,
          correctedText: "第一种修改。",
          confidence: 0.9,
          changeTypes: ["punctuation"],
          needsHumanReview: false
        },
        {
          i: 0,
          correctedText: "第二种修改。",
          confidence: 0.9,
          changeTypes: ["punctuation"],
          needsHumanReview: false
        }
      ],
      warnings: []
    });

    const result = await runTranscriptNormalizer(sampleSegments);

    assert.equal(result.promptVersion, "transcript-agent.rule-based.v0.1");
    assert.notEqual(result.output.normalizedSegments[0].text, "第一种修改。");
    assert.notEqual(result.output.normalizedSegments[0].text, "第二种修改。");
  });
});

test("indexed adapter rejects section boundary suggestions because Agent 1 no longer owns sectioning", () => {
  const window = buildTranscriptNormalizerWindows(sampleSegments)[0];
  const result = validateAndAdaptTranscriptNormalizerIndexedOutput({
    patches: [],
    sectionBoundarySuggestions: [{
      beforeI: 1,
      activityType: "qa",
      topicKeywords: ["二氧化碳"],
      confidence: 0.8
    }],
    warnings: []
  }, window);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("output_field_not_allowed:sectionBoundarySuggestions"));
});

test("indexed adapter rejects patches targeting overlap-only context", () => {
  const segments = Array.from({ length: 81 }, (_, index) => ({
    id: `seg-${index}`,
    startMs: index * 1000,
    endMs: index * 1000 + 800,
    speakerLabel: "教师",
    text: `第${index}句`,
    confidence: 0.9
  }));
  const firstWindow = buildTranscriptNormalizerWindows(segments)[0];
  const result = validateAndAdaptTranscriptNormalizerIndexedOutput({
    patches: [{
      i: 80,
      correctedText: "上下文不应被修改。",
      confidence: 0.9,
      changeTypes: ["punctuation"],
      needsHumanReview: false
    }],
    warnings: []
  }, firstWindow);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("patch_index_not_writable"));
  assert.equal(result.output, undefined);
});

test("indexed adapter drops no-op correctedText noise while preserving real patches", () => {
  const window = buildTranscriptNormalizerWindows([
    { ...sampleSegments[0], speakerRoleHint: "teacher" } as typeof sampleSegments[number],
    sampleSegments[1]
  ])[0];
  const result = validateAndAdaptTranscriptNormalizerIndexedOutput({
    patches: [
      {
        i: 0,
        correctedText: sampleSegments[0].text,
        speakerRole: "teacher",
        confidence: 0.95,
        changeTypes: ["punctuation"],
        needsHumanReview: false
      },
      {
        i: 1,
        confidence: 0.55,
        changeTypes: ["ambiguity"],
        needsHumanReview: true,
        reviewReasonCode: "student_answer"
      }
    ],
    warnings: []
  }, window);

  assert.equal(result.valid, true);
  assert.equal(result.output?.patches.length, 1);
  assert.equal(result.output?.patches[0].sentenceId, "seg-2");
  assert.equal(result.output?.patches[0].needsHumanReview, true);
});

test("indexed adapter drops ungrounded expansion noise instead of accepting hallucinated rewrites", () => {
  const window = buildTranscriptNormalizerWindows(sampleSegments)[0];
  const result = validateAndAdaptTranscriptNormalizerIndexedOutput({
    patches: [
      {
        i: 0,
        correctedText: "同学们，我们今天学习分数的意义，并且掌握所有考试技巧。",
        confidence: 0.9,
        changeTypes: ["readability"],
        needsHumanReview: false
      },
      {
        i: 1,
        confidence: 0.55,
        changeTypes: ["ambiguity"],
        needsHumanReview: true,
        reviewReasonCode: "student_answer"
      }
    ],
    warnings: []
  }, window);

  assert.equal(result.valid, true);
  assert.equal(result.output?.patches.length, 1);
  assert.equal(result.output?.patches[0].sentenceId, "seg-2");
});

test("transcript normalizer window input keeps static overhead bounded for classroom-sized windows", () => {
  const text = "同学们我们今天学习分数的意义";
  const segments = Array.from({ length: 50 }, (_, index) => ({
    id: `seg-${index}`,
    startMs: index * 3000,
    endMs: index * 3000 + 2000,
    speakerLabel: "说话人 A",
    text,
    confidence: 0.9
  }));
  const payload = buildTranscriptNormalizerPatchInput(buildTranscriptNormalizerWindows(segments)[0]);
  const payloadChars = [...JSON.stringify(payload)].length;
  const rawTextChars = segments.reduce((sum, segment) => sum + [...segment.text].length, 0);

  assert.equal("instruction" in payload, false);
  assert.equal("sentenceCount" in payload, false);
  assert.ok([...transcriptNormalizerPatchInstruction].length < 1500);
  assert.ok(payloadChars < rawTextChars * 4, `payload chars ${payloadChars} should stay under 4x raw text chars ${rawTextChars}`);
});

test("runTranscriptNormalizer rejects legacy full-output LLM responses and keeps deterministic fallback", async () => {
  await withMockLlm(async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        normalizedSegments: [{
          id: "seg-1",
          startMs: 0,
          endMs: 1,
          text: "bad",
          speakerLabel: "教师",
          confidence: 1
        }],
        displaySections: [],
        analysisProjection: { sentenceCount: 1, teacherSentenceCount: 1, studentSentenceCount: 0, lowConfidenceSentenceCount: 0, flags: [] }
      }) } }]
    }), { status: 200 });

    const result = await runTranscriptNormalizer(sampleSegments, { traceId: "full-output-reject-test" });

    assert.equal(result.promptVersion, "transcript-agent.rule-based.v0.1");
    assert.equal(result.output.normalizedSegments.length, 2);
    assert.notEqual(result.output.normalizedSegments[0].text, "bad");
  });
});

async function withMockLlm(run: () => Promise<void>) {
  const previousBaseUrl = process.env.LLM_BASE_URL;
  const previousApiKey = process.env.LLM_API_KEY;
  const previousModel = process.env.LLM_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.LLM_BASE_URL = "https://llm.example.test";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "test-model";
  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("LLM_BASE_URL", previousBaseUrl);
    restoreEnv("LLM_API_KEY", previousApiKey);
    restoreEnv("LLM_MODEL", previousModel);
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === "undefined") delete process.env[name];
  else process.env[name] = value;
}

function llmResponse(output: unknown) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(output) } }],
    usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
  }), { status: 200 });
}
