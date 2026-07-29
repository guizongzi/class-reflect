create extension if not exists pgcrypto;

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  video_id uuid not null references lesson_videos(id) on delete cascade,
  task_id uuid,
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
create index if not exists workflow_runs_video_created_idx on workflow_runs(video_id, created_at desc);
create index if not exists workflow_step_runs_run_idx on workflow_step_runs(workflow_run_id, step_key);
