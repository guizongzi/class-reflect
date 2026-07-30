import { loadAppConfig } from "@class-reflect/config";
import { createLogger } from "@class-reflect/observability";
import { runLessonWorkflowOnce } from "./workflows/lesson-workflow";

const logger = createLogger("worker");

async function main() {
  const config = loadAppConfig();

  // drain=true：持续处理，直到队列为空后退出
  const drain =
    process.argv.includes("--drain") ||
    process.env.WORKER_DRAIN === "true";

  const concurrency = parseWorkerConcurrency(
    process.env.WORKER_CONCURRENCY
  );

  const pollIntervalMs = parseWorkerPollInterval(
    process.env.WORKER_POLL_INTERVAL_MS
  );

  const baseWorkerId =
    process.env.WORKER_ID || `worker-${process.pid}`;

  logger.info("worker started", {
    drain,
    concurrency,
    pollIntervalMs,
    asrProvider: config.asrProvider
  });

  while (true) {
    const results = await Promise.all(
      Array.from({ length: concurrency }, (_, index) =>
        runLessonWorkflowOnce(`${baseWorkerId}-${index + 1}`)
      )
    );

    const claimedCount = results.filter(
      (result) => result.claimed
    ).length;

    logger.info("worker batch completed", {
      claimedCount,
      concurrency
    });

    if (claimedCount === 0) {
      logger.info("workflow queue drained");

      if (drain) {
        break;
      }

      await sleep(pollIntervalMs);
    }
  }
}

function parseWorkerConcurrency(value: string | undefined) {
  const parsed = Number(value || 1);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(8, Math.floor(parsed)));
}

function parseWorkerPollInterval(value: string | undefined) {
  const parsed = Number(value || 3000);

  if (!Number.isFinite(parsed)) {
    return 3000;
  }

  return Math.max(500, Math.min(60_000, Math.floor(parsed)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  logger.error("worker failed", {
    error: error instanceof Error
      ? error.message
      : String(error)
  });

  process.exitCode = 1;
});
