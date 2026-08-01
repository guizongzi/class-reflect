import assert from "node:assert/strict";
import test from "node:test";
import { callAgent } from "./agent-client";

test("callAgent preserves raw output and records failed schema validation without changing it", async () => {
  const previousBaseUrl = process.env.LLM_BASE_URL;
  const previousApiKey = process.env.LLM_API_KEY;
  const previousModel = process.env.LLM_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.LLM_BASE_URL = "https://llm.example.test";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "test-model";
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"unexpected":true}' } }],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
  }), { status: 200 });

  try {
    const result = await callAgent<{ expected: string }>({
      agentName: "test-agent",
      promptVersion: "test.v1",
      input: { text: "test" },
      traceId: "trace-test",
      validate: (value): value is { expected: string } => Boolean(value && typeof value === "object" && "expected" in value)
    });

    assert.equal(result.rawOutput, '{"unexpected":true}');
    assert.deepEqual(result.parsedOutput, { unexpected: true });
    assert.deepEqual(result.validationResult, { valid: false, errors: ["schema validation returned false"] });
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("LLM_BASE_URL", previousBaseUrl);
    restoreEnv("LLM_API_KEY", previousApiKey);
    restoreEnv("LLM_MODEL", previousModel);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === "undefined") delete process.env[name];
  else process.env[name] = value;
}
