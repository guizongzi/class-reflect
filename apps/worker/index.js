import { assertRuntimeConfig } from "../api/config.js";
import { claimNextWorkflowRun, processWorkflowRun } from "../api/processor.js";
import { closeDb } from "../api/db.js";

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
    await processWorkflowRun(run.id);
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
