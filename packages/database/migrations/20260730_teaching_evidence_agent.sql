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

create index if not exists evidence_cards_lesson_review_idx
  on evidence_cards(lesson_id, review_status, created_at);
