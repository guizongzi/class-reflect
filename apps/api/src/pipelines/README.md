# pipelines layer

放长链路流程控制器。它们负责把多个步骤串起来，并把每一步状态写回 `analysis_tasks` 或后续任务表。

示例：

```text
video-intake pipeline:
receive_upload_completed
→ verify_object
→ extract_or_receive_audio
→ upload_audio
→ transcribe
→ write_transcript
→ build_sections
```

注意：pipeline 管流程，不写具体的 FFmpeg、R2、ASR SDK 细节。

当前 M1 的视频转写 pipeline 仍由 `apps/api/processor.js` 承担主执行器；可复用的分段规则已迁入 `lesson-sectioning.js`。后续新增翻译、证据分析、报告生成时，应新增独立 pipeline 文件，而不是继续扩大 `processor.js`。
