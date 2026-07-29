export type LessonListItem = {
  id: string;
  lesson_title?: string;
  file_name?: string;
  updated_at?: string;
  created_at?: string;
  segment_count?: number;
  section_count?: number;
  workflow_status?: string;
  workflow_error_message?: string;
  workflow_current_step?: string;
  error_message?: string;
  processing_status?: string;
  status?: string;
  upload_status?: string;
};

export type LessonSectionDto = {
  id: string;
  start_ms: number;
  end_ms: number;
  title?: string;
  summary_text?: string;
  edited_summary_text?: string;
  review_status?: string;
  tags?: string[];
};

export type TranscriptSegmentDto = {
  id: string;
  start_ms: number;
  end_ms: number;
  speaker_label?: string;
  original_text?: string;
  translated_text?: string | null;
};

export type EvidenceCardDto = {
  id: string;
  evidence_type?: string;
  conclusion?: string;
  edited_conclusion?: string;
  quote_text?: string;
  suggestion?: string;
  start_ms?: number;
  end_ms?: number;
  confidence_label?: string;
  review_status?: string;
};

export type WorkflowStepDto = {
  key: string;
  label?: string;
  status?: string;
  error_message?: string | null;
};

export type LessonDetail = {
  lesson: { id: string; status?: string; lesson_title?: string };
  video?: { id: string; file_name?: string; processing_status?: string; error_message?: string };
  playback_url?: string;
  sections: LessonSectionDto[];
  transcript_segments: TranscriptSegmentDto[];
  evidence_cards: EvidenceCardDto[];
};

export type NormalizedSection = {
  id: string;
  startMs: number;
  endMs: number;
  title: string;
  text: string;
  translatedText: string;
  bilingualText: string;
  tags: string[];
  reviewStatus: string;
};

