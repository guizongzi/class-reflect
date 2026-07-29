import { loadAppConfig } from "@class-reflect/config";
import { Pool } from "pg";

export type RepositoryResult<T> = Promise<T>;

export interface WorkflowRepository {
  claimNext(): RepositoryResult<{ id: string } | null>;
  markFailed(id: string, errorMessage: string): RepositoryResult<void>;
}

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

export async function deleteLessonRecord(lessonId: string): Promise<boolean> {
  const result = await getPool().query("delete from lessons where id = $1", [lessonId]);
  return (result.rowCount || 0) > 0;
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
  return result.rows[0] ? mapLessonVideoRow(result.rows[0]) : null;
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
  return result.rows[0] ? mapLessonVideoRow(result.rows[0]) : null;
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
