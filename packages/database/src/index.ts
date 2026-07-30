import { loadAppConfig } from "@class-reflect/config";
import {
  workflowStepOptions,
  type ClassroomMetric,
  type ClassroomEvent,
  type LessonSection,
  type LessonFormat,
  type Report,
  type ReviewStatus,
  type TeachingEvidenceCard,
  type TranscriptSegment,
  type WorkflowStatus,
  type WorkflowStepKey,
  type WorkflowStepStatus
} from "@class-reflect/shared-types";
import { Pool } from "pg";

export type RepositoryResult<T> = Promise<T>;

export interface WorkflowRepository {
  claimNext(): RepositoryResult<{ id: string } | null>;
  markFailed(id: string, errorMessage: string): RepositoryResult<void>;
}

export type WorkflowRunRecord = {
  id: string;
  lessonId: string;
  videoId: string;
  taskId: string | null;
  workflowType: string;
  status: WorkflowStatus;
  progress: number;
  currentStep: WorkflowStepKey | null;
  retryCount: number;
  errorMessage: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  lockedAt: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowStepRunRecord = {
  id: string;
  workflowRunId: string;
  stepKey: WorkflowStepKey;
  label: string;
  status: WorkflowStepStatus;
  progress: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowStatusRecord = {
  task: WorkflowRunRecord | null;
  steps: WorkflowStepRunRecord[];
};

export type LessonListRecord = {
  id: string;
  courseTitle: string | null;
  lessonTitle: string;
  lessonFormat: string | null;
  grade: string | null;
  subject: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  videoId: string | null;
  fileName: string | null;
  uploadStatus: string | null;
  processingStatus: string | null;
  processingError: string | null;
  audioUploadStatus: string | null;
  workflowStatus: string | null;
  workflowCurrentStep: string | null;
  workflowProgress: number | null;
  workflowError: string | null;
  transcriptSegmentCount: number;
  lessonSectionCount: number;
  evidenceCardCount: number;
  reportCount: number;
};

export type LessonDetailRecord = {
  lesson: {
    id: string;
    courseTitle: string | null;
    lessonTitle: string;
    lessonFormat: string | null;
    grade: string | null;
    subject: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  sections: unknown[];
  transcriptSegments: unknown[];
  evidenceCards: unknown[];
  reports: unknown[];
};

export type TranslationTargetRecord = {
  targetType: "section" | "segment";
  id: string;
  lessonId: string;
  originalText: string;
  translatedText: string | null;
};

export type TeachingEvidenceSourceRecord = {
  lesson: {
    id: string;
    lessonFormat: LessonFormat;
  };
  transcriptSegments: TranscriptSegment[];
  metrics: ClassroomMetric[];
};

export type PersistTranscriptSegmentInput = {
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string | number | null;
  speakerLabel?: string | null;
  confidence?: number | null;
  sourceMeta?: Record<string, unknown>;
};

let pool: Pool | null = null;
let lessonColumnCache: Set<string> | null = null;

function getPool() {
  if (pool) return pool;
  const config = loadAppConfig();
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for database-backed lesson operations");
  }
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false }
  });
  return pool;
}

export async function listLessonRecords(): Promise<LessonListRecord[]> {
  const result = await getPool().query(`
    select
      l.id,
      l.course_title,
      l.lesson_title,
      to_jsonb(l)->>'lesson_format' as lesson_format,
      l.grade,
      l.subject,
      l.status,
      l.created_at,
      l.updated_at,
      v.id as video_id,
      v.file_name,
      v.upload_status,
      v.processing_status,
      v.error_message as processing_error,
      v.audio_upload_status,
      wf.status as workflow_status,
      wf.current_step as workflow_current_step,
      wf.progress as workflow_progress,
      wf.error_message as workflow_error,
      coalesce(segment_counts.count, 0)::int as transcript_segment_count,
      coalesce(section_counts.count, 0)::int as lesson_section_count,
      coalesce(evidence_counts.count, 0)::int as evidence_card_count,
      coalesce(report_counts.count, 0)::int as report_count
    from lessons l
    left join lateral (
      select *
      from lesson_videos
      where lesson_id = l.id
      order by created_at desc
      limit 1
    ) v on true
    left join lateral (
      select *
      from workflow_runs
      where lesson_id = l.id
      order by created_at desc
      limit 1
    ) wf on true
    left join lateral (
      select count(*) as count
      from transcript_segments
      where lesson_id = l.id
    ) segment_counts on true
    left join lateral (
      select count(*) as count
      from lesson_sections
      where lesson_id = l.id
    ) section_counts on true
    left join lateral (
      select count(*) as count
      from evidence_cards
      where lesson_id = l.id
    ) evidence_counts on true
    left join lateral (
      select count(*) as count
      from reports
      where lesson_id = l.id
    ) report_counts on true
    order by l.updated_at desc, l.created_at desc
  `);

  return result.rows.map((row) => ({
    id: row.id,
    courseTitle: row.course_title,
    lessonTitle: row.lesson_title,
    lessonFormat: row.lesson_format,
    grade: row.grade,
    subject: row.subject,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    videoId: row.video_id,
    fileName: row.file_name,
    uploadStatus: row.upload_status,
    processingStatus: row.processing_status,
    processingError: row.processing_error,
    audioUploadStatus: row.audio_upload_status,
    workflowStatus: row.workflow_status,
    workflowCurrentStep: row.workflow_current_step,
    workflowProgress: row.workflow_progress,
    workflowError: row.workflow_error,
    transcriptSegmentCount: row.transcript_segment_count,
    lessonSectionCount: row.lesson_section_count,
    evidenceCardCount: row.evidence_card_count,
    reportCount: row.report_count
  }));
}

export async function createLessonRecord(input: {
  courseTitle?: string;
  lessonTitle: string;
  lessonFormat?: string;
  grade?: string;
  subject?: string;
  analysisGoal?: string;
}): Promise<LessonDetailRecord["lesson"]> {
  const columns = await getLessonColumns();
  const entries: Array<[string, unknown]> = [];

  addColumn(entries, columns, "teacher_id", "demo-teacher");
  addColumn(entries, columns, "course_title", input.courseTitle || "课堂复盘");
  addColumn(entries, columns, "lesson_title", input.lessonTitle);
  addColumn(entries, columns, "lesson_format", input.lessonFormat || "offline_classroom_recording");
  addColumn(entries, columns, "grade", input.grade || null);
  addColumn(entries, columns, "subject", input.subject || null);
  addColumn(entries, columns, "analysis_goal", input.analysisGoal || null);

  const columnSql = entries.map(([column]) => column).join(", ");
  const valueSql = entries.map((_, index) => `$${index + 1}`).join(", ");
  const values = entries.map(([, value]) => value);

  const result = await getPool().query(`
    insert into lessons (${columnSql})
    values (${valueSql})
    returning
      id,
      course_title,
      lesson_title,
      to_jsonb(lessons)->>'lesson_format' as lesson_format,
      grade,
      subject,
      status,
      created_at,
      updated_at
  `, values);
  const row = result.rows[0];
  return {
    id: row.id,
    courseTitle: row.course_title,
    lessonTitle: row.lesson_title,
    lessonFormat: row.lesson_format,
    grade: row.grade,
    subject: row.subject,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export async function getLessonRecord(lessonId: string): Promise<LessonDetailRecord | null> {
  const lessonResult = await getPool().query(`
    select
      id,
      course_title,
      lesson_title,
      to_jsonb(lessons)->>'lesson_format' as lesson_format,
      grade,
      subject,
      status,
      created_at,
      updated_at
    from lessons
    where id = $1
  `, [lessonId]);
  const lesson = lessonResult.rows[0];
  if (!lesson) return null;

  const [sections, transcriptSegments, evidenceCards, reports] = await Promise.all([
    getPool().query("select * from lesson_sections where lesson_id = $1 order by start_ms", [lessonId]),
    getPool().query("select * from transcript_segments where lesson_id = $1 order by start_ms", [lessonId]),
    getPool().query("select * from evidence_cards where lesson_id = $1 order by created_at", [lessonId]),
    getPool().query("select * from reports where lesson_id = $1 order by created_at desc", [lessonId])
  ]);

  return {
    lesson: {
      id: lesson.id,
      courseTitle: lesson.course_title,
      lessonTitle: lesson.lesson_title,
      lessonFormat: lesson.lesson_format,
      grade: lesson.grade,
      subject: lesson.subject,
      status: lesson.status,
      createdAt: toIsoString(lesson.created_at),
      updatedAt: toIsoString(lesson.updated_at)
    },
    sections: sections.rows,
    transcriptSegments: transcriptSegments.rows,
    evidenceCards: evidenceCards.rows,
    reports: reports.rows
  };
}

export async function getTeachingEvidenceSource(input: {
  lessonId: string;
  videoId: string;
}): Promise<TeachingEvidenceSourceRecord | null> {
  const lessonResult = await getPool().query(`
    select
      id,
      to_jsonb(lessons)->>'lesson_format' as lesson_format
    from lessons
    where id = $1
  `, [input.lessonId]);
  const lesson = lessonResult.rows[0];
  if (!lesson) return null;

  const segmentResult = await getPool().query(`
    select
      id,
      start_ms,
      end_ms,
      speaker_label,
      coalesce(original_text, raw_original_text, '') as text,
      confidence
    from transcript_segments
    where lesson_id = $1 and video_id = $2
    order by start_ms
  `, [input.lessonId, input.videoId]);
  const metrics = await listClassroomMetrics({
    lessonId: input.lessonId,
    videoId: input.videoId
  });

  return {
    lesson: {
      id: String(lesson.id),
      lessonFormat: normalizeLessonFormat(lesson.lesson_format)
    },
    transcriptSegments: segmentResult.rows.map((row) => ({
      id: String(row.id),
      startMs: Number(row.start_ms || 0),
      endMs: Number(row.end_ms || 0),
      speakerLabel: row.speaker_label == null ? null : String(row.speaker_label),
      text: String(row.text || ""),
      confidence: row.confidence == null ? null : Number(row.confidence)
    })),
    metrics
  };
}

export async function saveTranscriptSegments(input: {
  lessonId: string;
  videoId: string;
  segments: PersistTranscriptSegmentInput[];
}): Promise<TranscriptSegment[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("delete from evidence_cards where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);
    await client.query("delete from classroom_events where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);
    await client.query("delete from classroom_metrics where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);
    await client.query("delete from lesson_sections where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);
    await client.query("delete from transcript_segments where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);

    const saved: TranscriptSegment[] = [];
    for (const segment of input.segments) {
      const result = await client.query(`
        insert into transcript_segments
          (
            lesson_id,
            video_id,
            start_ms,
            end_ms,
            speaker_label,
            original_text,
            raw_original_text,
            translated_text,
            raw_translated_text,
            confidence,
            source
          )
        values ($1, $2, $3, $4, $5, $6, $6, null, null, $7, 'asr')
        returning id, start_ms, end_ms, speaker_label, original_text, confidence
      `, [
        input.lessonId,
        input.videoId,
        segment.startMs,
        segment.endMs,
        segment.speakerLabel || formatSpeakerLabel(segment.speakerId),
        segment.text,
        segment.confidence ?? null
      ]);
      const row = result.rows[0];
      saved.push({
        id: String(row.id),
        startMs: Number(row.start_ms || 0),
        endMs: Number(row.end_ms || 0),
        speakerLabel: row.speaker_label == null ? null : String(row.speaker_label),
        text: String(row.original_text || ""),
        confidence: row.confidence == null ? null : Number(row.confidence)
      });
    }
    await client.query("update lessons set updated_at = now() where id = $1", [input.lessonId]);
    await client.query("commit");
    return saved;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listTranscriptSegments(input: {
  lessonId: string;
  videoId: string;
}): Promise<TranscriptSegment[]> {
  const result = await getPool().query(`
    select
      id,
      start_ms,
      end_ms,
      speaker_label,
      coalesce(original_text, raw_original_text, '') as text,
      confidence
    from transcript_segments
    where lesson_id = $1 and video_id = $2
    order by start_ms
  `, [input.lessonId, input.videoId]);

  return result.rows.map((row) => ({
    id: String(row.id),
    startMs: Number(row.start_ms || 0),
    endMs: Number(row.end_ms || 0),
    speakerLabel: row.speaker_label == null ? null : String(row.speaker_label),
    text: String(row.text || ""),
    confidence: row.confidence == null ? null : Number(row.confidence)
  }));
}

export async function saveLessonSections(input: {
  lessonId: string;
  videoId: string;
  sections: LessonSection[];
}): Promise<LessonSection[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("delete from evidence_cards where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);
    await client.query("delete from lesson_sections where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);

    const saved: LessonSection[] = [];
    for (const section of input.sections) {
      const result = await client.query(`
        insert into lesson_sections
          (lesson_id, video_id, start_ms, end_ms, title, summary_text, confidence_label, tags)
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        returning id, lesson_id, video_id, start_ms, end_ms, title, summary_text, confidence_label, tags
      `, [
        input.lessonId,
        input.videoId,
        section.startMs,
        section.endMs,
        section.title,
        section.summaryText,
        section.confidenceLabel,
        JSON.stringify(section.tags)
      ]);
      const row = result.rows[0];
      saved.push({
        id: String(row.id),
        lessonId: String(row.lesson_id),
        videoId: String(row.video_id),
        startMs: Number(row.start_ms || 0),
        endMs: Number(row.end_ms || 0),
        title: String(row.title || ""),
        summaryText: String(row.summary_text || ""),
        confidenceLabel: String(row.confidence_label || ""),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : []
      });
    }
    await client.query("update lessons set updated_at = now() where id = $1", [input.lessonId]);
    await client.query("commit");
    return saved;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateLessonSectionText(input: {
  lessonId: string;
  sectionId: string;
  editedSummaryText: string;
  reviewerId?: string;
}): Promise<LessonSection | null> {
  const result = await getPool().query(`
    update lesson_sections
    set
      edited_summary_text = $3,
      review_status = '已校订',
      reviewer_id = $4,
      reviewed_at = now(),
      updated_at = now()
    where lesson_id = $1 and id = $2
    returning id, lesson_id, video_id, start_ms, end_ms, title, summary_text, edited_summary_text, confidence_label, tags
  `, [input.lessonId, input.sectionId, input.editedSummaryText, input.reviewerId || "demo-teacher"]);
  const row = result.rows[0];
  if (!row) return null;
  return mapLessonSectionRow(row);
}

export async function updateTranscriptSegmentText(input: {
  lessonId: string;
  segmentId: string;
  editedText: string;
  reviewerId?: string;
}): Promise<TranscriptSegment | null> {
  const result = await getPool().query(`
    update transcript_segments
    set
      original_text = $3,
      reviewer_id = $4,
      reviewed_at = now(),
      updated_at = now()
    where lesson_id = $1 and id = $2
    returning id, start_ms, end_ms, speaker_label, original_text, confidence
  `, [input.lessonId, input.segmentId, input.editedText, input.reviewerId || "demo-teacher"]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    startMs: Number(row.start_ms || 0),
    endMs: Number(row.end_ms || 0),
    speakerLabel: row.speaker_label == null ? null : String(row.speaker_label),
    text: String(row.original_text || ""),
    confidence: row.confidence == null ? null : Number(row.confidence)
  };
}

export async function saveClassroomEvents(input: {
  lessonId: string;
  videoId: string;
  events: ClassroomEvent[];
}): Promise<ClassroomEvent[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("delete from classroom_events where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);
    const saved: ClassroomEvent[] = [];
    for (const event of input.events) {
      const result = await client.query(`
        insert into classroom_events
          (lesson_id, video_id, event_type, start_ms, end_ms, transcript_segment_ids, quote_text, confidence_label, metadata)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
        returning *
      `, [
        input.lessonId,
        input.videoId,
        event.type,
        event.startMs,
        event.endMs,
        JSON.stringify(event.transcriptSegmentIds || []),
        event.quote || null,
        event.confidenceLabel || null,
        JSON.stringify(event.metadata || {})
      ]);
      saved.push(mapClassroomEventRow(result.rows[0]));
    }
    await client.query("commit");
    return saved;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listClassroomEvents(input: {
  lessonId: string;
  videoId?: string;
}): Promise<ClassroomEvent[]> {
  const params = input.videoId ? [input.lessonId, input.videoId] : [input.lessonId];
  const result = await getPool().query(`
    select *
    from classroom_events
    where lesson_id = $1
      ${input.videoId ? "and video_id = $2" : ""}
    order by start_ms, created_at
  `, params);
  return result.rows.map(mapClassroomEventRow);
}

export async function saveClassroomMetrics(input: {
  lessonId: string;
  videoId: string;
  metrics: ClassroomMetric[];
}): Promise<ClassroomMetric[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("delete from classroom_metrics where lesson_id = $1 and video_id = $2", [input.lessonId, input.videoId]);
    const saved: ClassroomMetric[] = [];
    for (const metric of input.metrics) {
      const result = await client.query(`
        insert into classroom_metrics
          (lesson_id, video_id, metric_key, name, value, unit, segment_ids, metadata)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
        returning *
      `, [
        input.lessonId,
        input.videoId,
        metric.id,
        metric.name,
        metric.value,
        metric.unit || null,
        JSON.stringify(metric.segmentIds || []),
        JSON.stringify(metric.metadata || {})
      ]);
      saved.push(mapClassroomMetricRow(result.rows[0]));
    }
    await client.query("commit");
    return saved;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listClassroomMetrics(input: {
  lessonId: string;
  videoId?: string;
}): Promise<ClassroomMetric[]> {
  const params = input.videoId ? [input.lessonId, input.videoId] : [input.lessonId];
  const result = await getPool().query(`
    select *
    from classroom_metrics
    where lesson_id = $1
      ${input.videoId ? "and video_id = $2" : ""}
    order by metric_key, created_at
  `, params);
  return result.rows.map(mapClassroomMetricRow);
}

export async function reviewEvidenceCardRecord(input: {
  lessonId: string;
  evidenceCardId: string;
  status: ReviewStatus;
  finalFact?: string;
  finalJudgment?: string;
  finalSuggestion?: string;
  reviewComment?: string;
}) {
  const result = await getPool().query(`
    update evidence_cards
    set
      review_status = $3,
      edited_conclusion = $4,
      suggestion = coalesce($5, suggestion),
      teacher_note = $6,
      updated_at = now()
    where lesson_id = $1 and id = $2
    returning *
  `, [
    input.lessonId,
    input.evidenceCardId,
    input.status,
    [input.finalFact, input.finalJudgment].filter(Boolean).join("\n") || null,
    input.finalSuggestion || null,
    input.reviewComment || null
  ]);
  return result.rows[0] || null;
}

export async function listTeachingEvidenceCards(lessonId: string): Promise<TeachingEvidenceCard[]> {
  const result = await getPool().query("select * from evidence_cards where lesson_id = $1 order by start_ms, created_at", [lessonId]);
  return result.rows.map(mapEvidenceCardRow);
}

export async function saveReportRecord(input: {
  lessonId: string;
  markdownContent: string;
  generatedFrom: Record<string, unknown>;
  title?: string;
}): Promise<Report> {
  const result = await getPool().query(`
    insert into reports (lesson_id, title, markdown_content, generated_from)
    values ($1, $2, $3, $4::jsonb)
    returning id, lesson_id, markdown_content, generated_from, created_at
  `, [
    input.lessonId,
    input.title || "课堂复盘报告",
    input.markdownContent,
    JSON.stringify(input.generatedFrom)
  ]);
  return mapReportRow(result.rows[0]);
}

export async function updateReportRecord(input: {
  lessonId: string;
  reportId: string;
  markdownContent: string;
}): Promise<Report | null> {
  const result = await getPool().query(`
    update reports
    set markdown_content = $3, updated_at = now()
    where lesson_id = $1 and id = $2
    returning id, lesson_id, markdown_content, generated_from, created_at
  `, [input.lessonId, input.reportId, input.markdownContent]);
  return result.rows[0] ? mapReportRow(result.rows[0]) : null;
}

export async function listReportRecords(lessonId: string): Promise<Report[]> {
  const result = await getPool().query(`
    select id, lesson_id, markdown_content, generated_from, created_at
    from reports
    where lesson_id = $1
    order by created_at desc
  `, [lessonId]);
  return result.rows.map(mapReportRow);
}

export async function saveTeachingEvidenceCards(input: {
  lessonId: string;
  videoId: string;
  cards: TeachingEvidenceCard[];
  sourceModel: string;
}): Promise<Array<Record<string, unknown>>> {
  if (!input.cards.length) return [];

  const rows: Array<Record<string, unknown>> = [];
  for (const card of input.cards) {
    const result = await getPool().query(`
      insert into evidence_cards
        (
          lesson_id,
          video_id,
          evidence_type,
          conclusion,
          suggestion,
          start_ms,
          end_ms,
          quote_text,
          confidence_label,
          review_status,
          source_model,
          raw_json
        )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_review', $10, $11::jsonb)
      returning *
    `, [
      input.lessonId,
      input.videoId,
      card.category,
      `${card.title}\n${card.fact}\n${card.interpretation}`,
      card.suggestion,
      card.startMs,
      card.endMs,
      card.quote,
      card.confidence,
      input.sourceModel,
      JSON.stringify(card)
    ]);
    rows.push(result.rows[0]);
  }
  await getPool().query("update lessons set updated_at = now() where id = $1", [input.lessonId]);
  return rows;
}

export async function deleteLessonRecord(lessonId: string): Promise<boolean> {
  const result = await getPool().query("delete from lessons where id = $1", [lessonId]);
  return (result.rowCount || 0) > 0;
}

export async function getTranslationTarget(input: {
  lessonId: string;
  targetType: "section" | "segment";
  targetId: string;
}): Promise<TranslationTargetRecord | null> {
  if (input.targetType === "section") {
    const result = await getPool().query(`
      select
        id,
        lesson_id,
        coalesce(edited_summary_text, summary_text, '') as original_text,
        to_jsonb(lesson_sections)->>'translated_summary_text' as translated_text
      from lesson_sections
      where lesson_id = $1 and id = $2
    `, [input.lessonId, input.targetId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      targetType: "section",
      id: row.id,
      lessonId: row.lesson_id,
      originalText: row.original_text,
      translatedText: row.translated_text
    };
  }

  const result = await getPool().query(`
    select
      id,
      lesson_id,
      coalesce(original_text, raw_original_text, '') as original_text,
      translated_text
    from transcript_segments
    where lesson_id = $1 and id = $2
  `, [input.lessonId, input.targetId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    targetType: "segment",
    id: row.id,
    lessonId: row.lesson_id,
    originalText: row.original_text,
    translatedText: row.translated_text
  };
}

export async function saveTranslationResult(input: {
  lessonId: string;
  targetType: "section" | "segment";
  targetId: string;
  translatedText: string;
}) {
  if (input.targetType === "section") {
    const result = await getPool().query(`
      update lesson_sections
      set translated_summary_text = $3, updated_at = now()
      where lesson_id = $1 and id = $2
      returning
        id,
        lesson_id,
        coalesce(edited_summary_text, summary_text, '') as original_text,
        translated_summary_text as translated_text
    `, [input.lessonId, input.targetId, input.translatedText]);
    const row = result.rows[0];
    return row ? {
      targetType: "section" as const,
      id: row.id,
      lessonId: row.lesson_id,
      originalText: row.original_text,
      translatedText: row.translated_text
    } : null;
  }

  const result = await getPool().query(`
    update transcript_segments
    set translated_text = $3, raw_translated_text = coalesce(raw_translated_text, $3), updated_at = now()
    where lesson_id = $1 and id = $2
    returning
      id,
      lesson_id,
      coalesce(original_text, raw_original_text, '') as original_text,
      translated_text
  `, [input.lessonId, input.targetId, input.translatedText]);
  const row = result.rows[0];
  return row ? {
    targetType: "segment" as const,
    id: row.id,
    lessonId: row.lesson_id,
    originalText: row.original_text,
    translatedText: row.translated_text
  } : null;
}

export type LessonVideoRecord = {
  id: string;
  lessonId: string;
  bucket: string;
  objectKey: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  audioBucket: string | null;
  audioObjectKey: string | null;
  audioMimeType: string | null;
  audioUploadStatus: string;
  uploadStatus: string;
  processingStatus: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function createLessonVideoRecord(input: {
  lessonId: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
}): Promise<LessonVideoRecord> {
  const config = loadAppConfig();
  const result = await getPool().query(`
    insert into lesson_videos (
      lesson_id,
      teacher_id,
      bucket,
      object_key,
      file_name,
      file_size,
      mime_type,
      upload_status,
      processing_status
    )
    values ($1, $2, $3, $4, $5, $6, $7, 'pending', 'created')
    returning *
  `, [
    input.lessonId,
    "demo-teacher",
    config.r2Bucket || "",
    "pending",
    input.fileName,
    input.fileSize || null,
    input.mimeType || null
  ]);

  return mapLessonVideoRow(result.rows[0]);
}

export async function updateLessonVideoObjectKey(input: { videoId: string; objectKey: string }): Promise<LessonVideoRecord | null> {
  const result = await getPool().query(`
    update lesson_videos
    set object_key = $2, updated_at = now()
    where id = $1
    returning *
  `, [input.videoId, input.objectKey]);
  return result.rows[0] ? mapLessonVideoRow(result.rows[0]) : null;
}

export async function getLessonVideoRecord(videoId: string): Promise<LessonVideoRecord | null> {
  const result = await getPool().query("select * from lesson_videos where id = $1", [videoId]);
  return result.rows[0] ? mapLessonVideoRow(result.rows[0]) : null;
}

export async function markLessonVideoUploaded(videoId: string): Promise<LessonVideoRecord | null> {
  const result = await getPool().query(`
    update lesson_videos
    set
      upload_status = 'uploaded',
      processing_status = case
        when audio_upload_status = 'uploaded' then 'queued'
        else processing_status
      end,
      updated_at = now()
    where id = $1
    returning *
  `, [videoId]);
  await touchLessonForVideo(videoId);
  const video = result.rows[0] ? mapLessonVideoRow(result.rows[0]) : null;
  if (video) {
    await createOrResumeLessonWorkflow(video, {
      videoObjectKey: video.objectKey,
      audioObjectKey: video.audioObjectKey
    });
    await updateWorkflowStepByVideo(video.id, "upload_video", "completed", 100);
  }
  return video;
}

export async function setLessonVideoAudioObject(input: {
  videoId: string;
  audioObjectKey: string;
  audioMimeType: string;
}): Promise<LessonVideoRecord | null> {
  const config = loadAppConfig();
  const result = await getPool().query(`
    update lesson_videos
    set
      audio_bucket = $2,
      audio_object_key = $3,
      audio_mime_type = $4,
      audio_upload_status = 'pending',
      updated_at = now()
    where id = $1
    returning *
  `, [input.videoId, config.r2Bucket || "", input.audioObjectKey, input.audioMimeType]);
  return result.rows[0] ? mapLessonVideoRow(result.rows[0]) : null;
}

export async function markLessonVideoAudioUploaded(videoId: string): Promise<LessonVideoRecord | null> {
  const result = await getPool().query(`
    update lesson_videos
    set
      audio_upload_status = 'uploaded',
      processing_status = case
        when upload_status = 'uploaded' then 'queued'
        else processing_status
      end,
      updated_at = now()
    where id = $1
    returning *
  `, [videoId]);
  await touchLessonForVideo(videoId);
  const video = result.rows[0] ? mapLessonVideoRow(result.rows[0]) : null;
  if (video) {
    await createOrResumeLessonWorkflow(video, {
      videoObjectKey: video.objectKey,
      audioObjectKey: video.audioObjectKey
    });
    await updateWorkflowStepByVideo(video.id, "upload_audio", "completed", 100);
  }
  return video;
}

export async function createOrResumeLessonWorkflow(video: LessonVideoRecord, input: Record<string, unknown> = {}): Promise<WorkflowRunRecord> {
  const existing = await getPool().query(`
    select *
    from workflow_runs
    where video_id = $1 and status not in ('completed', 'cancelled')
    order by created_at desc
    limit 1
  `, [video.id]);

  const run = existing.rows[0]
    ? await updateWorkflowRunInput(existing.rows[0].id, input)
    : await createWorkflowRun(video, input);

  await seedWorkflowSteps(run.id);
  return run;
}

export async function getWorkflowStatusForLesson(lessonId: string): Promise<WorkflowStatusRecord> {
  const result = await getPool().query(`
    select *
    from workflow_runs
    where lesson_id = $1
    order by created_at desc
    limit 1
  `, [lessonId]);
  if (!result.rows[0]) {
    return { task: null, steps: workflowStepOptions.map((step) => emptyWorkflowStep(step.key, step.label)) };
  }

  const task = mapWorkflowRunRow(result.rows[0]);
  const steps = await listWorkflowSteps(task.id);
  return { task, steps };
}

export async function cancelWorkflowRunForLesson(lessonId: string): Promise<WorkflowStatusRecord> {
  const current = await getWorkflowStatusForLesson(lessonId);
  if (!current.task) return current;
  if (["completed", "cancelled"].includes(current.task.status)) return current;

  await getPool().query(`
    update workflow_runs
    set
      status = 'cancelled',
      error_message = null,
      locked_at = null,
      locked_by = null,
      finished_at = now(),
      updated_at = now()
    where id = $1
  `, [current.task.id]);
  await getPool().query(`
    update workflow_step_runs
    set
      status = 'cancelled',
      progress = case when progress > 0 then progress else 100 end,
      error_message = null,
      finished_at = now(),
      updated_at = now()
    where workflow_run_id = $1
      and status in ('queued', 'running', 'waiting')
  `, [current.task.id]);
  return getWorkflowStatusForLesson(lessonId);
}

export async function retryWorkflowRunForLesson(input: {
  lessonId: string;
  fromStepKey?: WorkflowStepKey | null;
}): Promise<WorkflowStatusRecord> {
  const current = await getWorkflowStatusForLesson(input.lessonId);
  if (!current.task) return current;

  const fallbackStep = current.steps.find((step) => ["failed", "cancelled", "running", "queued", "waiting"].includes(step.status))?.stepKey;
  const fromStepKey = input.fromStepKey || fallbackStep || current.task.currentStep || "upload_video";
  const fromIndex = Math.max(workflowStepOptions.findIndex((step) => step.key === fromStepKey), 0);
  const resetStepKeys = workflowStepOptions.slice(fromIndex).map((step) => step.key);
  const humanReviewIndex = workflowStepOptions.findIndex((step) => step.key === "wait_human_review");

  await getPool().query(`
    update workflow_runs
    set
      status = 'queued',
      current_step = $2,
      progress = $3,
      retry_count = retry_count + 1,
      error_message = null,
      locked_at = null,
      locked_by = null,
      finished_at = null,
      updated_at = now()
    where id = $1
  `, [
    current.task.id,
    fromStepKey,
    Math.round((fromIndex / Math.max(workflowStepOptions.length - 1, 1)) * 100)
  ]);
  await getPool().query(`
    update workflow_step_runs
    set
      status = 'waiting',
      progress = 0,
      error_message = null,
      started_at = null,
      finished_at = null,
      updated_at = now()
    where workflow_run_id = $1
      and step_key = any($2::text[])
  `, [current.task.id, resetStepKeys]);
  if (fromIndex > humanReviewIndex) {
    await getPool().query(`
      update workflow_step_runs
      set
        status = 'completed',
        progress = 100,
        error_message = null,
        finished_at = coalesce(finished_at, now()),
        updated_at = now()
      where workflow_run_id = $1
        and step_key = 'wait_human_review'
    `, [current.task.id]);
  }
  return getWorkflowStatusForLesson(input.lessonId);
}

export async function claimNextWorkflowRun(workerId: string): Promise<WorkflowRunRecord | null> {
  const result = await getPool().query(`
    with candidate as (
      select id
      from workflow_runs
      where status = 'queued'
      order by created_at
      limit 1
      for update skip locked
    )
    update workflow_runs wf
    set
      status = 'running',
      locked_at = now(),
      locked_by = $1,
      started_at = coalesce(started_at, now()),
      updated_at = now()
    from candidate
    where wf.id = candidate.id
    returning wf.*
  `, [workerId]);
  if (!result.rows[0]) return null;
  const run = mapWorkflowRunRow(result.rows[0]);
  await seedWorkflowSteps(run.id);
  return run;
}

export async function updateWorkflowRunStatus(input: {
  workflowRunId: string;
  status: WorkflowStatus;
  currentStep?: WorkflowStepKey | null;
  progress?: number;
  errorMessage?: string | null;
  output?: Record<string, unknown>;
}): Promise<WorkflowRunRecord | null> {
  const result = await getPool().query(`
    update workflow_runs
    set
      status = $2,
      current_step = coalesce($3, current_step),
      progress = coalesce($4, progress),
      error_message = $5,
      output = output || $6::jsonb,
      finished_at = case when $2 in ('completed', 'failed', 'cancelled') then now() else finished_at end,
      updated_at = now()
    where id = $1
    returning *
  `, [
    input.workflowRunId,
    input.status,
    input.currentStep ?? null,
    input.progress ?? null,
    input.errorMessage ?? null,
    JSON.stringify(input.output || {})
  ]);
  return result.rows[0] ? mapWorkflowRunRow(result.rows[0]) : null;
}

export async function updateWorkflowStep(input: {
  workflowRunId: string;
  stepKey: WorkflowStepKey;
  status: WorkflowStepStatus;
  progress: number;
  errorMessage?: string | null;
}): Promise<WorkflowStepRunRecord | null> {
  const result = await getPool().query(`
    insert into workflow_step_runs (
      workflow_run_id,
      step_key,
      status,
      progress,
      error_message,
      started_at,
      finished_at
    )
    values (
      $1,
      $2,
      $3,
      $4,
      $5,
      case when $3 = 'running' then now() else null end,
      case when $3 in ('completed', 'failed', 'skipped', 'cancelled') then now() else null end
    )
    on conflict (workflow_run_id, step_key)
    do update set
      status = excluded.status,
      progress = excluded.progress,
      error_message = excluded.error_message,
      started_at = coalesce(workflow_step_runs.started_at, excluded.started_at),
      finished_at = case when excluded.status in ('completed', 'failed', 'skipped', 'cancelled') then now() else workflow_step_runs.finished_at end,
      updated_at = now()
    returning *
  `, [input.workflowRunId, input.stepKey, input.status, input.progress, input.errorMessage || null]);
  return result.rows[0] ? mapWorkflowStepRow(result.rows[0]) : null;
}

async function getLessonColumns() {
  if (lessonColumnCache) return lessonColumnCache;
  const result = await getPool().query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'lessons'
  `);
  lessonColumnCache = new Set(result.rows.map((row) => row.column_name));
  return lessonColumnCache;
}

function addColumn(entries: Array<[string, unknown]>, columns: Set<string>, column: string, value: unknown) {
  if (columns.has(column)) entries.push([column, value]);
}

function toIsoString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}

async function touchLessonForVideo(videoId: string) {
  await getPool().query(`
    update lessons
    set updated_at = now()
    where id = (select lesson_id from lesson_videos where id = $1)
  `, [videoId]);
}

async function createWorkflowRun(video: LessonVideoRecord, input: Record<string, unknown>) {
  const result = await getPool().query(`
    insert into workflow_runs (
      lesson_id,
      video_id,
      workflow_type,
      status,
      progress,
      current_step,
      input
    )
    values ($1, $2, 'lesson_analysis', 'queued', 12, 'upload_video', $3::jsonb)
    returning *
  `, [video.lessonId, video.id, JSON.stringify(input)]);
  return mapWorkflowRunRow(result.rows[0]);
}

async function updateWorkflowRunInput(workflowRunId: string, input: Record<string, unknown>) {
  const result = await getPool().query(`
    update workflow_runs
    set input = input || $2::jsonb, updated_at = now()
    where id = $1
    returning *
  `, [workflowRunId, JSON.stringify(input)]);
  return mapWorkflowRunRow(result.rows[0]);
}

async function seedWorkflowSteps(workflowRunId: string) {
  for (const step of workflowStepOptions) {
    await getPool().query(`
      insert into workflow_step_runs (workflow_run_id, step_key, status, progress)
      values ($1, $2, 'waiting', 0)
      on conflict (workflow_run_id, step_key) do nothing
    `, [workflowRunId, step.key]);
  }
}

async function listWorkflowSteps(workflowRunId: string): Promise<WorkflowStepRunRecord[]> {
  const result = await getPool().query(`
    select *
    from workflow_step_runs
    where workflow_run_id = $1
  `, [workflowRunId]);
  const byKey = new Map(result.rows.map((row) => [String(row.step_key), mapWorkflowStepRow(row)]));
  return workflowStepOptions.map((step) => byKey.get(step.key) || emptyWorkflowStep(step.key, step.label));
}

async function updateWorkflowStepByVideo(videoId: string, stepKey: WorkflowStepKey, status: WorkflowStepStatus, progress: number) {
  const result = await getPool().query(`
    select id
    from workflow_runs
    where video_id = $1 and status not in ('completed', 'cancelled')
    order by created_at desc
    limit 1
  `, [videoId]);
  if (!result.rows[0]) return null;
  return updateWorkflowStep({
    workflowRunId: result.rows[0].id,
    stepKey,
    status,
    progress
  });
}

function mapWorkflowRunRow(row: Record<string, unknown>): WorkflowRunRecord {
  return {
    id: String(row.id),
    lessonId: String(row.lesson_id),
    videoId: String(row.video_id),
    taskId: row.task_id == null ? null : String(row.task_id),
    workflowType: String(row.workflow_type || "lesson_analysis"),
    status: String(row.status || "queued") as WorkflowStatus,
    progress: Number(row.progress || 0),
    currentStep: row.current_step == null ? null : String(row.current_step) as WorkflowStepKey,
    retryCount: Number(row.retry_count || 0),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    input: parseJsonRecord(row.input),
    output: parseJsonRecord(row.output),
    lockedAt: row.locked_at == null ? null : toIsoString(row.locked_at),
    lockedBy: row.locked_by == null ? null : String(row.locked_by),
    startedAt: row.started_at == null ? null : toIsoString(row.started_at),
    finishedAt: row.finished_at == null ? null : toIsoString(row.finished_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapWorkflowStepRow(row: Record<string, unknown>): WorkflowStepRunRecord {
  const key = String(row.step_key) as WorkflowStepKey;
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    stepKey: key,
    label: workflowStepOptions.find((step) => step.key === key)?.label || key,
    status: String(row.status || "waiting") as WorkflowStepStatus,
    progress: Number(row.progress || 0),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    startedAt: row.started_at == null ? null : toIsoString(row.started_at),
    finishedAt: row.finished_at == null ? null : toIsoString(row.finished_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapLessonSectionRow(row: Record<string, unknown>): LessonSection {
  return {
    id: String(row.id),
    lessonId: String(row.lesson_id),
    videoId: String(row.video_id),
    startMs: Number(row.start_ms || 0),
    endMs: Number(row.end_ms || 0),
    title: String(row.title || ""),
    summaryText: String(row.edited_summary_text || row.summary_text || ""),
    confidenceLabel: String(row.confidence_label || ""),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : []
  };
}

function mapClassroomEventRow(row: Record<string, unknown>): ClassroomEvent {
  const transcriptIds = Array.isArray(row.transcript_segment_ids) ? row.transcript_segment_ids : [];
  return {
    id: String(row.id),
    type: String(row.event_type || row.type || ""),
    startMs: Number(row.start_ms || 0),
    endMs: Number(row.end_ms || 0),
    transcriptSegmentIds: transcriptIds.map(String),
    quote: row.quote_text == null ? undefined : String(row.quote_text),
    confidenceLabel: row.confidence_label == null ? undefined : String(row.confidence_label),
    metadata: parseJsonRecord(row.metadata)
  };
}

function mapClassroomMetricRow(row: Record<string, unknown>): ClassroomMetric {
  const segmentIds = Array.isArray(row.segment_ids) ? row.segment_ids : [];
  return {
    id: String(row.metric_key || row.id),
    name: String(row.name || row.metric_key || ""),
    value: Number(row.value || 0),
    unit: row.unit == null ? undefined : String(row.unit),
    segmentIds: segmentIds.map(String),
    metadata: parseJsonRecord(row.metadata)
  };
}

function mapEvidenceCardRow(row: Record<string, unknown>): TeachingEvidenceCard {
  const raw = parseJsonRecord(row.raw_json);
  const rawCard = raw as Partial<TeachingEvidenceCard>;
  const conclusion = String(row.edited_conclusion || row.conclusion || "");
  const [fact = conclusion, interpretation = conclusion] = conclusion.split("\n");
  return {
    id: String(row.id),
    category: rawCard.category || "lesson_summary",
    title: rawCard.title || String(row.evidence_type || "教学证据"),
    fact: rawCard.fact || fact,
    interpretation: rawCard.interpretation || interpretation,
    suggestion: String(row.suggestion || rawCard.suggestion || ""),
    startMs: Number(row.start_ms || rawCard.startMs || 0),
    endMs: Number(row.end_ms || rawCard.endMs || 0),
    quote: String(row.quote_text || rawCard.quote || ""),
    transcriptSegmentIds: Array.isArray(rawCard.transcriptSegmentIds) ? rawCard.transcriptSegmentIds : [],
    metricIds: Array.isArray(rawCard.metricIds) ? rawCard.metricIds : [],
    classroomEventIds: Array.isArray(rawCard.classroomEventIds) ? rawCard.classroomEventIds : [],
    applicableLessonFormats: Array.isArray(rawCard.applicableLessonFormats) ? rawCard.applicableLessonFormats : ["offline_classroom_recording", "live_online_class", "recorded_online_class"],
    confidence: rawCard.confidence || "medium",
    uncertaintyNote: rawCard.uncertaintyNote ?? null,
    reviewStatus: String(row.review_status || rawCard.reviewStatus || "pending_review") as ReviewStatus,
    learningCheck: rawCard.learningCheck
  };
}

function mapReportRow(row: Record<string, unknown>): Report {
  return {
    id: String(row.id),
    lessonId: String(row.lesson_id),
    markdownContent: String(row.markdown_content || ""),
    generatedFrom: parseJsonRecord(row.generated_from),
    createdAt: toIsoString(row.created_at)
  };
}

function emptyWorkflowStep(stepKey: WorkflowStepKey, label: string): WorkflowStepRunRecord {
  return {
    id: `pending-${stepKey}`,
    workflowRunId: "",
    stepKey,
    label,
    status: "waiting",
    progress: 0,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "",
    updatedAt: ""
  };
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeLessonFormat(value: unknown): LessonFormat {
  if (value === "live_online_class" || value === "recorded_online_class" || value === "offline_classroom_recording") return value;
  return "offline_classroom_recording";
}

function formatSpeakerLabel(speakerId: string | number | null | undefined) {
  if (speakerId == null || speakerId === "") return "未知";
  const numeric = Number(speakerId);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < 26) {
    return `说话人 ${String.fromCharCode(65 + numeric)}`;
  }
  return `说话人 ${speakerId}`;
}

function mapLessonVideoRow(row: Record<string, unknown>): LessonVideoRecord {
  return {
    id: String(row.id),
    lessonId: String(row.lesson_id),
    bucket: String(row.bucket || ""),
    objectKey: String(row.object_key || ""),
    fileName: String(row.file_name || ""),
    fileSize: row.file_size == null ? null : Number(row.file_size),
    mimeType: row.mime_type == null ? null : String(row.mime_type),
    audioBucket: row.audio_bucket == null ? null : String(row.audio_bucket),
    audioObjectKey: row.audio_object_key == null ? null : String(row.audio_object_key),
    audioMimeType: row.audio_mime_type == null ? null : String(row.audio_mime_type),
    audioUploadStatus: String(row.audio_upload_status || "not_requested"),
    uploadStatus: String(row.upload_status || "pending"),
    processingStatus: String(row.processing_status || "created"),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}
