import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  computeEffectiveSpeaker,
  computeEffectiveText,
  mapLegacyTranscriptLayerBackfill
} from "./transcript-layers";

test("computeEffectiveText prefers teacher edit, then agent normalization, then raw text", () => {
  assert.equal(computeEffectiveText({
    rawText: "raw",
    agentNormalizedText: "agent",
    teacherEditedText: "teacher"
  }), "teacher");
  assert.equal(computeEffectiveText({
    rawText: "raw",
    agentNormalizedText: "agent",
    teacherEditedText: null
  }), "agent");
  assert.equal(computeEffectiveText({
    rawText: "raw",
    agentNormalizedText: null,
    teacherEditedText: null
  }), "raw");
});

test("computeEffectiveSpeaker prefers teacher speaker fields, then agent speaker fields, then raw label", () => {
  assert.deepEqual(computeEffectiveSpeaker({
    speakerLabel: "说话人 A",
    agentSpeakerRole: "teacher",
    agentSpeakerIdentityId: "spk_teacher_1",
    teacherSpeakerRole: "student",
    teacherSpeakerIdentityId: "spk_student_1"
  }), {
    speakerLabel: "学生 A",
    speakerRole: "student",
    speakerIdentityId: "spk_student_1"
  });
  assert.deepEqual(computeEffectiveSpeaker({
    speakerLabel: "说话人 A",
    agentSpeakerRole: "teacher",
    agentSpeakerIdentityId: "spk_teacher_1",
    teacherSpeakerRole: null,
    teacherSpeakerIdentityId: null
  }), {
    speakerLabel: "教师",
    speakerRole: "teacher",
    speakerIdentityId: "spk_teacher_1"
  });
});

test("legacy backfill preserves raw text and marks ambiguous original_text for review", () => {
  assert.deepEqual(mapLegacyTranscriptLayerBackfill({
    originalText: "agent or teacher",
    rawOriginalText: "raw",
    source: "asr"
  }), {
    rawText: "raw",
    agentNormalizedText: null,
    teacherEditedText: null,
    needsHumanReview: true,
    reviewReason: "legacy_original_text_ambiguous",
    reviewStatus: "requires_review",
    legacyOriginalText: "agent or teacher"
  });
  assert.deepEqual(mapLegacyTranscriptLayerBackfill({
    originalText: "agent",
    rawOriginalText: "raw",
    source: "transcript_agent"
  }).agentNormalizedText, "agent");
});

test("migration artifacts declare required layered transcript fields and safety scripts", () => {
  const migration = readArtifact("migrations/20260807_transcript_sentence_layers.sql");
  const speakerRegistryMigration = readArtifact("migrations/20260807_speaker_registry.sql");
  const backfill = readArtifact("scripts/backfill-transcript-sentence-layers.sql");
  const rollback = readArtifact("scripts/rollback-transcript-sentence-layers.sql");
  const validation = readArtifact("scripts/validate-transcript-sentence-layers.sql");
  for (const field of [
    "raw_text",
    "agent_normalized_text",
    "teacher_edited_text",
    "source_segment_ids",
    "timing_precision",
    "raw_speaker_ids",
    "agent_speaker_role",
    "agent_speaker_identity_id",
    "teacher_speaker_role",
    "teacher_speaker_identity_id",
    "agent_confidence",
    "agent_change_types",
    "delivery_features",
    "needs_human_review",
    "review_reason",
    "review_status",
    "version"
  ]) {
    assert.match(migration, new RegExp(`\\b${field}\\b`), `${field} missing from migration`);
  }
  assert.match(backfill, /raw_original_text/);
  assert.match(backfill, /legacy_original_text/);
  assert.match(backfill, /requires_review/);
  assert.match(rollback, /drop column if exists agent_normalized_text/);
  assert.match(speakerRegistryMigration, /create table if not exists transcript_speaker_identities/);
  assert.match(speakerRegistryMigration, /alter table transcript_speaker_identities enable row level security/);
  assert.match(validation, /raw_text is null/);
});

function readArtifact(relativePath: string) {
  return readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}
