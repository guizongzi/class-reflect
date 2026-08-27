import { runTranscriptNormalizerMockEval, runTranscriptNormalizerRealEval } from "./runner";

async function main() {
  const mode = process.argv.includes("--real") ? "real" : "mock";
  const writeReports = !process.argv.includes("--no-write");
  const report = mode === "real"
    ? await runTranscriptNormalizerRealEval({ writeReports })
    : await runTranscriptNormalizerMockEval({ writeReports });
  process.stdout.write(`${JSON.stringify({
    mode: report.mode,
    fixtures: report.fixtures,
    metrics: report.metrics,
    reportPaths: report.reportPaths
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
