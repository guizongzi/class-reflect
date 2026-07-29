import { loadAppConfig } from "@class-reflect/config";
import { createLogger } from "@class-reflect/observability";
import { runLessonWorkflowOnce } from "./workflows/lesson-workflow";

const logger = createLogger("worker");

async function main() {
  const config = loadAppConfig();
  const once = process.argv.includes("--once") || process.env.WORKER_ONCE === "true";
  logger.info("worker started", { once, asrProvider: config.asrProvider });

  do {
    const result = await runLessonWorkflowOnce();
    if (!result.claimed) {
      logger.info("no queued workflow");
      break;
    }
  } while (!once);
}

main().catch((error) => {
  logger.error("worker failed", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
