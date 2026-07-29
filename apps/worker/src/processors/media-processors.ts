import { getLessonVideoRecord } from "@class-reflect/database";
import type { ProcessorContext, ProcessorResult, WorkflowProcessor } from "./types";

export const probeMediaProcessor: WorkflowProcessor = {
  stepKey: "probe_media",
  async run(context: ProcessorContext): Promise<ProcessorResult> {
    const video = await getLessonVideoRecord(context.workflow.videoId);
    if (!video) throw new Error(`视频记录不存在：${context.workflow.videoId}`);
    return {
      output: {
        mimeType: video.mimeType,
        fileSize: video.fileSize,
        hasUploadedAudio: video.audioUploadStatus === "uploaded",
        hasUploadedVideo: video.uploadStatus === "uploaded"
      }
    };
  }
};
