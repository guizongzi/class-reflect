# 已实现功能、后端接口与 M1 验收手册

> 文档状态：当前实现核对手册。本文描述当前正式骨架中的真实能力，不把 `legacy/node-mvp` 算作现行实现。长期文件结构以 `ARCHITECTURE_BASELINE.md` 为准，产品和流程边界以 `TECHNICAL_MANUAL.md` 为准。

## 1. 当前实现总览

当前仓库已经进入正式 pnpm Workspace + Turborepo 骨架，并跑通 M1 主链路：

```text
创建课堂
→ 选择课堂类型
→ 上传视频到 R2
→ 浏览器生成音频并上传到 R2
→ Worker 调用 ASR
→ 保存逐字稿
→ 逐字稿处理 Agent 生成展示投影和分析投影
→ 校订原文并人工确认
→ 计算非 LLM 指标
→ 识别课堂事件
→ 教学证据生成 Agent 生成候选证据
→ 人工复核证据
→ 生成 Markdown 报告
```

已实现：

- 前端：`apps/web`，Next.js + React + TypeScript。
- API：`apps/api`，NestJS + TypeScript。
- Worker：`apps/worker`，支持常驻轮询和有限并发。
- 数据：`packages/database` 接入 Supabase/PostgreSQL。
- 存储：`packages/providers` 接入 Cloudflare R2 签名上传和读取。
- ASR：接入阿里云 ASR Provider，保留 mock provider 用于烟测。
- 逐字稿 Agent：生成展示投影、分析投影和有意义的分段标题。
- 教学证据 Agent：生成带来源时间点、积极/中性/消极语气分类的证据卡。
- 确定性指标：语速、连续讲授、停顿、问题、等待、反馈、填充词、模糊指代、课堂结构等。
- 人工关口：校订原文确认、证据人工复核。
- 部署：`infra/google-cloud/cloudbuild.yaml` 同时部署 API、Web、Worker Service。

当前仍待增强：

- Worker 端 FFmpeg 回退抽音频。当前优先使用浏览器生成并上传的音频。
- 删除课堂时同步清理 R2 对象。
- 批量翻译、译文人工编辑保存。
- PDF / Docx 报告导出。
- 登录、多用户、多租户和权限隔离。

## 2. 前端功能

### 2.1 页面路由

| 路由 | 文件 | 状态 |
| --- | --- | --- |
| `/` | `apps/web/src/app/page.tsx` | 入口页，进入课堂视频库 |
| `/lessons` | `apps/web/src/app/lessons/page.tsx` | 课堂视频库 |
| `/lessons/new` | `apps/web/src/app/lessons/new/page.tsx` | 新建课堂工作台 |
| `/lessons/[lessonId]` | `apps/web/src/app/lessons/[lessonId]/page.tsx` | 指定课堂工作台 |

### 2.2 课堂视频库

文件：

```text
apps/web/src/features/lesson-library/lesson-library.tsx
```

已实现：

- 从 `GET /api/lessons` 读取真实课堂列表。
- 显示上传状态、处理状态、当前步骤、逐字稿段数、证据数和报告数。
- 支持刷新状态。
- 支持删除课堂。
- “刷新状态”和“新建视频”平行显示。
- UI 使用面向教师的文案，不外显 R2、ASR 对象地址等系统描述。

待增强：

- 列表分页、搜索、筛选。
- 删除课堂时同步删除 R2 对象。

### 2.3 课堂工作台

文件：

```text
apps/web/src/features/lesson-workspace/lesson-workspace-shell.tsx
```

已实现：

- 视频选择、拖拽、预览和云端视频播放。
- 新建视频后必须选择课堂类型，确认后才进入上传。
- 原始视频上传进度和浏览器音频上传进度。
- 6 阶段流程条：
  - 对话发起；
  - 处理过程；
  - 校订原文；
  - 核对证据；
  - 人工复核；
  - 生成报告。
- 右侧处理卡片只展示当前大阶段的小步骤。
- 每个 workflow 步骤显示等待、排队中、进行中、成功、失败、已取消等状态。
- 支持停止、从当前阶段重试、从具体步骤重试。
- 回退重跑前弹出确认卡片，说明后续内容会作废。
- 逐字稿分段时间轴：视频下方显示分段条，拖动或点击后显示对应段落。
- 文稿编辑保存：支持保存 section 或 segment 的校订内容。
- 校订原文关口：`build_sections` 完成后停住，右侧显示“确认校订完成”按钮。
- 内容自动刷新：逐字稿、分段、证据或报告产生后，前端会自动重新读取课堂详情。
- 证据复核：证据卡可跳转视频时间点、接受、驳回或要求更多上下文；处理后从待处理列表消失。
- 报告生成和 Markdown 编辑保存。
- 右侧本地 AI 对话框占位，当前提供基于本地上下文的轻量回复，后续可接真实对话服务。

待增强：

- 移动端细节。
- 证据卡编辑后接受的完整编辑 UI。
- 批量翻译和译文保存。
- 更丰富的报告导出。

## 3. 后端接口

当前 API 位于 `apps/api`，运行时是 NestJS + Fastify。

### 3.1 健康检查

```http
GET /api/health
```

返回：

```json
{
  "ok": true,
  "service": "class-reflect-api",
  "runtime": "nestjs",
  "asr_provider": "aliyun",
  "asr_model": "fun-asr-2025-11-07"
}
```

### 3.2 创建课堂

```http
POST /api/lessons
```

请求：

```json
{
  "lessonTitle": "课堂视频复盘",
  "courseTitle": "五年级数学",
  "lessonFormat": "offline_classroom_recording",
  "subject": "数学",
  "grade": "五年级",
  "analysisGoal": "分析教师提问后的等待时间"
}
```

状态：

- 已接入 `packages/database`。
- 支持 camelCase 和部分 snake_case 兼容。
- 写入 `lessons`。

### 3.3 课堂列表

```http
GET /api/lessons
```

状态：

- 返回真实课堂列表。
- 聚合最近视频、workflow、逐字稿段数、大段记录数、证据卡数和报告数。

### 3.4 课堂详情

```http
GET /api/lessons/:lessonId
```

返回内容：

- lesson 基本信息。
- videos，含播放签名 URL 或播放错误。
- sections。
- transcriptSegments。
- evidenceCards。
- reports。

状态：

- 已接入真实数据库。
- 已支持云端视频播放 URL。

### 3.5 删除课堂

```http
DELETE /api/lessons/:lessonId
```

状态：

- 删除 lesson 记录。
- 相关数据库记录依赖外键级联。
- 尚未删除 R2 对象。

### 3.6 视频上传 URL

```http
POST /api/lessons/:lessonId/videos/upload-url
```

状态：

- 创建 video 记录。
- 生成 R2 预签名 PUT URL。
- 返回 videoId、lessonId、uploadUrl、headers。

### 3.7 视频上传完成

```http
POST /api/lessons/videos/:videoId/complete-upload
```

状态：

- 检查 R2 对象存在。
- 更新视频上传状态。
- 在视频和音频条件满足时创建或唤醒 workflow。

### 3.8 音频上传 URL

```http
POST /api/lessons/videos/:videoId/audio-upload-url
```

状态：

- 生成 ASR 用音频的 R2 预签名 PUT URL。
- 前端用浏览器生成 WAV 后上传。

### 3.9 音频上传完成

```http
POST /api/lessons/videos/:videoId/complete-audio-upload
```

状态：

- 检查音频对象存在。
- 更新音频上传状态。
- 在视频和音频条件满足时创建或唤醒 workflow。

### 3.10 获取处理状态

```http
GET /api/lessons/:lessonId/status
```

返回：

```json
{
  "task": {
    "id": "workflowRunId",
    "lessonId": "lessonId",
    "videoId": "videoId",
    "status": "running",
    "currentStep": "submit_asr",
    "progress": 26,
    "errorMessage": null
  },
  "steps": [
    {
      "stepKey": "submit_asr",
      "label": "提交转写",
      "status": "running",
      "progress": 25,
      "startedAt": "2026-07-30T10:00:00.000Z",
      "finishedAt": null
    }
  ]
}
```

状态：

- 已接入 `workflow_runs` 和 `workflow_step_runs`。
- 返回每一步开始、结束时间，前端可显示用时。

### 3.11 停止处理

```http
POST /api/lessons/:lessonId/status/cancel
```

状态：

- 将当前 workflow 标记为 cancelled。
- 取消等待、排队和运行中的步骤。

### 3.12 重试处理

```http
POST /api/lessons/:lessonId/status/retry
```

请求：

```json
{
  "fromStepKey": "wait_human_review"
}
```

状态：

- 从指定步骤回退。
- 作废对应下游产物。
- 从人工复核阶段回退时，不重新生成证据，而是把已有证据恢复为待处理，并清理教师复核痕迹。

### 3.13 确认校订完成

```http
POST /api/lessons/:lessonId/status/confirm-transcript
```

状态：

- 只在 workflow 处于 `waiting_for_human` 且当前步骤是 `build_sections` 时生效。
- 推进到 `calculate_metrics`，由 worker 继续后续分析。
- 在其他阶段调用不会误推进。

### 3.14 保存文稿校订

```http
PATCH /api/lessons/:lessonId/transcripts/sections/:sectionId
PATCH /api/lessons/:lessonId/transcripts/segments/:segmentId
```

状态：

- 保存用户校订内容。
- 后续分析读取当前校订后的展示/分析投影。

### 3.15 按需翻译

```http
POST /api/lessons/:lessonId/translate
```

状态：

- 支持 section 或 segment 翻译。
- Provider 支持 `mymemory`、`mock`、`llm`。

### 3.16 证据列表

```http
GET /api/lessons/:lessonId/evidence
```

状态：

- 返回证据卡。
- 前端兼容数据库原始 shape 和 API 映射 shape。

### 3.17 证据复核

```http
PATCH /api/lessons/:lessonId/evidence/:evidenceId/review
```

请求：

```json
{
  "status": "accepted",
  "finalFact": "...",
  "finalJudgment": "...",
  "finalSuggestion": "..."
}
```

支持状态：

```text
pending_review
accepted
edited_and_accepted
rejected
needs_more_context
```

### 3.18 报告

```http
GET /api/lessons/:lessonId/reports
POST /api/lessons/:lessonId/reports
PATCH /api/lessons/:lessonId/reports/:reportId
```

状态：

- 报告只使用 accepted 和 edited_and_accepted 证据。
- 支持 Markdown 生成、预览和编辑保存。
- R2 文件导出留作后续增强。

## 4. Worker 处理链

入口：

```text
apps/worker/src/main.ts
```

支持环境变量：

```text
WORKER_ONCE=true                 只执行一次后退出
WORKER_CONCURRENCY=3             每轮最多并发认领 3 个 workflow
WORKER_POLL_INTERVAL_MS=3000     无任务时轮询间隔
WORKER_ID=worker-name            可选 worker 标识
```

processor 顺序：

```text
upload_video
upload_audio
probe_media
submit_asr
poll_asr
persist_transcript
normalize_transcript
build_sections
calculate_metrics
detect_events
generate_evidence
validate_evidence
wait_human_review
generate_report
export_report
```

关键语义：

- `build_sections` 完成后停在校订原文确认。
- 用户确认后从 `calculate_metrics` 继续。
- `wait_human_review` 用于证据人工复核。
- worker 常驻轮询时不会因为没有任务而退出。

## 5. 数据库迁移

当前本地/线上至少需要执行：

```bash
psql "$DATABASE_URL" -f packages/database/migrations/20260730_m1_core_tables.sql
psql "$DATABASE_URL" -f packages/database/migrations/20260730_workflow_runs.sql
psql "$DATABASE_URL" -f packages/database/migrations/20260730_section_translations.sql
psql "$DATABASE_URL" -f packages/database/migrations/20260730_teaching_evidence_agent.sql
psql "$DATABASE_URL" -f packages/database/migrations/20260730_transcript_agent_projection.sql
```

Supabase 可在 SQL Editor 中按同样顺序执行。

## 6. 部署口径

Cloud Build 触发器必须选择：

```text
Cloud Build 配置文件：infra/google-cloud/cloudbuild.yaml
```

不要使用自动检测根目录 Dockerfile。当前 `cloudbuild.yaml` 会构建并部署：

| 目标 | 名称 |
| --- | --- |
| API | `class-reflect-api` |
| Web | `class-reflect-web` |
| Worker Service | `class-reflect-worker` |

生产 Secret 使用 Google Secret Manager：

```text
APP_CONFIG_ENV:latest
```

API 和 Worker 需要同一组后端 Secret；Web 需要 `API_BASE_URL` 或构建期 `NEXT_PUBLIC_API_BASE_URL` 指向 API 服务。

## 7. 当前验收口径

本地或线上完成一次真实验收时，应能验证：

- 创建课堂后必须选择课堂类型。
- 视频能上传到 R2，并能在课堂详情页播放。
- 浏览器能生成音频并上传。
- Worker 能认领 workflow，不会因为无任务自动退出。
- 处理卡片显示当前大阶段的小步骤，状态及时更新。
- “检查媒体”实际耗时可通过步骤 startedAt / finishedAt 查看。
- ASR 结果写入逐字稿。
- 逐字稿 Agent 生成有意义的片段标题，不出现“课堂片段 17”。
- 视频下方显示分段时间轴，拖到对应位置显示对应文稿。
- 校订原文阶段会停住，用户确认后才继续后续分析。
- 证据卡能跳转视频时间点。
- 接受或驳回证据后，证据卡从待处理列表消失。
- 从人工复核阶段重试时，已处理证据恢复为待处理。
- 报告只包含教师接受或修改后接受的证据。
- 前端、API、Worker、Supabase、R2、ASR 至少真实连通一次。
