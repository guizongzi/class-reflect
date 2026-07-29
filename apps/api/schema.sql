create extension if not exists pgcrypto;

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null default 'demo-teacher',
  course_title text,
  lesson_title text not null,
  grade text,
  subject text,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lesson_videos (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  teacher_id text not null default 'demo-teacher',
  bucket text not null,
  object_key text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  audio_bucket text,
  audio_object_key text,
  audio_mime_type text,
  audio_upload_status text not null default 'not_requested',
  duration_seconds numeric,
  upload_status text not null default 'pending',
  processing_status text not null default 'queued',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table lesson_videos add column if not exists audio_bucket text;
alter table lesson_videos add column if not exists audio_object_key text;
alter table lesson_videos add column if not exists audio_mime_type text;
alter table lesson_videos add column if not exists audio_upload_status text not null default 'not_requested';

create table if not exists analysis_tasks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  video_id uuid not null references lesson_videos(id) on delete cascade,
  task_type text not null default 'video_analysis',
  status text not null default 'queued',
  progress integer not null default 0,
  current_step text,
  retry_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  video_id uuid not null references lesson_videos(id) on delete cascade,
  task_id uuid references analysis_tasks(id) on delete set null,
  workflow_type text not null default 'lesson_analysis',
  status text not null default 'queued',
  progress integer not null default 0,
  current_step text,
  retry_count integer not null default 0,
  error_message text,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  step_key text not null,
  status text not null default 'waiting',
  progress integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_run_id, step_key)
);

create index if not exists workflow_runs_status_created_idx on workflow_runs(status, created_at);
create index if not exists workflow_runs_lesson_created_idx on workflow_runs(lesson_id, created_at desc);
create index if not exists workflow_step_runs_run_idx on workflow_step_runs(workflow_run_id, step_key);

create table if not exists transcript_segments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  video_id uuid not null references lesson_videos(id) on delete cascade,
  start_ms integer not null,
  end_ms integer not null,
  speaker_label text default '未知',
  original_text text not null,
  raw_original_text text,
  translated_text text,
  raw_translated_text text,
  confidence numeric,
  source text not null default 'asr',
  reviewed_at timestamptz,
  reviewer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transcript_segments add column if not exists raw_original_text text;
alter table transcript_segments add column if not exists raw_translated_text text;
alter table transcript_segments add column if not exists reviewed_at timestamptz;
alter table transcript_segments add column if not exists reviewer_id text;

create table if not exists lesson_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  video_id uuid not null references lesson_videos(id) on delete cascade,
  start_ms integer not null,
  end_ms integer not null,
  title text not null,
  summary_text text,
  edited_summary_text text,
  review_status text not null default '待校订',
  reviewed_at timestamptz,
  reviewer_id text,
  confidence_label text,
  tags jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table lesson_sections add column if not exists review_status text not null default '待校订';
alter table lesson_sections add column if not exists reviewed_at timestamptz;
alter table lesson_sections add column if not exists reviewer_id text;

create table if not exists evidence_cards (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  video_id uuid not null references lesson_videos(id) on delete cascade,
  task_id uuid references analysis_tasks(id) on delete set null,
  section_id uuid references lesson_sections(id) on delete set null,
  evidence_type text not null default 'transcript',
  conclusion text not null,
  suggestion text,
  start_ms integer not null,
  end_ms integer not null,
  quote_text text,
  confidence_label text not null,
  review_status text not null default '待复核',
  edited_conclusion text,
  teacher_note text,
  source_model text,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  markdown_content text not null,
  export_object_key text,
  generated_from jsonb not null,
  created_at timestamptz not null default now()
);
