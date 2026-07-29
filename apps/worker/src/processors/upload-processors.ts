import { getLessonVideoRecord } from "@class-reflect/database";
import { assertR2ObjectExists } from "@class-reflect/providers";
import type { ProcessorContext, ProcessorResult, WorkflowProcessor } from "./types";

export const uploadVideoProcessor: WorkflowProcessor = {
  stepKey: "upload_video",
  async run(context: ProcessorContext): Promise<ProcessorResult> {
    const video = await requireVideo(context.workflow.videoId);
    if (video.uploadStatus !== "uploaded") {
      throw new Error("原始视频尚未上传完成");
    }
    await assertR2ObjectExists(video.objectKey);
    return { output: { videoObjectKey: video.objectKey } };
  }
};

export const uploadAudioProcessor: WorkflowProcessor = {
  stepKey: "upload_audio",
  async run(context: ProcessorContext): Promise<ProcessorResult> {
    const video = await requireVideo(context.workflow.videoId);
    if (video.audioUploadStatus !== "uploaded" || !video.audioObjectKey) {
      return {
        output: { audioObjectKey: null, fallbackRequired: true },
        warnings: ["audio_upload_missing_worker_should_fallback"]
      };
    }
    await assertR2ObjectExists(video.audioObjectKey);
    return { output: { audioObjectKey: video.audioObjectKey, fallbackRequired: false } };
  }
};

async function requireVideo(videoId: string) {
  const video = await getLessonVideoRecord(videoId);
  if (!video) throw new Error(`视频记录不存在：${videoId}`);
  return video;
}
