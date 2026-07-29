import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { query, withTransaction } from "./db.js";
import { config } from "./config.js";
import { transcribeAudio } from "./asr.js";
import { audioObjectKey, createReadUrl, downloadObjectToFile, uploadFile } from "./storage.js";

export function enqueueVideoProcessing(taskId) {
  setImmediate(() => {
    processVideoTask(taskId).catch((error) => {
      console.error("video processing failed", error);
    });
  });
}

export async function processVideoTask(taskId) {
  const taskResult = await query(`
    select t.*, v.teacher_id, v.object_key, v.file_name, v.mime_type
    from analysis_tasks t
    join lesson_videos v on v.id = t.video_id
    where t.id = $1
  `, [taskId]);
  const task = taskResult.rows[0];
  if (!task) throw new Error(`analysis task not found: ${taskId}`);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "class-reflect-"));
  const videoPath = path.join(tempDir, "source-video");
  const audioPath = path.join(tempDir, "audio.wav");

  try {
    await updateTask(taskId, "running", 10, "download_video");
    await downloadObjectToFile(task.object_key, videoPath);

    await updateTask(taskId, "running", 25, "extract_audio");
    await extractAudio(videoPath, audioPath);

    await updateTask(taskId, "running", 38, "upload_audio");
    const audioKey = audioObjectKey({
      teacherId: task.teacher_id,
      lessonId: task.lesson_id,
      taskId: task.id
    });
    await uploadFile(audioKey, audioPath, "audio/wav");
    const audioUrl = await createReadUrl({
      objectKey: audioKey,
      expiresIn: config.aliyun.asrFileUrlExpiresSeconds
    });

    await updateTask(taskId, "running", 50, "asr");
    const transcriptSegments = await transcribeAudio(audioPath, { audioUrl });

    await updateTask(taskId, "running", 70, "write_transcript");
    const sections = buildLessonSections(transcriptSegments);
    const evidenceCards = buildEvidenceCards({ task, transcriptSegments, sections });

    await withTransaction(async (client) => {
      await client.query("delete from transcript_segments where video_id = $1", [task.video_id]);
      await client.query("delete from lesson_sections where video_id = $1", [task.video_id]);
      await client.query("delete from evidence_cards where video_id = $1", [task.video_id]);

      for (const segment of transcriptSegments) {
        await client.query(`
          insert into transcript_segments
            (lesson_id, video_id, start_ms, end_ms, speaker_label, original_text, translated_text, confidence)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          task.lesson_id,
          task.video_id,
          segment.startMs,
          segment.endMs,
          segment.speakerLabel,
          segment.originalText,
          segment.translatedText,
          segment.confidence
        ]);
      }

      const sectionIdByIndex = new Map();
      for (const [index, section] of sections.entries()) {
        const inserted = await client.query(`
          insert into lesson_sections
            (lesson_id, video_id, start_ms, end_ms, title, summary_text, confidence_label, tags)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning id
        `, [
          task.lesson_id,
          task.video_id,
          section.startMs,
          section.endMs,
          section.title,
          section.summaryText,
          section.confidenceLabel,
          JSON.stringify(section.tags)
        ]);
        sectionIdByIndex.set(index, inserted.rows[0].id);
      }

      for (const card of evidenceCards) {
        await client.query(`
          insert into evidence_cards
            (lesson_id, video_id, task_id, section_id, evidence_type, conclusion, suggestion,
             start_ms, end_ms, quote_text, confidence_label, source_model, raw_json)
          values ($1, $2, $3, $4, 'transcript', $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          task.lesson_id,
          task.video_id,
          task.id,
          sectionIdByIndex.get(card.sectionIndex),
          card.conclusion,
          card.suggestion,
          card.startMs,
          card.endMs,
          card.quoteText,
          card.confidenceLabel,
          config.asrProvider,
          JSON.stringify(card)
        ]);
      }

      await client.query("update lessons set status = 'ready', updated_at = now() where id = $1", [task.lesson_id]);
      await client.query("update lesson_videos set processing_status = 'completed', updated_at = now() where id = $1", [task.video_id]);
    });

    await updateTask(taskId, "completed", 100, "completed");
  } catch (error) {
    await query(`
      update analysis_tasks
      set status = 'failed', error_message = $2, current_step = $3, finished_at = now()
      where id = $1
    `, [taskId, error.message, "failed"]);
    await query(`
      update lesson_videos
      set processing_status = 'failed', error_message = $2, updated_at = now()
      where id = $1
    `, [task.video_id, error.message]);
    await query("update lessons set status = 'failed', updated_at = now() where id = $1", [task.lesson_id]);
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function updateTask(taskId, status, progress, currentStep) {
  await query(`
    update analysis_tasks
    set status = $2, progress = $3, current_step = $4,
        started_at = coalesce(started_at, now()),
        finished_at = case when $2 in ('completed', 'failed') then now() else finished_at end
    where id = $1
  `, [taskId, status, progress, currentStep]);
}

function extractAudio(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, [
      "-y",
      "-i", videoPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-f", "wav",
      audioPath
    ], { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with code ${code}: ${stderr.slice(-600)}`));
    });
  });
}

function buildLessonSections(transcriptSegments) {
  if (!transcriptSegments.length) return [];
  const sections = [];
  let current = [];
  let currentStart = transcriptSegments[0].startMs;

  for (const segment of transcriptSegments) {
    const duration = segment.endMs - currentStart;
    if (current.length && duration > 5 * 60 * 1000) {
      sections.push(makeSection(current, sections.length));
      current = [];
      currentStart = segment.startMs;
    }
    current.push(segment);
  }
  if (current.length) sections.push(makeSection(current, sections.length));
  return sections;
}

function makeSection(segments, index) {
  const startMs = segments[0].startMs;
  const endMs = segments[segments.length - 1].endMs;
  const text = segments.map((segment) => `${segment.speakerLabel}：${segment.originalText}`).join(" ");
  return {
    startMs,
    endMs,
    title: inferSectionTitle(text, index),
    summaryText: text.length > 600 ? `${text.slice(0, 600)}...` : text,
    confidenceLabel: "需要复核",
    tags: []
  };
}

function inferSectionTitle(text, index) {
  if (/导入|今天|复习/.test(text)) return "导入与复习";
  if (/练习|判断|回答/.test(text)) return "课堂练习";
  if (/总结|下节课|回顾/.test(text)) return "总结与回顾";
  if (/为什么|几分之几|问题|想一想/.test(text)) return "提问与讲解";
  return `课堂片段 ${index + 1}`;
}

function buildEvidenceCards({ transcriptSegments, sections }) {
  const cards = [];
  for (let i = 0; i < transcriptSegments.length - 1; i += 1) {
    const current = transcriptSegments[i];
    const next = transcriptSegments[i + 1];
    const isQuestion = /[？?]|为什么|几分之几|想一想|请.*回答/.test(current.originalText);
    const waitMs = next.startMs - current.endMs;
    if (isQuestion && waitMs >= 0 && waitMs <= 3000) {
      cards.push({
        sectionIndex: findSectionIndex(sections, current.startMs),
        conclusion: "提问后学生思考时间不足（≤3秒）",
        suggestion: "关键问题后建议保留 3-5 秒安静思考时间，再邀请学生回答。",
        startMs: current.startMs,
        endMs: Math.max(next.endMs, current.endMs),
        quoteText: `${current.speakerLabel}：“${current.originalText}” 学生约 ${(waitMs / 1000).toFixed(1)} 秒后回应：“${next.originalText}”`,
        confidenceLabel: "需要复核"
      });
    }
  }

  if (!cards.length && transcriptSegments.length) {
    const first = transcriptSegments[0];
    cards.push({
      sectionIndex: 0,
      conclusion: "已生成课堂原文，暂未发现高置信度风险片段",
      suggestion: "建议教师先标记重点片段，再重新运行分析。",
      startMs: first.startMs,
      endMs: first.endMs,
      quoteText: first.originalText,
      confidenceLabel: "证据不足"
    });
  }
  return cards;
}

function findSectionIndex(sections, startMs) {
  const index = sections.findIndex((section) => startMs >= section.startMs && startMs <= section.endMs);
  return index === -1 ? 0 : index;
}
