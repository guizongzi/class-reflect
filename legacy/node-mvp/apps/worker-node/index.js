import { assertRuntimeConfig } from "../api/config.js";
import { claimNextWorkflowRun, executeWorkflowRun } from "../api/src/application/agent-orchestrator.js";
import { closeDb } from "../api/src/integrations/supabase/postgres.js";

assertRuntimeConfig();

const workerId = process.env.WORKER_ID || `class-reflect-worker-${process.pid}`;
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
const once = process.argv.includes("--once") || process.env.WORKER_ONCE === "true";

console.log(`class-reflect worker started: ${workerId}`);

try {
  do {
    const run = await claimNextWorkflowRun({ workerId });
    if (!run) {
      if (once) {
        console.log("no queued workflow run");
        break;
      }
      await sleep(pollIntervalMs);
      continue;
    }

    console.log(`processing workflow run ${run.id}`);
    await executeWorkflowRun(run.id, { workflow: run });
    console.log(`completed workflow run ${run.id}`);
  } while (!once);
} finally {
  await closeDb();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
