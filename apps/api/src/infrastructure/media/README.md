# media infrastructure

放媒体处理工具，例如 FFmpeg 抽音频、格式转换、切片、降噪和 VAD。

这些任务耗时且可能失败，应由 pipeline 或 worker 调用，并把失败原因写回任务状态。
