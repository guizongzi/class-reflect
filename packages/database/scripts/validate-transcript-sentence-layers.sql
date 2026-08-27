select 'missing_raw_text' as check_name, count(*)::int as issue_count
from transcript_segments
where raw_text is null or raw_text = ''
union all
select 'missing_source_segment_ids', count(*)::int
from transcript_segments
where source_segment_ids is null or jsonb_array_length(source_segment_ids) = 0
union all
select 'invalid_timing_precision', count(*)::int
from transcript_segments
where timing_precision not in ('exact', 'estimated', 'merged', 'split', 'legacy_segment', 'unknown')
union all
select 'ambiguous_legacy_without_review', count(*)::int
from transcript_segments
where legacy_original_text is not null
  and raw_text is not null
  and legacy_original_text <> raw_text
  and source not in ('transcript_agent', 'teacher_review')
  and (needs_human_review is false or review_status <> 'requires_review')
union all
select 'saved_effective_text_column', count(*)::int
from information_schema.columns
where table_schema = 'public'
  and table_name = 'transcript_segments'
  and column_name = 'effective_text';
