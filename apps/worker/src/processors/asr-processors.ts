import { getLessonVideoRecord } from "@class-reflect/database";
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
  async run(): Promise<ProcessorResult> {
    throw new Error("persist_transcript processor not implemented: 需要 transcript_segments repository");
  }
};
