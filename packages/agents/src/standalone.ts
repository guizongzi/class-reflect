/// <reference types="node" />

import { readFile } from "node:fs/promises";
import { runRegisteredAgent, type RegisteredAgentName } from "./agent-registry";

export async function runAgentStandalone(agentName: RegisteredAgentName, input: unknown, traceId?: string) {
  return runRegisteredAgent({ agentName, input, traceId });
}

async function main() {
  const [agentName, inputFile] = process.argv.slice(2);
  if (!isRegisteredAgentName(agentName)) {
    throw new Error("usage: agent:run <teaching-evidence-agent|transcript-normalizer-agent|workflow-agent> [input.json]");
  }
  const rawInput = inputFile ? await readFile(inputFile, "utf8") : await readStdin();
  const output = await runAgentStandalone(agentName, JSON.parse(rawInput));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function isRegisteredAgentName(value: string | undefined): value is RegisteredAgentName {
  return value === "teaching-evidence-agent"
    || value === "transcript-normalizer-agent"
    || value === "workflow-agent";
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
