import assert from "node:assert/strict";
import test from "node:test";
import { listAgentModules, runRegisteredAgent } from "./agent-registry";

test("each agent is discoverable and workflow-agent can run independently", async () => {
  assert.deepEqual(listAgentModules().map((agent) => agent.name), [
    "teaching-evidence-agent",
    "transcript-normalizer-agent",
    "workflow-agent"
  ]);

  const result = await runRegisteredAgent({
    agentName: "workflow-agent",
    input: {
      lessonId: "lesson-1",
      hasUploadedVideo: false,
      hasUploadedAudio: false,
      steps: []
    },
    traceId: "standalone-test"
  });

  assert.equal((result.output as { action: string }).action, "wait_for_upload");
});
