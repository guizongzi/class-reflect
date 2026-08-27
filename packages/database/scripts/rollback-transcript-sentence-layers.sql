alter table transcript_segments drop constraint if exists transcript_segments_timing_precision_check;
alter table transcript_segments drop constraint if exists transcript_segments_review_status_check;
alter table transcript_segments drop constraint if exists transcript_segments_speaker_role_check;
alter table transcript_segments drop constraint if exists transcript_segments_agent_confidence_check;

drop index if exists transcript_segments_lesson_video_time_idx;
drop index if exists transcript_segments_video_idx;
drop index if exists transcript_segments_review_status_idx;
drop index if exists transcript_segments_needs_human_review_idx;

drop table if exists transcript_speaker_identities;

alter table transcript_segments drop column if exists legacy_original_text;
alter table transcript_segments drop column if exists version;
alter table transcript_segments drop column if exists review_status;
alter table transcript_segments drop column if exists review_reason;
alter table transcript_segments drop column if exists needs_human_review;
alter table transcript_segments drop column if exists delivery_features;
alter table transcript_segments drop column if exists agent_change_types;
alter table transcript_segments drop column if exists agent_confidence;
alter table transcript_segments drop column if exists teacher_speaker_identity_id;
alter table transcript_segments drop column if exists teacher_speaker_role;
alter table transcript_segments drop column if exists agent_speaker_identity_id;
alter table transcript_segments drop column if exists agent_speaker_role;
alter table transcript_segments drop column if exists raw_speaker_ids;
alter table transcript_segments drop column if exists timing_precision;
alter table transcript_segments drop column if exists source_segment_ids;
alter table transcript_segments drop column if exists teacher_edited_text;
alter table transcript_segments drop column if exists agent_normalized_text;
alter table transcript_segments drop column if exists raw_text;

update transcript_segments
set original_text = coalesce(original_text, raw_original_text, '')
where original_text is null;

alter table transcript_segments alter column original_text set not null;
