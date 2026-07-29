# 已实现功能、后端接口与 M1 待实现清单

> 文档状态：当前实现核对手册。本文只描述当前 GitHub `main` 已经进入正式骨架后的实际状态，不把 `legacy/node-mvp` 中的旧跑通链路算作当前新架构已实现功能。旧链路可以作为迁移参考，但后续代码应写入 `apps/*` 与 `packages/*` 的正式分层。

## 1. 当前实现总览

当前仓库已经完成的是“正式工程骨架 + 基础前后端入口 + 第一版工作台 UI 骨架”，还不是完整 M1 业务闭环。

已完成：

- Monorepo：`pnpm Workspace + Turborepo`。
- 前端：`apps/web`，Next.js + React + TypeScript。
- API：`apps/api`，NestJS + TypeScript。
- Worker：`apps/worker`，独立 TypeScript Worker 入口。
- 共享包：`packages/shared-types`、`api-contracts`、`domain`、`database`、`providers`、`agents`、`metrics`、`guardrails`、`config`、`observability` 等。
- 部署配置：Cloud Build 同时构建并部署 API、Web、Worker Job。
- 旧实现归档：旧 Node/Express + Vite 版本移动到 `legacy/node-mvp`。
- 文档：`TECHNICAL_MANUAL.md` 与 `ARCHITECTURE_BASELINE.md` 已对齐新骨架。

未完成：

- 新 NestJS API 尚未接入 Supabase、R2、阿里云 ASR、LLM。
- 新 Next.js 前端尚未真实调用上传、处理、转写、分析、复核、报告接口。
- Worker 目前是职责骨架，尚未执行真实视频处理链。
- 当前新架构中还没有完整数据库 repository、provider 实现和 processor 拆分。

## 2. 已实现前端功能

### 2.1 页面路由

| 路由 | 文件 | 当前状态 |
| --- | --- | --- |
| `/` | `apps/web/src/app/page.tsx` | 入口页，进入课堂视频库 |
| `/lessons` | `apps/web/src/app/lessons/page.tsx` | 课堂视频库页面 |
| `/lessons/new` | `apps/web/src/app/lessons/new/page.tsx` | 新建课堂工作台页面 |
| `/lessons/[lessonId]` | `apps/web/src/app/lessons/[lessonId]/page.tsx` | 指定课堂工作台页面 |

### 2.2 课堂视频库

文件：

```text
apps/web/src/features/lesson-library/lesson-library.tsx
```

已实现：

- 顶部产品标题和“上传新视频”入口。
- 课堂库空状态。
- UI 已去掉固定 demo 课堂，避免误认为有真实数据。

未实现：

- 从 API 读取真实课堂列表。
- 显示上传状态、处理状态、转写数量、报告状态。
- 删除课堂。
- 刷新状态。

### 2.3 课堂工作台

文件：

```text
apps/web/src/features/lesson-workspace/lesson-workspace-shell.tsx
```

已实现：

- 桌面端双区工作台骨架。
- 主区包含视频上传占位、课堂类型选择、课堂记录编辑区。
- 右侧包含 AI 任务助手、6 阶段进度条、处理卡片。
- 三种课堂类型显示：
  - 线下课堂录像；
  - 直播网课；
  - 录播网课。
- 大段课堂记录编辑的 UI 占位，不采用逐句确认模式。

未实现：

- 真实拖拽上传。
- 视频预览与播放。
- 前端生成音频并并行上传。
- 上传进度条。
- 轮询处理状态。
- 时间轴逐字稿展示。
- 大段记录保存。
- 按需翻译。
- 证据卡复核。
- 报告预览与导出。
- 移动端细节交互。

## 3. 已实现后端接口

当前新 API 位于：

```text
apps/api
```

运行时：

```text
NestJS + Fastify
```

### 3.1 健康检查

```http
GET /api/health
```

控制器：

```text
apps/api/src/modules/health/health.controller.ts
```

返回示例：

```json
{
  "ok": true,
  "service": "class-reflect-api",
  "runtime": "nestjs",
  "asr_provider": "aliyun",
  "asr_model": "qwen3-asr-flash-filetrans"
}
```

当前状态：

- 已实现。
- 读取 `packages/config` 的运行配置。
- 可用于 Cloud Run 健康检查和部署验证。

### 3.2 创建课堂

```http
POST /api/lessons
```

控制器：

```text
apps/api/src/modules/lessons/lessons.controller.ts
```

请求契约：

```text
packages/api-contracts/src/index.ts
CreateLessonRequestSchema
```

支持字段：

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

兼容 snake_case：

```json
{
  "lesson_title": "课堂视频复盘",
  "course_title": "五年级数学",
  "lesson_format": "offline_classroom_recording",
  "analysis_goal": "分析教师提问后的等待时间"
}
```

返回示例：

```json
{
  "id": "uuid",
  "lessonTitle": "课堂视频复盘",
  "courseTitle": "五年级数学",
  "lessonFormat": "offline_classroom_recording",
  "status": "created"
}
```

当前状态：

- 已实现基础内存式 draft 创建。
- 使用 `packages/domain` 的 `createLessonDraft`。
- 尚未写入 Supabase。

### 3.3 获取课堂列表

```http
GET /api/lessons
```

返回示例：

```json
{
  "lessons": []
}
```

当前状态：

- 已实现接口骨架。
- 当前返回空列表。
- 尚未接入 Supabase 查询。

### 3.4 获取课堂详情

```http
GET /api/lessons/:lessonId
```

返回示例：

```json
{
  "lesson": {
    "id": "lessonId",
    "lessonTitle": "课堂视频复盘",
    "lessonFormat": "offline_classroom_recording",
    "status": "created"
  },
  "sections": [],
  "transcriptSegments": [],
  "evidenceCards": []
}
```

当前状态：

- 已实现接口骨架。
- 当前返回占位课堂详情和空数组。
- 尚未读取真实课堂、视频、逐字稿、证据卡、报告。

### 3.5 获取课堂处理状态

```http
GET /api/lessons/:lessonId/status
```

控制器：

```text
apps/api/src/modules/workflows/workflows.controller.ts
```

返回示例：

```json
{
  "task": {
    "lessonId": "lessonId",
    "status": "created",
    "currentStep": "created",
    "errorMessage": null
  },
  "steps": []
}
```

当前状态：

- 已实现接口骨架。
- 当前返回 created 状态和空步骤。
- 尚未接入 `workflow_runs` 与 `workflow_step_runs`。

## 4. 已实现 API 契约与共享类型

### 4.1 课堂类型

文件：

```text
packages/shared-types/src/index.ts
packages/api-contracts/src/index.ts
```

枚举：

```text
offline_classroom_recording
live_online_class
recorded_online_class
```

已用于：

- 前端课堂类型卡片。
- 创建课堂请求校验。
- domain draft 创建。

### 4.2 复核状态

当前共享类型：

```text
pending_review
accepted
edited_and_accepted
rejected
needs_more_context
```

当前状态：

- 类型已定义。
- `ReviewEvidenceRequestSchema` 已定义。
- 新 API 尚未实现证据复核接口。

## 5. 已实现 Worker 骨架

文件：

```text
apps/worker/src/main.ts
apps/worker/src/workflows/lesson-workflow.ts
```

已实现：

- 独立 Worker 应用入口。
- 读取共享配置。
- 使用共享日志。
- 预留 lesson workflow。
- 引用了 Agent、Metrics、Guardrail 包，表达分层方向。

当前状态：

- 尚未认领数据库任务。
- 尚未调用 R2、FFmpeg、ASR。
- 尚未写入 workflow 状态。
- 尚未实现重试、超时和并发控制。

## 6. 已实现部署配置

文件：

```text
infra/google-cloud/cloudbuild.yaml
infra/docker/Dockerfile.api
infra/docker/Dockerfile.web
infra/docker/Dockerfile
```

当前 Cloud Build 目标：

```yaml
_API_SERVICE: class-reflect
_WEB_SERVICE: class-reflect-web
_WORKER_JOB: class-reflect-worker
```

部署结果应是：

| 服务 | 用途 |
| --- | --- |
| `class-reflect` | NestJS API |
| `class-reflect-web` | Next.js 前端 |
| `class-reflect-worker` | 后台任务 Job |

已实现：

- API 镜像构建与部署。
- Web 镜像构建与部署。
- Worker Job 部署。
- `APP_CONFIG_ENV` Secret 注入 API 和 Worker。

注意：

- 当前 API 根路径 `/` 不提供网页，访问 API 服务根路径可能返回 404。
- 前端网页应打开 `class-reflect-web` 的 Cloud Run URL。

## 7. legacy 中已跑通过、但待迁移的能力

旧实现已归档到：

```text
legacy/node-mvp
```

这些能力曾经跑通过或接近跑通，但当前新 Nest/Next/Worker 架构里还没有迁移完成：

- Supabase 表初始化 SQL。
- R2 预签名上传地址。
- R2 对象存在校验。
- 视频上传完成确认。
- 音频上传地址。
- 音频上传完成确认。
- Worker 从 R2 读取视频。
- FFmpeg 抽取音频。
- 阿里云 ASR 文件转写。
- 带时间点逐字稿写库。
- 大段课堂记录聚合。
- 逐字稿/大段记录编辑保存。
- 按需翻译。
- LLM 生成候选证据卡。
- 教师复核证据。
- Markdown 报告生成。
- 报告上传到 R2。

迁移原则：

- 不把 legacy 文件直接继续扩张。
- 真实能力应迁入 `apps/api`、`apps/worker`、`packages/database`、`packages/providers`、`packages/agents`、`packages/metrics`、`packages/guardrails`。

## 8. M1 待实现功能

### P0：必须实现，完成基础功能链

1. 数据库接入
   - 在 `packages/database` 定义 Supabase/PostgreSQL repository。
   - API 和 Worker 通过 repository 访问数据库。
   - 不在 controller 或 worker 中重复手写 SQL。

2. 创建课堂真实入库
   - `POST /api/lessons` 写入 `lessons`。
   - 保存课堂类型、课程、年级、学科、复盘目标。
   - `GET /api/lessons` 返回真实课堂列表。
   - `GET /api/lessons/:lessonId` 返回真实详情。

3. 视频上传链路
   - `POST /api/lessons/:lessonId/videos/upload-url` 生成 R2 预签名上传地址。
   - 前端拖入或选择视频后真实上传到 R2。
   - 显示真实上传进度。
   - `POST /api/videos/:videoId/complete-upload` 确认对象存在并创建 workflow。

4. 独立音频通道
   - 前端尽量并行生成 ASR 音频。
   - `POST /api/videos/:videoId/audio-upload-url` 生成音频上传地址。
   - `POST /api/videos/:videoId/complete-audio-upload` 确认音频对象。
   - Worker 在有音频时优先使用音频，无音频时回退 FFmpeg 抽取。

5. Workflow 状态
   - 新增或迁移 `workflow_runs`、`workflow_step_runs` repository。
   - `GET /api/lessons/:lessonId/status` 返回真实步骤。
   - 前端显示处理进度和失败原因。
   - 失败后支持重试。

6. Worker 真实处理
   - 认领 queued workflow。
   - 校验 R2 视频对象。
   - 下载视频或读取已有音频。
   - FFmpeg 抽音频。
   - 上传临时音频到 R2。
   - 调用阿里云 ASR。
   - 写入 `transcript_segments`。
   - 聚合并写入 `lesson_sections`。

7. 逐字稿与大段校订
   - 前端显示时间轴逐字稿。
   - 前端显示 3-5 分钟大段课堂记录。
   - 支持直接编辑大段文本。
   - `PATCH /api/sections/:sectionId` 保存大段编辑。
   - 保留原始 ASR，不覆盖唯一事实来源。

8. 按需翻译
   - `POST /api/lessons/:lessonId/translate`。
   - 支持翻译单段、选中片段或全部英文片段。
   - 翻译结果可编辑。

9. 基础证据生成
   - `POST /api/lessons/:lessonId/analyze`。
   - 基于逐字稿和大段记录生成候选证据卡。
   - 每张证据卡必须有来源时间点和原文。
   - 至少支持三类证据：语速/连续讲授、提问等待、自问自答或反馈。

10. 人工复核
    - `PATCH /api/evidence-cards/:cardId/review`。
    - 支持接受、修改后接受、驳回、需要更多上下文。
    - 保存教师修改内容和备注。

11. 报告生成
    - `POST /api/lessons/:lessonId/reports`。
    - 报告只使用 `accepted` 和 `edited_and_accepted` 证据。
    - 支持 Markdown 预览。
    - 可选上传导出文件到 R2。

### P1：最值得展示的创新功能

- 课堂节奏曲线。
- 结尾加速提示。
- 齐答与个体回答区分。
- 笼统理解检查。
- 问题、等待、回答、反馈链。
- 信息密度提示。
- 可分析能力矩阵。
- 不确定性提示。
- 证据卡一键跳转对应时间点。

### P2：有余力再做

- 直播聊天记录 CSV 导入。
- 课件页关联。
- 课堂画面截图作为人工辅助证据。
- 更细课堂结构。
- PDF 导出。
- 多次复盘对比。

### 暂不做

- 登录、多用户、多租户。
- 学校组织、权限、套餐和计费。
- 视频 OCR。
- 学生注意力和情绪识别。
- 自动给教师评分。
- 教师排名。
- 完整 RAG。
- 知识图谱。
- 实时直播分析。

## 9. 建议的接口补齐顺序

优先顺序应按一条功能链推进：

```text
创建课堂
→ 生成视频上传地址
→ 前端上传 R2
→ 完成上传并创建 workflow
→ Worker 转写并写库
→ 前端展示大段课堂记录
→ 保存校订
→ 生成证据
→ 教师复核
→ 生成报告
```

不要先做分散功能。M1 的价值是跑通一条真实、可恢复、可追溯的链路。

## 10. 验收口径

M1 完成时应能验证：

- 更换一个真实课堂视频后，系统重新生成对应逐字稿。
- 上传和处理状态不是写死内容。
- 失败时显示失败步骤和原因。
- 逐字稿有时间点。
- 教师可以编辑大段课堂记录。
- 证据卡能回到时间点和原文。
- 报告只包含教师确认内容。
- 前端、API、Worker、数据库、R2、ASR 至少真实连通一次。
