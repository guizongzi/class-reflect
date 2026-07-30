import { getLessonVideoRecord, saveTranscriptSegments } from "@class-reflect/database";
import { createConfiguredAsrProvider, createR2ReadUrl } from "@class-reflect/providers";
import type { ProcessorContext, ProcessorResult, WorkflowProcessor } from "./types";

export const submitAsrProcessor: WorkflowProcessor = {
  stepKey: "submit_asr",
  async run(context: ProcessorContext): Promise<ProcessorResult> {
    const video = await getLessonVideoRecord(context.workflow.videoId);
    if (!video) throw new Error(`视频记录不存在：${context.workflow.videoId}`);
    const audioObjectKey = video.audioObjectKey || video.objectKey;
    const audioUrl = await createR2ReadUrl({ objectKey: audioObjectKey, expiresInSeconds: 3600 });
    const asrProvider = createConfiguredAsrProvider();
    const segments = await asrProvider.transcribe({ audioUrl });
    return {
      output: {
        segmentCount: segments.length,
        segments,
        transcriptPreview: segments.slice(0, 3)
      }
    };
  }
};

export const pollAsrProcessor: WorkflowProcessor = {
  stepKey: "poll_asr",
  async run(): Promise<ProcessorResult> {
    return { output: { mode: "synchronous_provider" } };
  }
};

export const persistTranscriptProcessor: WorkflowProcessor = {
  stepKey: "persist_transcript",
  async run(context): Promise<ProcessorResult> {
    const submitAsrOutput = readStepOutput(context.workflow.output, "submit_asr");
    const segments = Array.isArray(submitAsrOutput.segments) ? submitAsrOutput.segments : [];
    if (!segments.length) throw new Error("ASR 没有返回可保存的逐字稿小段");

    const saved = await saveTranscriptSegments({
      lessonId: context.workflow.lessonId,
      videoId: context.workflow.videoId,
      segments: segments.map((segment) => ({
        startMs: Number((segment as Record<string, unknown>).startMs || 0),
        endMs: Number((segment as Record<string, unknown>).endMs || (segment as Record<string, unknown>).startMs || 0),
        text: String((segment as Record<string, unknown>).text || ""),
        speakerId: ((segment as Record<string, unknown>).speakerId ?? null) as string | number | null,
        speakerLabel: ((segment as Record<string, unknown>).speakerLabel ?? null) as string | null,
        confidence: (segment as Record<string, unknown>).confidence == null ? null : Number((segment as Record<string, unknown>).confidence),
        sourceMeta: ((segment as Record<string, unknown>).sourceMeta || {}) as Record<string, unknown>
      })).filter((segment) => segment.text.trim())
    });

    return {
      output: {
        persistedSegmentCount: saved.length,
        firstSegmentId: saved[0]?.id || null,
        lastSegmentId: saved[saved.length - 1]?.id || null
      }
    };
  }
};

function readStepOutput(output: Record<string, unknown>, stepKey: string): Record<string, unknown> {
  const value = output[stepKey];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
