# 架构说明

> 文档状态：当前架构速览。M1 产品边界、数据库、Agent/Tool/Worker 分工以 `TECHNICAL_MANUAL.md` 为准；文件架构和长期分层标准以 `ARCHITECTURE_BASELINE.md` 为准。本文用于快速理解当前代码真实落点和线上部署口径。

## 1. 当前技术选型

当前项目已经收敛到正式 pnpm Workspace + Turborepo 骨架，不再扩张 `legacy/node-mvp`。

| 层 | 当前实现 |
| --- | --- |
| 前端 | `apps/web`，Next.js + React + TypeScript |
| API | `apps/api`，NestJS + TypeScript |
| Worker | `apps/worker`，TypeScript Worker，可本地常驻运行，也可由 Cloud Run Job 执行 |
| 数据库 | Supabase PostgreSQL，通过 `packages/database` 访问 |
| 对象存储 | Cloudflare R2，通过 `packages/providers` 生成签名 URL 和对象访问地址 |
| ASR / LLM | 阿里云 DashScope 兼容接口，通过 `packages/providers` 适配 |
| 部署 | Google Cloud Build + Cloud Run API/Web + Cloud Run Job Worker |

`legacy/node-mvp` 只作为迁移参考，不承载正式功能。

## 2. 目录与职责

```text
apps/
  web/                 课堂视频库、上传工作台、视频播放、时间轴文稿、证据复核、报告编辑
  api/                 NestJS API、上传签名、状态查询、人工确认、复核和报告接口
  worker/              workflow 认领、并发轮询、ASR、逐字稿处理、指标、证据、报告 processor

packages/
  shared-types/        课堂类型、workflow step、证据、报告等共享类型
  api-contracts/       API 请求契约
  domain/              课堂、报告等纯业务规则
  database/            Supabase/PostgreSQL repository
  providers/           R2、ASR、LLM、翻译等外部服务适配
  agents/              逐字稿处理 Agent、教学证据生成 Agent
  metrics/             不依赖 LLM 的课堂指标计算
  guardrails/          证据来源和输出校验
  config/              环境变量和 Secret 配置读取
  observability/       结构化日志

infra/
  docker/              API/Web 镜像构建文件
  google-cloud/        Cloud Build 部署配置

docs/                  产品、架构、Agent 和运行手册
legacy/                旧跑通链路归档，仅用于参考
```

## 3. 分层原则

| 层 | 放什么 | 不放什么 |
| --- | --- | --- |
| `apps/web` | 页面交互、上传进度、播放器控制、时间轴展示、用户确认动作 | Secret、ASR/LLM 直连、最终数据可信判断 |
| `apps/api` | 短请求、签名 URL、状态查询、人工确认、复核写回、报告手动生成 | 长耗时视频处理、模型提示词策略 |
| `apps/worker` | 认领任务、执行 processor、控制并发、记录步骤状态 | 页面状态推断、用户界面逻辑 |
| `packages/database` | 数据库读写和事务语义 | Controller 内散落 SQL |
| `packages/providers` | R2、ASR、LLM、翻译等服务适配 | 课堂业务判断 |
| `packages/agents` | Agent 输入输出、提示/规则、教学证据与逐字稿处理 | 数据库连接、HTTP 路由 |
| `packages/metrics` | 可确定计算的课堂指标 | LLM 结论 |
| `packages/guardrails` | 证据必须有来源、适用课堂类型、置信度等校验 | 生成新内容 |

## 4. 当前真实链路

```text
web 选择或拖入课堂视频
→ web 强制选择课堂类型
→ api 创建 lesson 和 video 记录
→ api 生成 Cloudflare R2 视频上传签名 URL
→ web 直传视频到 R2 并显示上传进度
→ web 同时从视频生成 ASR 用音频并上传到 R2
→ api 确认视频和音频对象，创建或唤醒 workflow
→ worker 本地常驻或 Cloud Run Job 认领 queued workflow
→ worker 检查媒体对象
→ worker 调用 ASR 并保存带时间点逐字稿
→ 逐字稿处理 Agent 生成展示投影和分析投影
→ worker 写入 lesson_sections，并在“校订原文”阶段等待教师确认
→ web 展示视频、分段时间轴和当前段落文稿，教师可保存修改
→ 教师点击“确认校订完成”
→ worker 继续计算非 LLM 指标、识别课堂事件、生成教学证据
→ web 人工复核证据，接受或驳回后卡片从待处理列表消失
→ worker / api 基于已接受证据生成 Markdown 报告
```

当前优先路径是“R2 原视频归档 + 浏览器音频通道”。如果音频缺失，worker 目前会标记需要回退能力；后续再补 worker 端 FFmpeg 抽音频。

## 5. Workflow 步骤

统一步骤定义在 `packages/shared-types/src/index.ts`：

```text
create_lesson
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

前端顶部展示 6 个大阶段：

```text
对话发起 → 处理过程 → 校订原文 → 核对证据 → 人工复核 → 生成报告
```

右侧处理卡片只展示当前大阶段的小步骤，避免把已完成的大阶段继续堆在页面上。

## 6. 人工关口和回退语义

当前流程有两个明确人工关口：

- 校订原文：`build_sections` 完成后 workflow 进入 `waiting_for_human`，右侧显示“确认校订完成”。教师确认后，系统才继续计算指标、生成事件和证据。
- 人工复核：`wait_human_review` 阶段等待教师处理证据。接受、驳回、需更多上下文后，前端会从待处理列表移除对应证据卡。

回退规则：

- 从“校订原文”或更早阶段重跑，会作废后续大段记录、指标、事件、证据和报告。
- 从“核对证据”阶段重跑，会作废后续指标、事件、证据和报告，并重新分析当前校订文本。
- 从“人工复核”阶段重跑，不重新生成证据，但会把已有证据恢复为待处理，并清理教师复核痕迹。
- 从“生成报告”阶段重跑，只作废报告，保留已复核证据。

## 7. Agent 边界

### 逐字稿处理 Agent

文档：`docs/逐字稿处理 Agent 文档 .md`

职责：

- 接收 ASR 原始逐字稿。
- 生成展示投影：给前端显示和教师修改。
- 生成分析投影：给后续指标、事件和证据 Agent 使用。
- 每个片段标题必须有教学含义，不使用“课堂片段 17”这类无信息标题。
- 用户保存的校订内容必须参与后续分析。

### 教学证据生成 Agent

文档：`docs/教学证据生成 Agent 文档.md`

职责：

- 基于逐字稿、课堂事件和确定性指标生成候选证据。
- 每张证据必须有原文、时间点、来源记录和适用课堂类型。
- 区分积极、中性、消极证据。
- 内部判断规则不能直接外显给教师，必须转译成教师可理解的观察、亮点或建议。

## 8. 非 LLM 指标

不需要交给 LLM 的分析放在 `packages/metrics`，包括：

- 语速：有效字数或词数 / 发言分钟。
- 教师连续讲授时长。
- 长停顿。
- 教师问题数量。
- 问题后等待时间。
- 学生回答或齐答。
- 教师反馈类型。
- 课堂结构时间分布。
- 填充词、笼统理解检查、模糊指代。
- 信息密度提示。

这些指标可作为证据 Agent 的输入，但不由 LLM 负责计算。

## 9. 部署架构

Google Cloud Build 触发器必须使用：

```text
infra/google-cloud/cloudbuild.yaml
```

不能继续使用“自动检测根目录 Dockerfile”，否则可能只更新单个旧服务，导致线上 Web/API/Worker 不一致。

当前部署目标：

| 目标 | 名称 | 说明 |
| --- | --- | --- |
| API | `class-reflect-api` | NestJS API |
| Web | `class-reflect-web` | Next.js 前端 |
| Worker | `class-reflect-worker` | Cloud Run Job，用 API 镜像执行 worker 命令 |

API 和 Worker 使用同一组后端 Secret。Web 通过 `API_BASE_URL` 或构建期 `NEXT_PUBLIC_API_BASE_URL` 指向 API 服务。

## 10. 扩展原则

- API 服务只处理短请求和状态查询。
- 长任务进入 Worker 或 Cloud Run Job。
- 视频、音频、导出文件存对象存储，数据库只保存元数据、状态和可追溯结构化结果。
- workflow 是流程状态源，前端永远从状态接口推导阶段。
- 外部平台都走 `packages/providers`，替换供应商不改业务层。
- AI 负责辅助生成和判断；最终可追溯数据、状态和复核结果必须写回数据库。
