/// <reference types="node" />

import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { readAgentLlmConfig, trimSlash } from "../../llm/config";
import { parseJsonObject } from "../../llm/json";
import { buildTranscriptNormalizerPatchInput, buildTranscriptNormalizerWindows } from "../patch-input";
import { transcriptNormalizerPatchInstruction } from "../prompt";
import { transcriptNormalizerPatchPromptVersion } from "../schema";
import { validateAndAdaptTranscriptNormalizerIndexedOutput } from "../validator";
import { transcriptNormalizerEvalFixtures } from "./fixtures";
import { validateTranscriptNormalizerPatchOutput } from "./patch-validator";
import type { TranscriptNormalizerEvalFixture, TranscriptNormalizerPatchOutput } from "./types";

export type DiagnosticFailureClass =
  | "PROVIDER_ERROR"
  | "EMPTY_RESPONSE"
  | "JSON_PARSE_ERROR"
  | "MARKDOWN_WRAPPED_JSON"
  | "EXTRA_TEXT_AROUND_JSON"
  | "SCHEMA_FIELD_MISMATCH"
  | "UNKNOWN_FIELD"
  | "INVALID_ENUM"
  | "INVALID_CONFIDENCE"
  | "UNKNOWN_SENTENCE_ID"
  | "DUPLICATE_PATCH"
  | "BUSINESS_RULE_REJECTION"
  | "CONTENT_EXPANSION"
  | "STUDENT_ANSWER_PROTECTION"
  | "SECTION_REFERENCE_ERROR"
  | "UNKNOWN_FAILURE";

type ProviderStatus = {
  ok: boolean;
  status: number | null;
  statusText: string | null;
};

type TokenUsage = {
  input: number;
  output: number;
  total: number;
};

export type DiagnosticFixtureResult = {
  fixtureId: string;
  model: string;
  promptVersion: string;
  promptAudit: {
    systemPromptChars: number;
    compactPayloadChars: number;
    compactInputTokenEstimate: number;
    legacyPayloadChars: number;
    legacyInputTokenEstimate: number;
    estimatedTokenSavingsRate: number;
    thinkingDisabled: boolean;
  };
  providerStatus: ProviderStatus;
  rawResponseSummary: ReturnType<typeof summarizeRawModelOutput>;
  parsedOutput: unknown;
  schemaValidationErrors: string[];
  businessValidationErrors: string[];
  failureClass: DiagnosticFailureClass | null;
  fallbackReason: string | null;
  latencyMs: number;
  tokenUsage: TokenUsage;
  hasMarkdownCodeFence: boolean;
  hasExtraTextAroundJson: boolean;
  isFormatIssue: boolean;
  isQualityIssue: boolean;
  canUseSafeCompatibility: boolean;
  mustModifyPrompt: boolean;
  mustKeepRejected: boolean;
};

export type RealDiagnosticReport = {
  generatedAt: string;
  mode: "real-diagnostic";
  model: string;
  promptVersion: string;
  temperature: number;
  maxTokens: number;
  fixtureIds: string[];
  results: DiagnosticFixtureResult[];
  summary: {
    total: number;
    accepted: number;
    rejected: number;
    byFailureClass: Record<string, number>;
  };
  reportPaths?: {
    json?: string;
    markdown?: string;
    csv?: string;
  };
};

const diagnosticFixtureIds = [
  "teacher_explanation",
  "asr_term_error",
  "student_wrong_answer",
  "unknown_speaker",
  "section_transition"
];

function readDiagnosticLimit() {
  const value = Number(process.env.REAL_AGENT_EVAL_LIMIT || diagnosticFixtureIds.length);
  if (!Number.isFinite(value) || value <= 0) return diagnosticFixtureIds.length;
  return Math.min(Math.floor(value), transcriptNormalizerEvalFixtures.length);
}

export function getRealDiagnosticFixtures() {
  const limit = readDiagnosticLimit();
  if (limit <= diagnosticFixtureIds.length) return getAgreedFiveDiagnosticFixtures().slice(0, limit);
  return transcriptNormalizerEvalFixtures.slice(0, limit);
}

export function getAgreedFiveDiagnosticFixtures() {
  return diagnosticFixtureIds.map((id) => {
    const fixture = transcriptNormalizerEvalFixtures.find((item) => item.id === id);
    if (!fixture) throw new Error(`Missing diagnostic fixture: ${id}`);
    return fixture;
  });
}

export async function runTranscriptNormalizerRealDiagnostic(options: { writeReports?: boolean; outputDir?: string } = {}): Promise<RealDiagnosticReport> {
  if (process.env.RUN_REAL_AGENT_EVAL !== "true") {
    throw new Error("RUN_REAL_AGENT_EVAL=true is required for real provider diagnostics");
  }
  const config = readAgentLlmConfig();
  if (!config) throw new Error("LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL are required for real provider diagnostics");

  const maxTokens = Number(process.env.REAL_AGENT_DIAGNOSTIC_MAX_TOKENS || 1200);
  const temperature = 0;
  const results: DiagnosticFixtureResult[] = [];

  for (const fixture of getRealDiagnosticFixtures()) {
    results.push(await diagnoseFixture(fixture, {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      maxTokens,
      temperature
    }));
  }

  const report: RealDiagnosticReport = {
    generatedAt: new Date().toISOString(),
    mode: "real-diagnostic",
    model: config.model,
    promptVersion: transcriptNormalizerPatchPromptVersion,
    temperature,
    maxTokens,
    fixtureIds: results.map((result) => result.fixtureId),
    results,
    summary: summarizeDiagnosticResults(results)
  };

  if (options.writeReports) report.reportPaths = await writeDiagnosticReports(report, options.outputDir || path.resolve(process.cwd(), "eval-reports"));
  return report;
}

async function diagnoseFixture(
  fixture: TranscriptNormalizerEvalFixture,
  config: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number }
): Promise<DiagnosticFixtureResult> {
  const startedAt = Date.now();
  const window = buildTranscriptNormalizerWindows(fixture.input)[0];
  const payload = buildTranscriptNormalizerPatchInput(window);
  const systemPrompt = `promptVersion=${transcriptNormalizerPatchPromptVersion}\n${transcriptNormalizerPatchInstruction}`;
  const promptAudit = buildPromptAudit(systemPrompt, payload, fixture.input);
  let providerStatus: ProviderStatus = { ok: false, status: null, statusText: null };
  let rawOutput = "";
  let parsedOutput: unknown = null;
  let schemaValidationErrors: string[] = [];
  let businessValidationErrors: string[] = [];
  let tokenUsage: TokenUsage = { input: 0, output: 0, total: 0 };
  let failureClass: DiagnosticFailureClass | null = null;
  let fallbackReason: string | null = null;

  try {
    const response = await fetch(`${trimSlash(config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        ...(promptAudit.thinkingDisabled ? { enable_thinking: false } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });
    providerStatus = { ok: response.ok, status: response.status, statusText: response.statusText };
    const responseText = await response.text();
    if (!response.ok) {
      rawOutput = responseText;
      failureClass = "PROVIDER_ERROR";
      fallbackReason = `provider_error:${response.status}`;
    } else {
      const responseBody = JSON.parse(responseText) as Record<string, any>;
      tokenUsage = normalizeTokenUsage(responseBody.usage);
      rawOutput = String(responseBody.choices?.[0]?.message?.content || "");
      if (!rawOutput.trim()) {
        failureClass = "EMPTY_RESPONSE";
        fallbackReason = "empty_response";
      } else {
        try {
          parsedOutput = parseJsonObject(rawOutput);
          const schemaValidation = validateAndAdaptTranscriptNormalizerIndexedOutput(parsedOutput, window);
          schemaValidationErrors = schemaValidation.errors;
          if (schemaValidation.valid && schemaValidation.output) {
            const adaptedOutput = schemaValidation.output as TranscriptNormalizerPatchOutput;
            const businessValidation = validateTranscriptNormalizerPatchOutput(adaptedOutput, fixture);
            const diagnosticBusinessValidation = businessValidation.valid
              ? evaluateDiagnosticBusinessRules(adaptedOutput, fixture)
              : { valid: false, errors: businessValidation.errors };
            businessValidationErrors = [...businessValidation.errors, ...diagnosticBusinessValidation.errors];
          }
          if (!schemaValidation.valid || businessValidationErrors.length) {
            failureClass = classifyDiagnosticFailure({
              schemaErrors: schemaValidationErrors,
              businessErrors: businessValidationErrors,
              rawOutput
            });
            fallbackReason = !schemaValidation.valid ? "schema_validation_failed" : "business_validation_failed";
          }
        } catch (error) {
          failureClass = classifyDiagnosticFailure({ parseError: error, rawOutput });
          fallbackReason = "json_parse_failed";
        }
      }
    }
  } catch (error) {
    failureClass = "PROVIDER_ERROR";
    fallbackReason = error instanceof Error ? `provider_exception:${error.message}` : "provider_exception";
  }

  const rawResponseSummary = summarizeRawModelOutput(rawOutput);
  const isFormatIssue = isFormatFailure(failureClass);
  const isQualityIssue = isQualityFailure(failureClass);
  return {
    fixtureId: fixture.id,
    model: config.model,
    promptVersion: transcriptNormalizerPatchPromptVersion,
    promptAudit,
    providerStatus,
    rawResponseSummary,
    parsedOutput,
    schemaValidationErrors,
    businessValidationErrors,
    failureClass,
    fallbackReason,
    latencyMs: Date.now() - startedAt,
    tokenUsage,
    hasMarkdownCodeFence: rawResponseSummary.hasMarkdownCodeFence,
    hasExtraTextAroundJson: rawResponseSummary.hasExtraTextAroundJson,
    isFormatIssue,
    isQualityIssue,
    canUseSafeCompatibility: Boolean(failureClass && ["MARKDOWN_WRAPPED_JSON", "EXTRA_TEXT_AROUND_JSON", "SCHEMA_FIELD_MISMATCH"].includes(failureClass)),
    mustModifyPrompt: Boolean(failureClass && ["MARKDOWN_WRAPPED_JSON", "EXTRA_TEXT_AROUND_JSON", "SCHEMA_FIELD_MISMATCH", "UNKNOWN_FIELD", "INVALID_ENUM"].includes(failureClass)),
    mustKeepRejected: Boolean(failureClass && ["UNKNOWN_SENTENCE_ID", "DUPLICATE_PATCH", "CONTENT_EXPANSION", "STUDENT_ANSWER_PROTECTION", "SECTION_REFERENCE_ERROR"].includes(failureClass))
  };
}

export function summarizeRawModelOutput(content: string) {
  return {
    length: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
    preview: redactRawPreview(content).slice(0, 240),
    hasMarkdownCodeFence: containsMarkdownCodeFence(content),
    hasExtraTextAroundJson: containsExtraTextAroundJson(content),
    includesJsonObject: /\{[\s\S]*\}/.test(content)
  };
}

export function containsMarkdownCodeFence(content: string) {
  return /```/.test(content);
}

export function containsExtraTextAroundJson(content: string) {
  const trimmed = content.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match || typeof match.index !== "number") return false;
  return Boolean(trimmed.slice(0, match.index).trim() || trimmed.slice(match.index + match[0].length).trim());
}

export function classifyDiagnosticFailure(input: {
  parseError?: unknown;
  schemaErrors?: string[];
  businessErrors?: string[];
  rawOutput?: string;
}): DiagnosticFailureClass {
  const schemaErrors = input.schemaErrors || [];
  const businessErrors = input.businessErrors || [];
  if (input.parseError) {
    if (input.rawOutput && containsMarkdownCodeFence(input.rawOutput)) return "MARKDOWN_WRAPPED_JSON";
    if (input.rawOutput && containsExtraTextAroundJson(input.rawOutput)) return "EXTRA_TEXT_AROUND_JSON";
    return "JSON_PARSE_ERROR";
  }
  if (schemaErrors.some((error) => error.includes("field_not_allowed"))) return "UNKNOWN_FIELD";
  if (schemaErrors.some((error) => error.includes("illegal_change_type") || error.includes("illegal_speaker_role") || error.includes("illegal_review_reason_code") || error.includes("illegal_activity_type"))) return "INVALID_ENUM";
  if (schemaErrors.some((error) => error.includes("confidence_out_of_range"))) return "INVALID_CONFIDENCE";
  if (schemaErrors.some((error) => error.includes("unknown_sentence_id") || error.includes("patch_index_out_of_range") || error.includes("patch_index_not_writable"))) return "UNKNOWN_SENTENCE_ID";
  if (schemaErrors.some((error) => error.includes("duplicate_sentence_id") || error.includes("duplicate_patch_index"))) return "DUPLICATE_PATCH";
  if (schemaErrors.some((error) => error.includes("ungrounded_expansion"))) return "CONTENT_EXPANSION";
  if (schemaErrors.some((error) => error.includes("student_answer_correction_not_allowed"))) return "STUDENT_ANSWER_PROTECTION";
  if (schemaErrors.some((error) => error.includes("section_references_unknown_sentence") || error.includes("section_index_")) || businessErrors.some((error) => error.includes("section_boundary"))) return "SECTION_REFERENCE_ERROR";
  if (schemaErrors.some((error) => error.includes("missing") || error.includes("not_array") || error.includes("not_object") || error.includes("invalid"))) return "SCHEMA_FIELD_MISMATCH";
  if (businessErrors.length) return "BUSINESS_RULE_REJECTION";
  if (input.rawOutput && containsMarkdownCodeFence(input.rawOutput)) return "MARKDOWN_WRAPPED_JSON";
  if (input.rawOutput && containsExtraTextAroundJson(input.rawOutput)) return "EXTRA_TEXT_AROUND_JSON";
  return "UNKNOWN_FAILURE";
}

export function evaluateDiagnosticBusinessRules(output: TranscriptNormalizerPatchOutput, fixture: TranscriptNormalizerEvalFixture) {
  const errors: string[] = [];
  const patchesById = new Map(output.patches.map((patch) => [patch.sentenceId, patch]));

  for (const expectation of fixture.mustChange) {
    const patch = patchesById.get(expectation.sentenceId);
    if (!patch) {
      errors.push("required_change_missing");
      continue;
    }
    const textOk = !expectation.textIncludes || expectation.textIncludes.every((token) => (patch.correctedText || "").includes(token));
    const changeTypeOk = !expectation.changeTypes || expectation.changeTypes.every((type) => patch.changeTypes.includes(type));
    if (!textOk || !changeTypeOk) errors.push("required_change_not_satisfied");
  }

  for (const expectation of fixture.mustNotChange) {
    const patch = patchesById.get(expectation.sentenceId);
    const correctedText = patch?.correctedText || "";
    if ((expectation.forbiddenTextIncludes || []).some((token) => correctedText.includes(token))) {
      errors.push("forbidden_modification_detected");
    }
  }

  if (fixture.needsHumanReview && !output.patches.some((patch) => patch.needsHumanReview)) {
    errors.push("human_review_missing");
  }
  if (fixture.shouldSuggestSectionBoundary && !output.sectionBoundarySuggestions?.length) {
    errors.push("section_boundary_missing");
  }

  return { valid: errors.length === 0, errors };
}

function normalizeTokenUsage(usage: unknown): TokenUsage {
  const candidate = usage && typeof usage === "object" ? usage as Record<string, unknown> : {};
  return {
    input: Number(candidate.prompt_tokens ?? candidate.input_tokens ?? 0),
    output: Number(candidate.completion_tokens ?? candidate.output_tokens ?? 0),
    total: Number(candidate.total_tokens ?? 0)
  };
}

function buildPromptAudit(systemPrompt: string, payload: unknown, legacyInput: unknown) {
  const compactPayload = JSON.stringify(payload);
  const legacyPayload = JSON.stringify({
    segments: legacyInput,
    windowId: "diagnostic-window",
    sentenceCount: Array.isArray(legacyInput) ? legacyInput.length : 0,
    writableSentenceIds: Array.isArray(legacyInput) ? legacyInput.map((item) => (item as { id?: string }).id).filter(Boolean) : []
  });
  const compactChars = [...systemPrompt, ...compactPayload].length;
  const legacyChars = [...systemPrompt, ...legacyPayload].length;
  return {
    systemPromptChars: [...systemPrompt].length,
    compactPayloadChars: [...compactPayload].length,
    compactInputTokenEstimate: estimateTokensByChars(compactChars),
    legacyPayloadChars: [...legacyPayload].length,
    legacyInputTokenEstimate: estimateTokensByChars(legacyChars),
    estimatedTokenSavingsRate: legacyChars ? Number(((legacyChars - compactChars) / legacyChars).toFixed(4)) : 0,
    thinkingDisabled: process.env.LLM_DISABLE_THINKING !== "false"
  };
}

function estimateTokensByChars(chars: number) {
  return Math.ceil(chars / 3);
}

function summarizeDiagnosticResults(results: DiagnosticFixtureResult[]) {
  const byFailureClass: Record<string, number> = {};
  for (const result of results) {
    const key = result.failureClass || "ACCEPTED";
    byFailureClass[key] = (byFailureClass[key] || 0) + 1;
  }
  return {
    total: results.length,
    accepted: results.filter((result) => !result.failureClass).length,
    rejected: results.filter((result) => result.failureClass).length,
    byFailureClass
  };
}

function redactRawPreview(content: string) {
  return content
    .replace(/"([^"\\]|\\.)*"/g, "\"<redacted>\"")
    .replace(/\s+/g, " ")
    .trim();
}

function isFormatFailure(value: DiagnosticFailureClass | null) {
  return Boolean(value && [
    "EMPTY_RESPONSE",
    "JSON_PARSE_ERROR",
    "MARKDOWN_WRAPPED_JSON",
    "EXTRA_TEXT_AROUND_JSON",
    "SCHEMA_FIELD_MISMATCH",
    "UNKNOWN_FIELD",
    "INVALID_ENUM",
    "INVALID_CONFIDENCE"
  ].includes(value));
}

function isQualityFailure(value: DiagnosticFailureClass | null) {
  return Boolean(value && [
    "UNKNOWN_SENTENCE_ID",
    "DUPLICATE_PATCH",
    "BUSINESS_RULE_REJECTION",
    "CONTENT_EXPANSION",
    "STUDENT_ANSWER_PROTECTION",
    "SECTION_REFERENCE_ERROR"
  ].includes(value));
}

async function writeDiagnosticReports(report: RealDiagnosticReport, outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const json = path.join(outputDir, "real-diagnostic.json");
  const markdown = path.join(outputDir, "real-diagnostic.md");
  const csv = path.join(outputDir, "real-diagnostic-review.csv");
  await writeFile(json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdown, renderDiagnosticMarkdown(report), "utf8");
  await writeFile(csv, renderDiagnosticCsv(report), "utf8");
  return { json, markdown, csv };
}

function renderDiagnosticMarkdown(report: RealDiagnosticReport) {
  const lines = [
    "# Agent 1 Real LLM Diagnostic",
    "",
    `Generated: ${report.generatedAt}`,
    `Model: ${report.model}`,
    `Prompt version: ${report.promptVersion}`,
    `Temperature: ${report.temperature}`,
    `Max tokens: ${report.maxTokens}`,
    "",
    "## Summary",
    "",
    `- Total fixtures: ${report.summary.total}`,
    `- Accepted: ${report.summary.accepted}`,
    `- Rejected: ${report.summary.rejected}`,
    `- Failure classes: ${JSON.stringify(report.summary.byFailureClass)}`,
    "",
    "## Fixture Results",
    ""
  ];

  for (const result of report.results) {
    lines.push(
      `### ${result.fixtureId}`,
      "",
      `- Failure class: ${result.failureClass || "ACCEPTED"}`,
      `- Provider status: ${result.providerStatus.status ?? "n/a"} ${result.providerStatus.statusText ?? ""}`.trim(),
      `- Latency ms: ${result.latencyMs}`,
      `- Token usage: ${JSON.stringify(result.tokenUsage)}`,
      `- Prompt audit: compactInput≈${result.promptAudit.compactInputTokenEstimate} tokens, legacyInput≈${result.promptAudit.legacyInputTokenEstimate} tokens, estimatedSavings=${result.promptAudit.estimatedTokenSavingsRate}`,
      `- Raw summary: length=${result.rawResponseSummary.length}, sha256=${result.rawResponseSummary.sha256}, preview=${result.rawResponseSummary.preview}`,
      `- Parsed output: ${JSON.stringify(result.parsedOutput)}`,
      `- Schema errors: ${result.schemaValidationErrors.length ? result.schemaValidationErrors.join(", ") : "none"}`,
      `- Business errors: ${result.businessValidationErrors.length ? result.businessValidationErrors.join(", ") : "none"}`,
      `- Format issue: ${result.isFormatIssue}`,
      `- Quality issue: ${result.isQualityIssue}`,
      `- Safe compatibility possible: ${result.canUseSafeCompatibility}`,
      `- Must modify prompt: ${result.mustModifyPrompt}`,
      `- Must keep rejected: ${result.mustKeepRejected}`,
      ""
    );
  }

  return lines.join("\n");
}

function renderDiagnosticCsv(report: RealDiagnosticReport) {
  const rows = [[
    "fixtureId",
    "failureClass",
    "schemaErrors",
    "businessErrors",
    "inputTokens",
    "outputTokens",
    "compactInputTokenEstimate",
    "legacyInputTokenEstimate",
    "estimatedTokenSavingsRate",
    "needsHumanReview",
    "manualReviewNotes"
  ]];
  for (const result of report.results) {
    rows.push([
      result.fixtureId,
      result.failureClass || "ACCEPTED",
      result.schemaValidationErrors.join(";"),
      result.businessValidationErrors.join(";"),
      String(result.tokenUsage.input),
      String(result.tokenUsage.output),
      String(result.promptAudit.compactInputTokenEstimate),
      String(result.promptAudit.legacyInputTokenEstimate),
      String(result.promptAudit.estimatedTokenSavingsRate),
      result.businessValidationErrors.includes("human_review_missing") ? "yes" : "",
      ""
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}
