update transcript_segments
set
  raw_text = coalesce(raw_text, raw_original_text, original_text, ''),
  source_segment_ids = case
    when source_segment_ids = '[]'::jsonb then jsonb_build_array(id::text)
    else source_segment_ids
  end,
  timing_precision = case
    when timing_precision is null or timing_precision = 'legacy_segment' then 'legacy_segment'
    else timing_precision
  end,
  raw_speaker_ids = case
    when raw_speaker_ids = '[]'::jsonb and speaker_label is not null then jsonb_build_array(speaker_label)
    else raw_speaker_ids
  end,
  legacy_original_text = coalesce(legacy_original_text, original_text),
  agent_normalized_text = case
    when source = 'transcript_agent' and nullif(original_text, coalesce(raw_original_text, original_text, '')) is not null
      then original_text
    else agent_normalized_text
  end,
  teacher_edited_text = case
    when source = 'teacher_review' and nullif(original_text, coalesce(raw_original_text, original_text, '')) is not null
      then original_text
    else teacher_edited_text
  end,
  needs_human_review = case
    when source not in ('transcript_agent', 'teacher_review')
      and raw_original_text is not null
      and original_text is not null
      and original_text <> raw_original_text
      then true
    else needs_human_review
  end,
  review_reason = case
    when source not in ('transcript_agent', 'teacher_review')
      and raw_original_text is not null
      and original_text is not null
      and original_text <> raw_original_text
      then coalesce(review_reason, 'legacy_original_text_ambiguous')
    else review_reason
  end,
  review_status = case
    when source not in ('transcript_agent', 'teacher_review')
      and raw_original_text is not null
      and original_text is not null
      and original_text <> raw_original_text
      then 'requires_review'
    when source = 'teacher_review' then 'reviewed'
    else review_status
  end,
  version = greatest(version, 1),
  updated_at = now()
where raw_text is null
   or source_segment_ids = '[]'::jsonb
   or legacy_original_text is null;
