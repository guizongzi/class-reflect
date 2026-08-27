create table if not exists transcript_speaker_identities (
  id text primary key,
  lesson_id uuid not null references lessons(id) on delete cascade,
  role text not null,
  raw_speaker_ids jsonb not null default '[]',
  display_label text not null,
  confidence numeric,
  source text not null default 'deterministic',
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transcript_speaker_identities enable row level security;

alter table transcript_speaker_identities drop constraint if exists transcript_speaker_identities_role_check;
alter table transcript_speaker_identities add constraint transcript_speaker_identities_role_check
  check (role in ('teacher', 'student', 'students', 'multiple', 'unknown'));

alter table transcript_speaker_identities drop constraint if exists transcript_speaker_identities_source_check;
alter table transcript_speaker_identities add constraint transcript_speaker_identities_source_check
  check (source in ('deterministic', 'teacher'));

alter table transcript_speaker_identities drop constraint if exists transcript_speaker_identities_confidence_check;
alter table transcript_speaker_identities add constraint transcript_speaker_identities_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

create index if not exists transcript_speaker_identities_lesson_idx on transcript_speaker_identities(lesson_id);
