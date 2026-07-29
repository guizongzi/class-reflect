import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, assertRuntimeConfig } from "./config.js";
import { query, withTransaction } from "./db.js";
import { assertObjectExists, createReadUrl, createUploadUrl, reportObjectKey, uploadText, videoObjectKey } from "./storage.js";
import { enqueueVideoProcessing } from "./processor.js";
import { assertLessonOwner, getTeacherId } from "./auth.js";
import { transcribeAudio } from "./asr.js";

assertRuntimeConfig();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", config.frontendOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-teacher-id");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(rootDir));

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
      return created.rows[0];
    });

    enqueueVideoProcessing(task.id);
    res.status(202).json({ task_id: task.id, status: task.status });
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
      return created.rows[0];
    });

    enqueueVideoProcessing(task.id);
    res.status(202).json({ task_id: task.id, status: task.status });
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
    res.json({
      lesson: lesson.rows[0] || null,
      task: task.rows[0] || null,
      steps: makeStepStatus(task.rows[0])
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
    const { edited_summary_text, tags } = req.body || {};
    const teacherId = await getTeacherId(req);
    const result = await query(`
      update lesson_sections
      set edited_summary_text = coalesce($2, edited_summary_text),
          tags = coalesce($3, tags),
          updated_at = now()
      where id = $1 and lesson_id in (select id from lessons where teacher_id = $4)
      returning *
    `, [req.params.sectionId, edited_summary_text || null, tags ? JSON.stringify(tags) : null, teacherId]);
    res.json(result.rows[0]);
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
    const markdown = buildMarkdownReport(cards);
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

function makeStepStatus(task) {
  const order = ["download_video", "extract_audio", "upload_audio", "asr", "write_transcript", "completed"];
  return order.map((key) => ({
    key,
    status: !task ? "waiting" : task.current_step === key ? "running" : order.indexOf(key) < order.indexOf(task.current_step) || task.status === "completed" ? "completed" : "waiting"
  }));
}

function buildMarkdownReport(cards) {
  const rows = cards.map((card, index) => {
    const conclusion = card.edited_conclusion || card.conclusion;
    return `${index + 1}. ${conclusion}\n   - 时间点：${msToClock(card.start_ms)}-${msToClock(card.end_ms)}\n   - 原文依据：${card.quote_text}\n   - 建议：${card.suggestion || "建议结合课堂目标进一步复核。"}`;
  });
  return `# 课堂复盘报告\n\n## 主要发现\n\n${rows.join("\n\n") || "暂无已确认发现。"}\n\n## 边界说明\n\n本报告只基于语音转文字和时间戳，不包含视频 OCR 或画面判断。`;
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
