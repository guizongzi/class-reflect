alter table transcript_segments add column if not exists raw_text text;
alter table transcript_segments add column if not exists agent_normalized_text text;
alter table transcript_segments add column if not exists teacher_edited_text text;
alter table transcript_segments add column if not exists source_segment_ids jsonb not null default '[]';
alter table transcript_segments add column if not exists timing_precision text not null default 'legacy_segment';
alter table transcript_segments add column if not exists raw_speaker_ids jsonb not null default '[]';
alter table transcript_segments add column if not exists agent_speaker_role text;
alter table transcript_segments add column if not exists agent_speaker_identity_id text;
alter table transcript_segments add column if not exists teacher_speaker_role text;
alter table transcript_segments add column if not exists teacher_speaker_identity_id text;
alter table transcript_segments add column if not exists agent_confidence numeric;
alter table transcript_segments add column if not exists agent_change_types jsonb not null default '[]';
alter table transcript_segments add column if not exists delivery_features jsonb not null default '{}';
alter table transcript_segments add column if not exists needs_human_review boolean not null default false;
alter table transcript_segments add column if not exists review_reason text;
alter table transcript_segments add column if not exists review_status text not null default 'pending_review';
alter table transcript_segments add column if not exists version integer not null default 1;
alter table transcript_segments add column if not exists legacy_original_text text;

alter table transcript_segments alter column original_text drop not null;

alter table transcript_segments drop constraint if exists transcript_segments_timing_precision_check;
alter table transcript_segments add constraint transcript_segments_timing_precision_check
  check (timing_precision in ('exact', 'estimated', 'merged', 'split', 'legacy_segment', 'unknown'));

alter table transcript_segments drop constraint if exists transcript_segments_review_status_check;
alter table transcript_segments add constraint transcript_segments_review_status_check
  check (review_status in ('pending_review', 'requires_review', 'reviewed', 'accepted', 'edited_and_accepted'));

alter table transcript_segments drop constraint if exists transcript_segments_speaker_role_check;
alter table transcript_segments add constraint transcript_segments_speaker_role_check
  check (
    (agent_speaker_role is null or agent_speaker_role in ('teacher', 'student', 'students', 'multiple', 'unknown'))
    and
    (teacher_speaker_role is null or teacher_speaker_role in ('teacher', 'student', 'students', 'multiple', 'unknown'))
  );

alter table transcript_segments drop constraint if exists transcript_segments_agent_confidence_check;
alter table transcript_segments add constraint transcript_segments_agent_confidence_check
  check (agent_confidence is null or (agent_confidence >= 0 and agent_confidence <= 1));

create index if not exists transcript_segments_lesson_video_time_idx on transcript_segments(lesson_id, video_id, start_ms);
create index if not exists transcript_segments_video_idx on transcript_segments(video_id);
create index if not exists transcript_segments_review_status_idx on transcript_segments(lesson_id, video_id, review_status);
create index if not exists transcript_segments_needs_human_review_idx on transcript_segments(lesson_id, video_id, needs_human_review);
