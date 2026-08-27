import { runTranscriptNormalizerRealDiagnostic } from "./real-diagnostic";

async function main() {
  const writeReports = !process.argv.includes("--no-write");
  const report = await runTranscriptNormalizerRealDiagnostic({ writeReports });
  process.stdout.write(`${JSON.stringify({
    mode: report.mode,
    model: report.model,
    promptVersion: report.promptVersion,
    summary: report.summary,
    reportPaths: report.reportPaths
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
