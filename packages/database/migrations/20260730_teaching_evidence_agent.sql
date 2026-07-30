alter table lessons add column if not exists lesson_format text not null default 'offline_classroom_recording';

alter table lessons drop constraint if exists lessons_lesson_format_check;
alter table lessons add constraint lessons_lesson_format_check
  check (lesson_format in (
    'offline_classroom_recording',
    'live_online_class',
    'recorded_online_class'
  ));

alter table evidence_cards add column if not exists raw_json jsonb;
alter table evidence_cards alter column review_status set default 'pending_review';
alter table evidence_cards add column if not exists edited_conclusion text;
alter table evidence_cards add column if not exists teacher_note text;

create index if not exists evidence_cards_lesson_review_idx
  on evidence_cards(lesson_id, review_status, created_at);

create table if not exists classroom_events (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  video_id uuid not null references lesson_videos(id) on delete cascade,
  event_type text not null,
  start_ms integer not null,
  end_ms integer not null,
  transcript_segment_ids jsonb not null default '[]',
  quote_text text,
  confidence_label text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists classroom_events_lesson_time_idx
  on classroom_events(lesson_id, start_ms, event_type);

alter table reports add column if not exists title text;
alter table reports add column if not exists updated_at timestamptz not null default now();
