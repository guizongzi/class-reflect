import { loadAppConfig } from "@class-reflect/config";
import { createLogger } from "@class-reflect/observability";
import { createServer, type IncomingMessage } from "node:http";
import { runLessonWorkflowById, runLessonWorkflowOnce } from "./workflows/lesson-workflow";

const logger = createLogger("worker");

async function main() {
  const config = loadAppConfig();
  const once = process.argv.includes("--once") || process.env.WORKER_ONCE === "true";
  const baseWorkerId = process.env.WORKER_ID || `worker-${process.pid}`;
  const mode = once ? "poll" : process.env.WORKER_MODE || "http";
  logger.info("worker started", { mode, asrProvider: config.asrProvider });

  if (mode === "poll") {
    const concurrency = parseWorkerConcurrency(process.env.WORKER_CONCURRENCY);
    const pollIntervalMs = parseWorkerPollInterval(process.env.WORKER_POLL_INTERVAL_MS);

    do {
      const results = await Promise.all(
        Array.from({ length: concurrency }, (_, index) => runLessonWorkflowOnce(`${baseWorkerId}-${index + 1}`))
      );
      const claimedCount = results.filter((result) => result.claimed).length;
      if (!claimedCount) {
        logger.info("no queued workflow");
        if (once) break;
        await sleep(pollIntervalMs);
      }
    } while (!once);
    return;
  }

  await startHttpServer(baseWorkerId);
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

async function startHttpServer(baseWorkerId: string) {
  const port = Number(process.env.PORT || 8080);
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, service: "class-reflect-worker" }));
        return;
      }

      if (request.method !== "POST" || request.url !== "/api/workflows/process") {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: false, error: "not_found" }));
        return;
      }

      const body = await readJsonBody(request);
      const workflowRunId = typeof body.workflowRunId === "string" ? body.workflowRunId : "";
      if (!workflowRunId) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: false, error: "workflowRunId is required" }));
        return;
      }

      const result = await runLessonWorkflowById({ workflowRunId, workerId: baseWorkerId });
      if (!result.processed) {
        if (result.reason === "completed" || result.reason === "cancelled") {
          response.writeHead(204);
          response.end();
          return;
        }
        if (result.reason === "already_running") {
          response.writeHead(409, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: result.reason }));
          return;
        }
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: false, error: result.reason || "not_found" }));
        return;
      }

      response.writeHead(204);
      response.end();
    } catch (error) {
      logger.error("workflow request failed", { error: error instanceof Error ? error.message : String(error) });
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "workflow_failed" }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, "0.0.0.0", () => resolve());
  });
  logger.info("worker http server listening", { port });
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

main().catch((error) => {
  logger.error("worker failed", {
    error: error instanceof Error
      ? error.message
      : String(error)
  });

  process.exitCode = 1;
});
