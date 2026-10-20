-- Run before deploying scene-aware writes. No inferred backfill of historical cards.
alter table lessons add column if not exists scene_revision integer not null default 1;
create table if not exists lesson_scene_reviews (
 id uuid primary key default gen_random_uuid(),
 lesson_id uuid not null references lessons(id) on delete cascade,
 previous_format text,
 corrected_format text not null,
 previous_context jsonb not null,
 corrected_context jsonb not null,
 label_source text not null default 'manual_format_change',
 review_comment text,
 created_at timestamptz not null default now()
);
create index if not exists lesson_scene_reviews_lesson_idx on lesson_scene_reviews(lesson_id,created_at);
-- Logical partitions live in raw_json: scene type, scope and revision are server snapshots.
create index if not exists evidence_scene_partition_idx on evidence_cards
 (lesson_id, (raw_json->'evaluationContext'->>'sceneType'), (raw_json->'evaluationContext'->>'evaluationScope'), (raw_json->'evaluationContext'->>'sceneRevision'));
create index if not exists report_scene_partition_idx on reports
 (lesson_id, (generated_from->'evaluationContext'->>'sceneType'), (generated_from->'evaluationContext'->>'sceneRevision'));
