import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, assertRuntimeConfig } from "./config.js";
import { query, withTransaction } from "./db.js";
import { assertObjectExists, audioObjectKey, createReadUrl, createUploadUrl, deleteObjects, reportObjectKey, uploadText, videoObjectKey } from "./storage.js";
import { buildLessonSections, LESSON_ANALYSIS_STEPS } from "./processor.js";
import { assertLessonOwner, getTeacherId } from "./auth.js";
import { transcribeAudio } from "./asr.js";

assertRuntimeConfig();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "../web");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", config.frontendOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-teacher-id");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(webDir));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "class-reflect",
    app_revision_hint: "asr-phase-diagnostics-2026-07-29",
    asr_provider: config.asrProvider,
    asr_model: config.aliyun.asrModel,
    asr_base_url: config.aliyun.asrBaseUrl,
    asr_key_hint: maskSecret(config.aliyun.dashscopeApiKey)
  });
});

app.post("/api/debug/asr-smoke-test", async (req, res, next) => {
  try {
    if (!config.debugToken) return res.status(404).json({ error: "debug endpoint is disabled" });
    if (req.headers["x-debug-token"] !== config.debugToken) return res.status(403).json({ error: "invalid debug token" });

    const audioUrl = req.body?.audio_url || "https://paddlespeech.cdn.bcebos.com/datasets/single_wav/en/demo_002_en.wav";
    const startedAt = Date.now();
    const segments = await transcribeAudio(null, { audioUrl });
    res.json({
      ok: true,
      audio_url: audioUrl,
      elapsed_ms: Date.now() - startedAt,
      asr_provider: config.asrProvider,
      asr_model: config.aliyun.asrModel,
      asr_base_url: config.aliyun.asrBaseUrl,
      segment_count: segments.length,
      preview: segments.slice(0, 5),
      full_text: segments.map((segment) => `${msToClock(segment.startMs)}-${msToClock(segment.endMs)} ${segment.speakerLabel || "未知"}：${segment.originalText}`).join("\n")
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/lessons", async (req, res, next) => {
  try {
    const {
      course_title = "五年级数学",
      lesson_title = "分数的意义和分数单位",
      grade = "五年级",
      subject = "数学"
    } = req.body || {};
    const teacherId = await getTeacherId(req);
    const result = await query(`
      insert into lessons (teacher_id, course_title, lesson_title, grade, subject)
      values ($1, $2, $3, $4, $5)
      returning *
    `, [teacherId, course_title, lesson_title, grade, subject]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/lessons", async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req);
    const result = await query(`
      select
        l.*,
        v.id as video_id,
        v.file_name,
        v.file_size,
        v.mime_type,
        v.upload_status,
        v.processing_status,
        v.error_message,
        v.audio_upload_status,
        wf.status as workflow_status,
        wf.current_step as workflow_current_step,
        wf.progress as workflow_progress,
        wf.error_message as workflow_error_message,
        v.created_at as video_created_at,
        coalesce(section_counts.section_count, 0) as section_count,
        coalesce(segment_counts.segment_count, 0) as segment_count
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
        select count(*)::int as section_count
        from lesson_sections
        where lesson_id = l.id
      ) section_counts on true
      left join lateral (
        select count(*)::int as segment_count
        from transcript_segments
        where lesson_id = l.id
      ) segment_counts on true
      where l.teacher_id = $1
      order by l.updated_at desc, l.created_at desc
    `, [teacherId]);
    res.json({ lessons: result.rows });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/lessons/:lessonId", async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req);
    const lesson = (await query("select * from lessons where id = $1", [req.params.lessonId])).rows[0];
    if (!lesson) return res.status(404).json({ error: "lesson not found" });
    assertLessonOwner(lesson, teacherId);

    const videos = (await query(`
      select object_key, audio_object_key
      from lesson_videos
      where lesson_id = $1
    `, [lesson.id])).rows;
    const reports = (await query(`
      select export_object_key
      from reports
      where lesson_id = $1
    `, [lesson.id])).rows;
    const objectKeys = [
      ...videos.flatMap((video) => [video.object_key, video.audio_object_key]),
      ...reports.map((report) => report.export_object_key)
    ];

    await query("delete from lessons where id = $1 and teacher_id = $2", [lesson.id, teacherId]);
    await deleteObjects(objectKeys);
    res.json({ ok: true, deleted_lesson_id: lesson.id });
  } catch (error) {
    next(error);
  }
});

app.post("/api/lessons/:lessonId/videos/upload-url", async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req);
    const { file_name, file_size, mime_type } = req.body || {};
    if (!file_name) return res.status(400).json({ error: "file_name is required" });

    const video = await withTransaction(async (client) => {
      const lesson = await client.query("select * from lessons where id = $1", [req.params.lessonId]);
      if (!lesson.rows[0]) throw Object.assign(new Error("lesson not found"), { status: 404 });
      assertLessonOwner(lesson.rows[0], teacherId);

      const created = await client.query(`
        insert into lesson_videos
          (lesson_id, teacher_id, bucket, object_key, file_name, file_size, mime_type)
        values ($1, $2, $3, 'pending', $4, $5, $6)
        returning *
      `, [req.params.lessonId, teacherId, config.r2.bucket, file_name, file_size || null, mime_type || null]);
      const videoId = created.rows[0].id;
      const objectKey = videoObjectKey({ teacherId, lessonId: req.params.lessonId, videoId, fileName: file_name });
      const updated = await client.query(`
        update lesson_videos set object_key = $2, updated_at = now()
        where id = $1 returning *
      `, [videoId, objectKey]);
      return updated.rows[0];
    });

    const uploadUrl = await createUploadUrl({ objectKey: video.object_key, mimeType: video.mime_type });
    res.status(201).json({
      video_id: video.id,
      upload_url: uploadUrl,
      method: "PUT",
      headers: { "Content-Type": video.mime_type || "application/octet-stream" },
      object_key: video.object_key,
      expires_in: 900
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/videos/:videoId/complete-upload", async (req, res, next) => {
  try {
    const videoResult = await query("select * from lesson_videos where id = $1", [req.params.videoId]);
    const video = videoResult.rows[0];
    if (!video) return res.status(404).json({ error: "video not found" });
    const teacherId = await getTeacherId(req);
    if (video.teacher_id !== teacherId) return res.status(403).json({ error: "无权访问该视频" });

    await assertObjectExists(video.object_key);
    const task = await withTransaction(async (client) => {
      await client.query(`
        update lesson_videos
        set upload_status = 'uploaded', processing_status = 'queued', updated_at = now()
        where id = $1
      `, [video.id]);
      await client.query("update lessons set status = 'processing', updated_at = now() where id = $1", [video.lesson_id]);
      const created = await client.query(`
        insert into analysis_tasks (lesson_id, video_id, status, progress, current_step)
        values ($1, $2, 'queued', 0, 'queued')
        returning *
      `, [video.lesson_id, video.id]);
      const workflow = await createQueuedWorkflowRun(client, {
        lessonId: video.lesson_id,
        videoId: video.id,
        taskId: created.rows[0].id,
        retryCount: 0,
        reason: "upload_completed"
      });
      return { task: created.rows[0], workflow };
    });

    res.status(202).json({ task_id: task.task.id, workflow_run_id: task.workflow.id, status: task.task.status });
  } catch (error) {
    next(error);
  }
});

app.post("/api/videos/:videoId/audio-upload-url", async (req, res, next) => {
  try {
    const videoResult = await query("select * from lesson_videos where id = $1", [req.params.videoId]);
    const video = videoResult.rows[0];
    if (!video) return res.status(404).json({ error: "video not found" });
    const teacherId = await getTeacherId(req);
    if (video.teacher_id !== teacherId) return res.status(403).json({ error: "无权访问该视频" });

    const mimeType = req.body?.mime_type || "audio/wav";
    const objectKey = audioObjectKey({
      teacherId,
      lessonId: video.lesson_id,
      taskId: video.id
    });
    const updated = await query(`
      update lesson_videos
      set audio_bucket = $2,
          audio_object_key = $3,
          audio_mime_type = $4,
          audio_upload_status = 'pending',
          updated_at = now()
      where id = $1
      returning *
    `, [video.id, config.r2.bucket, objectKey, mimeType]);
    const uploadUrl = await createUploadUrl({ objectKey, mimeType });
    res.status(201).json({
      video_id: updated.rows[0].id,
      upload_url: uploadUrl,
      method: "PUT",
      headers: { "Content-Type": mimeType },
      object_key: objectKey,
      expires_in: 900
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/videos/:videoId/complete-audio-upload", async (req, res, next) => {
  try {
    const videoResult = await query("select * from lesson_videos where id = $1", [req.params.videoId]);
    const video = videoResult.rows[0];
    if (!video) return res.status(404).json({ error: "video not found" });
    const teacherId = await getTeacherId(req);
    if (video.teacher_id !== teacherId) return res.status(403).json({ error: "无权访问该视频" });
    if (!video.audio_object_key) return res.status(400).json({ error: "还没有创建音频上传地址" });

    await assertObjectExists(video.audio_object_key);
    const updated = await query(`
      update lesson_videos
      set audio_upload_status = 'uploaded',
          updated_at = now()
      where id = $1
      returning *
    `, [video.id]);
    res.json({ video_id: updated.rows[0].id, audio_upload_status: updated.rows[0].audio_upload_status });
  } catch (error) {
    next(error);
  }
});

app.post("/api/videos/:videoId/retry-processing", async (req, res, next) => {
  try {
    const videoResult = await query("select * from lesson_videos where id = $1", [req.params.videoId]);
    const video = videoResult.rows[0];
    if (!video) return res.status(404).json({ error: "video not found" });
    const teacherId = await getTeacherId(req);
    if (video.teacher_id !== teacherId) return res.status(403).json({ error: "无权访问该视频" });

    await assertObjectExists(video.object_key);
    const task = await withTransaction(async (client) => {
      await client.query(`
        update lesson_videos
        set upload_status = 'uploaded', processing_status = 'queued', error_message = null, updated_at = now()
        where id = $1
      `, [video.id]);
      await client.query("update lessons set status = 'processing', updated_at = now() where id = $1", [video.lesson_id]);
      const previous = await client.query(`
        select coalesce(max(retry_count), 0) as retry_count
        from analysis_tasks
        where video_id = $1
      `, [video.id]);
      const retryCount = Number(previous.rows[0]?.retry_count || 0) + 1;
      const created = await client.query(`
        insert into analysis_tasks (lesson_id, video_id, status, progress, current_step, retry_count)
        values ($1, $2, 'queued', 0, 'queued', $3)
        returning *
      `, [video.lesson_id, video.id, retryCount]);
      const workflow = await createQueuedWorkflowRun(client, {
        lessonId: video.lesson_id,
        videoId: video.id,
        taskId: created.rows[0].id,
        retryCount,
        reason: "retry_processing"
      });
      return { task: created.rows[0], workflow };
    });

    res.status(202).json({
      task_id: task.task.id,
      workflow_run_id: task.workflow.id,
      status: task.task.status,
      resume_from: resumeStepForVideo(video)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/lessons/:lessonId/status", async (req, res, next) => {
  try {
    const lesson = await query("select * from lessons where id = $1", [req.params.lessonId]);
    const teacherId = await getTeacherId(req);
    if (lesson.rows[0]) assertLessonOwner(lesson.rows[0], teacherId);
    const task = await query(`
      select * from analysis_tasks
      where lesson_id = $1
      order by created_at desc
      limit 1
    `, [req.params.lessonId]);
    const workflow = await query(`
      select * from workflow_runs
      where lesson_id = $1
      order by created_at desc
      limit 1
    `, [req.params.lessonId]);
    const workflowSteps = workflow.rows[0] ? await query(`
      select *
      from workflow_step_runs
      where workflow_run_id = $1
      order by created_at
    `, [workflow.rows[0].id]) : { rows: [] };
    res.json({
      lesson: lesson.rows[0] || null,
      task: task.rows[0] || null,
      workflow: workflow.rows[0] || null,
      steps: makeStepStatus(task.rows[0], workflow.rows[0], workflowSteps.rows),
      resume: makeResumeState({ lesson: lesson.rows[0], task: task.rows[0], workflow: workflow.rows[0] })
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/lessons/:lessonId", async (req, res, next) => {
  try {
    const lesson = (await query("select * from lessons where id = $1", [req.params.lessonId])).rows[0];
    if (!lesson) return res.status(404).json({ error: "lesson not found" });
    const teacherId = await getTeacherId(req);
    assertLessonOwner(lesson, teacherId);

    const videos = (await query("select * from lesson_videos where lesson_id = $1 order by created_at desc", [lesson.id])).rows;
    const video = videos[0] || null;
    const sections = (await query("select * from lesson_sections where lesson_id = $1 order by start_ms", [lesson.id])).rows;
    const transcriptSegments = (await query("select * from transcript_segments where lesson_id = $1 order by start_ms", [lesson.id])).rows;
    const evidenceCards = (await query("select * from evidence_cards where lesson_id = $1 order by created_at", [lesson.id])).rows;
    const playbackUrl = video?.object_key ? await createReadUrl({ objectKey: video.object_key }) : null;

    res.json({ lesson, video, playback_url: playbackUrl, sections, transcript_segments: transcriptSegments, evidence_cards: evidenceCards });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/sections/:sectionId", async (req, res, next) => {
  try {
    const { edited_summary_text, tags, review_status = "已校订" } = req.body || {};
    const teacherId = await getTeacherId(req);
    const hasText = Object.prototype.hasOwnProperty.call(req.body || {}, "edited_summary_text");
    const hasTags = Object.prototype.hasOwnProperty.call(req.body || {}, "tags");
    const result = await query(`
      update lesson_sections
      set edited_summary_text = case when $2 then $3 else edited_summary_text end,
          tags = case when $4 then $5 else tags end,
          review_status = $6,
          reviewed_at = now(),
          reviewer_id = $7,
          updated_at = now()
      where id = $1 and lesson_id in (select id from lessons where teacher_id = $7)
      returning *
    `, [
      req.params.sectionId,
      hasText,
      hasText ? String(edited_summary_text || "") : null,
      hasTags,
      hasTags ? JSON.stringify(Array.isArray(tags) ? tags : []) : null,
      review_status,
      teacherId
    ]);
    if (!result.rows[0]) return res.status(404).json({ error: "lesson section not found" });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/transcript-segments/:segmentId", async (req, res, next) => {
  try {
    const {
      original_text,
      translated_text,
      speaker_label,
      start_ms,
      end_ms
    } = req.body || {};
    const teacherId = await getTeacherId(req);
    const current = await query(`
      select s.*
      from transcript_segments s
      join lessons l on l.id = s.lesson_id
      where s.id = $1 and l.teacher_id = $2
    `, [req.params.segmentId, teacherId]);
    const segment = current.rows[0];
    if (!segment) return res.status(404).json({ error: "transcript segment not found" });

    const nextStartMs = start_ms === undefined ? segment.start_ms : Number(start_ms);
    const nextEndMs = end_ms === undefined ? segment.end_ms : Number(end_ms);
    if (!Number.isFinite(nextStartMs) || !Number.isFinite(nextEndMs) || nextStartMs < 0 || nextEndMs <= nextStartMs) {
      return res.status(400).json({ error: "时间轴范围无效" });
    }

    const result = await query(`
      update transcript_segments
      set original_text = coalesce($2, original_text),
          translated_text = coalesce($3, translated_text),
          speaker_label = coalesce($4, speaker_label),
          start_ms = $5,
          end_ms = $6,
          source = 'human_reviewed',
          reviewed_at = now(),
          reviewer_id = $7,
          updated_at = now()
      where id = $1
      returning *
    `, [
      req.params.segmentId,
      original_text === undefined ? null : String(original_text),
      translated_text === undefined ? null : String(translated_text),
      speaker_label === undefined ? null : String(speaker_label),
      nextStartMs,
      nextEndMs,
      teacherId
    ]);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/lessons/:lessonId/rebuild-sections", async (req, res, next) => {
  try {
    const lesson = (await query("select * from lessons where id = $1", [req.params.lessonId])).rows[0];
    if (!lesson) return res.status(404).json({ error: "lesson not found" });
    const teacherId = await getTeacherId(req);
    assertLessonOwner(lesson, teacherId);

    const video = (await query("select * from lesson_videos where lesson_id = $1 order by created_at desc limit 1", [lesson.id])).rows[0];
    if (!video) return res.status(404).json({ error: "video not found" });

    const transcriptRows = (await query(`
      select *
      from transcript_segments
      where lesson_id = $1 and video_id = $2
      order by start_ms
    `, [lesson.id, video.id])).rows;
    if (!transcriptRows.length) return res.status(400).json({ error: "还没有可重建的逐字稿" });

    const sections = buildLessonSections(transcriptRows.map((segment) => ({
      startMs: segment.start_ms,
      endMs: segment.end_ms,
      speakerLabel: segment.speaker_label,
      originalText: segment.original_text,
      translatedText: segment.translated_text,
      confidence: segment.confidence
    })));

    const saved = await withTransaction(async (client) => {
      await client.query("delete from lesson_sections where lesson_id = $1 and video_id = $2", [lesson.id, video.id]);
      const rows = [];
      for (const section of sections) {
        const inserted = await client.query(`
          insert into lesson_sections
            (lesson_id, video_id, start_ms, end_ms, title, summary_text, confidence_label, tags)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning *
        `, [
          lesson.id,
          video.id,
          section.startMs,
          section.endMs,
          section.title,
          section.summaryText,
          section.confidenceLabel,
          JSON.stringify(section.tags)
        ]);
        rows.push(inserted.rows[0]);
      }
      await client.query("update lessons set updated_at = now() where id = $1", [lesson.id]);
      return rows;
    });

    res.json({ sections: saved });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/evidence-cards/:cardId/review", async (req, res, next) => {
  try {
    const { review_status, edited_conclusion, teacher_note } = req.body || {};
    const teacherId = await getTeacherId(req);
    const result = await query(`
      update evidence_cards
      set review_status = coalesce($2, review_status),
          edited_conclusion = coalesce($3, edited_conclusion),
          teacher_note = coalesce($4, teacher_note),
          updated_at = now()
      where id = $1 and lesson_id in (select id from lessons where teacher_id = $5)
      returning *
    `, [req.params.cardId, review_status || null, edited_conclusion || null, teacher_note || null, teacherId]);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/lessons/:lessonId/reports", async (req, res, next) => {
  try {
    const cards = (await query(`
      select * from evidence_cards
      where lesson_id = $1 and review_status in ('已接受', '已修改')
      order by start_ms
    `, [req.params.lessonId])).rows;
    const lesson = (await query("select * from lessons where id = $1", [req.params.lessonId])).rows[0];
    if (!lesson) return res.status(404).json({ error: "lesson not found" });
    const teacherId = await getTeacherId(req);
    assertLessonOwner(lesson, teacherId);
    const sections = (await query(`
      select *
      from lesson_sections
      where lesson_id = $1
      order by start_ms
    `, [req.params.lessonId])).rows;
    const markdown = cards.length ? buildMarkdownReport(cards) : buildTranscriptReport({ lesson, sections });
    const result = await query(`
      insert into reports (lesson_id, markdown_content, generated_from)
      values ($1, $2, $3)
      returning *
    `, [req.params.lessonId, markdown, JSON.stringify(cards.map((card) => card.id))]);
    const report = result.rows[0];
    const objectKey = reportObjectKey({ teacherId, lessonId: req.params.lessonId, reportId: report.id });
    await uploadText(objectKey, markdown, "text/markdown;charset=utf-8");
    const updated = await query("update reports set export_object_key = $2 where id = $1 returning *", [report.id, objectKey]);
    res.status(201).json(updated.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/:reportId/markdown", async (req, res, next) => {
  try {
    const report = (await query("select * from reports where id = $1", [req.params.reportId])).rows[0];
    if (!report) return res.status(404).json({ error: "report not found" });
    res.type("text/markdown").send(report.markdown_content);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || "internal server error" });
});

app.listen(config.port, () => {
  console.log(`class-reflect server listening on ${config.publicBaseUrl}`);
});

async function createQueuedWorkflowRun(client, { lessonId, videoId, taskId, retryCount, reason }) {
  const created = await client.query(`
    insert into workflow_runs
      (lesson_id, video_id, task_id, workflow_type, status, progress, current_step, retry_count, input)
    values ($1, $2, $3, 'lesson_analysis', 'queued', 0, 'queued', $4, $5)
    returning *
  `, [lessonId, videoId, taskId, retryCount, JSON.stringify({ reason })]);

  for (const step of LESSON_ANALYSIS_STEPS) {
    await client.query(`
      insert into workflow_step_runs (workflow_run_id, step_key, status)
      values ($1, $2, 'waiting')
      on conflict (workflow_run_id, step_key) do nothing
    `, [created.rows[0].id, step]);
  }
  return created.rows[0];
}

function makeStepStatus(task, workflow, workflowSteps = []) {
  const order = LESSON_ANALYSIS_STEPS;
  const workflowByKey = new Map(workflowSteps.map((step) => [step.step_key, step]));
  const currentStep = workflow?.current_step || task?.current_step;
  return order.map((key) => ({
    key,
    label: stepLabel(key),
    status: workflowByKey.get(key)?.status ||
      (!task ? "waiting" : currentStep === key ? task.status : order.indexOf(key) < order.indexOf(currentStep) || task.status === "completed" ? "completed" : "waiting"),
    progress: workflowByKey.get(key)?.progress || 0,
    error_message: workflowByKey.get(key)?.error_message || null
  }));
}

function makeResumeState({ lesson, task, workflow }) {
  const failed = task?.status === "failed" || workflow?.status === "failed" || lesson?.status === "failed";
  return {
    can_retry: Boolean(failed),
    retry_label: failed ? `从「${stepLabel(workflow?.current_step || task?.current_step || "verify_upload")}」继续处理` : null,
    failed_step: workflow?.current_step || task?.current_step || null
  };
}

function resumeStepForVideo(video) {
  if (video.audio_upload_status === "uploaded") return "asr";
  if (video.upload_status === "uploaded") return "extract_audio";
  return "verify_upload";
}

function stepLabel(key) {
  return {
    verify_upload: "校验上传",
    download_video: "读取视频",
    extract_audio: "抽取音频",
    upload_audio: "保存音频",
    asr: "语音转文字",
    build_sections: "生成大段记录",
    write_transcript: "写入数据库",
    completed: "完成"
  }[key] || key || "等待";
}

function buildMarkdownReport(cards) {
  const rows = cards.map((card, index) => {
    const conclusion = card.edited_conclusion || card.conclusion;
    return `${index + 1}. ${conclusion}\n   - 时间点：${msToClock(card.start_ms)}-${msToClock(card.end_ms)}\n   - 原文依据：${card.quote_text}\n   - 建议：${card.suggestion || "建议结合课堂目标进一步复核。"}`;
  });
  return `# 课堂复盘报告\n\n## 主要发现\n\n${rows.join("\n\n") || "暂无已确认发现。"}\n\n## 边界说明\n\n本报告只基于语音转文字和时间戳，不包含视频 OCR 或画面判断。`;
}

function buildTranscriptReport({ lesson, sections }) {
  const rows = sections.map((section, index) => {
    const text = section.edited_summary_text || section.summary_text || "";
    return `## ${index + 1}. ${section.title || "课堂片段"} ${msToClock(section.start_ms)}-${msToClock(section.end_ms)}\n\n${text}`;
  });
  return `# 课堂记录报告\n\n课程：${lesson.course_title || ""}\n课题：${lesson.lesson_title || ""}\n年级/学科：${[lesson.grade, lesson.subject].filter(Boolean).join(" / ")}\n\n## 说明\n\n本报告为基础版课堂记录导出，只包含视频上传、语音转文字、时间轴分段和教师校订内容。尚未生成 AI 教学分析结论。\n\n${rows.join("\n\n") || "暂无课堂记录。"}\n\n## 产品边界\n\n本报告只基于语音转文字和时间戳，不包含视频 OCR、画面定位或学生表情/行为判断。`;
}

function msToClock(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 10) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
