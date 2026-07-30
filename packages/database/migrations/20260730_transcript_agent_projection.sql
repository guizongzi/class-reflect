alter table lesson_sections add column if not exists transcript_segment_ids jsonb not null default '[]';
alter table lesson_sections add column if not exists metadata jsonb not null default '{}';
