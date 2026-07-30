create table if not exists classroom_metrics (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  video_id uuid not null references lesson_videos(id) on delete cascade,
  metric_key text not null,
  name text not null,
  value numeric not null,
  unit text,
  segment_ids jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (lesson_id, video_id, metric_key)
);

create index if not exists classroom_metrics_lesson_key_idx
  on classroom_metrics(lesson_id, metric_key);

alter table if exists classroom_metrics enable row level security;
