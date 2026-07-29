# 课堂复盘与教学分析系统技术手册

> 文档状态：当前 M1 技术手册。本文以最新版 `ARCHITECTURE_BASELINE.md` 的前后端与分层架构为准，并结合当前仓库已经切换后的正式骨架编写。Baseline 负责长期目录和架构边界；本文负责 M1 当前要实现什么、各层怎么协作、上线和验收按什么检查。

## 1. 当前技术栈

M1 正式骨架采用：

```text
pnpm Workspace + Turborepo
Next.js + React + TypeScript 前端
NestJS + TypeScript 主业务 API
独立 TypeScript Worker
共享 packages 分层
M2/M3 可选 Python AI Runtime
```

旧的 Node/Express + Vite 速成验证版已经归档到 `legacy/node-mvp`，只作为迁移 R2、Supabase、阿里云 ASR、Cloud Run 已跑通逻辑的参考，不再作为正式入口扩张。

## 2. M1 产品边界

M1 只聚焦一条真实课堂视频复盘链路：

```text
教师上传课堂视频
→ 选择课堂类型
→ API 创建课堂和处理任务
→ 视频持久保存到 Cloudflare R2
→ 音频通道并行生成或 Worker 回退抽取
→ 阿里云 ASR 生成带时间点逐字稿
→ 合并为 3-5 分钟大段课堂记录
→ 教师直接编辑大段文本
→ 按需点击翻译
→ AI 生成候选证据
→ 教师接受、修改或驳回
→ 报告只使用已确认内容
```

M1 不做：

- 正式登录、多用户、多租户、组织权限和计费；
- 课件上传与课件分析；
- 视频 OCR、画面框选、学生注意力识别和情绪识别；
- 教师自动评分、教师排名、学校管理后台；
- 完整 RAG、知识图谱、长期教师画像；
- 实时直播分析。

无登录不等于无安全边界。M1 仍必须保证：

- 原始视频放在私有 R2；
- 播放或下载使用短期签名 URL；
- API Key 只放后端或 Google Secret Manager；
- 数据库存对象地址和状态，不存视频二进制；
- 删除课堂时同步删除或标记删除对象文件；
- 页面提示当前是单工作空间，不支持多人数据隔离。

## 3. 仓库结构

当前正式目录遵循 baseline：

```text
apps/
  web/          Next.js 产品前端
  api/          NestJS 主业务 API
  worker/       TypeScript 后台任务
  ai-runtime/   M2/M3 可选 Python AI 服务

packages/
  shared-types/     跨端基础类型
  api-contracts/    API 请求与响应 Schema
  database/         数据库 Schema、迁移、Repository 基础
  domain/           核心领域对象与业务规则
  prompts/          Agent Prompt 与版本
  agents/           Agent 逻辑
  metrics/          确定性课堂指标
  guardrails/       AI 输出与教学边界校验
  providers/        ASR、LLM、翻译、存储适配器
  observability/    日志、Tracing、成本记录
  config/           共享配置校验
  ui/               共享 UI 组件
  eslint-config/    统一代码规范

infra/
  docker/
  google-cloud/

legacy/
  node-mvp/         旧速成版，仅作迁移参考
```

新增代码必须先判断属于哪一层。不能再把临时判断散落在页面、路由或 Worker 中。

## 4. 分层职责

| 层 | 当前职责 |
| --- | --- |
| `apps/web` | 上传、课堂库、视频工作台、进度展示、逐字稿编辑、证据复核、报告预览 |
| `apps/api` | 课堂、上传凭证、状态查询、校订、翻译、复核、报告入口 |
| `apps/worker` | 后台执行、重试、超时、日志、并发、长任务认领 |
| `packages/domain` | 课堂、逐字稿、证据、报告、工作流的纯业务规则 |
| `packages/database` | Supabase/PostgreSQL schema、migration、repository |
| `packages/providers` | R2、阿里云 ASR、LLM、翻译等第三方适配 |
| `packages/agents` | 语义分析、证据生成、报告整理等 Agent 实现 |
| `packages/metrics` | 语速、等待时间、连续讲授等确定性指标 |
| `packages/guardrails` | 证据来源、越界判断、报告准入校验 |
| `packages/api-contracts` | 前端、API、测试共用的 Zod 契约 |
| `packages/config` | `APP_CONFIG_ENV` 和环境变量解析 |
| `packages/observability` | 日志、耗时、模型调用、错误记录 |

依赖方向必须单向：

```text
web → api-contracts / shared-types / ui
api → domain / api-contracts / database / providers / observability
worker → domain / database / agents / metrics / guardrails / providers / observability
agents → domain / prompts / providers / guardrails
database → shared-types
```

禁止：

```text
apps/web → database
apps/web → providers
packages/domain → NestJS
packages/domain → 数据库 ORM
packages/metrics → LLM Provider
packages/agents → 前端组件
```

## 5. 课堂类型

视频上传后必须选择课堂类型，保存为稳定枚举：

| 数据值 | 页面名称 | M1 分析重点 |
| --- | --- | --- |
| `offline_classroom_recording` | 线下课堂录像 | 语速、连续讲授、提问、等待、学生回答、齐答、反馈 |
| `live_online_class` | 直播网课 | 语速、连麦问答、技术停顿、可听见的互动 |
| `recorded_online_class` | 录播网课 | 结构、语速、表达清晰度、信息密度、示例和总结 |

约束：

- 录播网课不分析学生参与和等待学生回答；
- 直播网课没有聊天记录时，不能把未回应判断为学生反应慢；
- 线下课堂只基于可听见语音分析，不做画面注意力判断。

## 6. 视频与音频通道

视频必须持久保存，但视频保存和音频转写应解耦并尽量并行。

```text
通道 A：浏览器直传原始视频到 R2
  用于长期归档、播放、后续复核

通道 B：浏览器生成 ASR 音频并上传到 R2
  用于更快进入 ASR

回退通道：Worker 从 R2 读取视频，用 FFmpeg 抽取音频
  用于浏览器无法生成音频或上传失败
```

原则：

- 视频对象和音频对象分开记录；
- API 不接收大文件中转；
- R2 是对象存储事实来源；
- 数据库保存对象 key、bucket、mime、size、状态、错误原因；
- Worker 后续处理从 R2 读取，不依赖教师电脑、浏览器缓存或 Cloud Run 本地目录。

## 7. 工作流

M1 使用可恢复 workflow，而不是页面里的临时流程判断。

核心状态：

```text
created
queued
running
waiting_for_human
completed
failed
cancelled
```

建议步骤：

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

每个步骤必须记录：

- `workflow_run_id`
- step name
- status
- progress
- started_at / finished_at
- error_code / error_message
- retry_count
- input object references
- output object references

失败后前端要显示失败步骤和原因，并允许从失败步骤或上一个稳定步骤重试。

## 8. Agent、Worker、Pipeline 分工

三者不能混在一个文件里。

```text
Agent Orchestrator
  负责任务决策、阶段切换、Agent 选择、追问教师、暂停等待人工复核

Worker
  负责后台执行、认领任务、重试、超时、日志、并发

Processor / Pipeline
  负责某一条具体处理链，如抽音频、提交 ASR、整理逐字稿、生成证据

Integration / Provider
  负责连接阿里云 ASR、LLM、R2、Supabase
```

Orchestrator 不做：

- 不直接调用 FFmpeg；
- 不直接拼 SQL；
- 不上传对象存储；
- 不绕过 Guardrail；
- 不自动把未审核证据写入报告。

Worker 不做：

- 不决定教学判断；
- 不决定证据是否进入报告；
- 不在一个大函数里写完整业务链路。

Processor 应该：

- 输入输出明确；
- 幂等；
- 可重试；
- 可单独测试；
- 只负责一个具体步骤。

## 9. 数据库

M1 数据库继续使用 Supabase PostgreSQL。

已实现或 M1 必须保留的核心表：

| 表 | 用途 |
| --- | --- |
| `lessons` | 课堂基本信息、课堂类型、状态 |
| `lesson_videos` 或后续 `lesson_assets` | 视频对象、音频对象、上传状态、处理状态 |
| `workflow_runs` | 一次处理流程的总状态 |
| `workflow_step_runs` | 每个步骤的状态、进度、错误 |
| `transcript_segments` | ASR 原始小段、时间点、原文、译文、校订字段 |
| `lesson_sections` | 3-5 分钟大段课堂记录和教师编辑结果 |
| `evidence_cards` | 候选证据、事实、判断、建议、复核状态 |
| `reports` | 报告 Markdown、导出对象、报告状态 |

M1 可继续使用兼容旧链路的表，但新的 repository 应收敛到 `packages/database`，API 和 Worker 不能各自手写重复 SQL。

M1 不预置：

```text
users
organizations
memberships
roles
subscriptions
tenant_id
organization_id
owner_user_id
```

等 M3 做登录、多组织和商业化时，再按 baseline 增加 identity schema。

## 10. 逐字稿与校订

ASR 负责生成带时间点的小段，逐字稿整理 Agent 或规则负责合并和标记。

M1 必须实现：

- ASR 小段写入 `transcript_segments`；
- 每段有 `start_ms`、`end_ms`、`original_text`；
- 原始文本和教师编辑文本分开保存；
- 大段记录写入 `lesson_sections`；
- 教师直接编辑大段文本，不逐句确认；
- 不需要修改的段落无需确认；
- 证据必须能回到时间点和原文。

后续增强：

- 说话人角色：教师、学生、多人、未知；
- 语言标记：中文、英文、中英混合；
- 低置信度和待复核原因；
- 分句合并或拆分；
- 学科术语标记。

## 11. 翻译

翻译默认不自动跑整节课，由教师点击触发。

支持：

- 翻译单段；
- 翻译选中片段；
- 重新翻译；
- 编辑译文；
- 可选翻译全部英文片段。

M1 使用 LLM Provider 做翻译，因为课堂文本可能有中英混合、学科术语、不完整口语和上下文指代。Provider 接口必须保留，后续可替换为专业机器翻译服务。

## 12. Metrics Engine

确定性指标不要交给 LLM 数数。

M1 优先实现：

- 语速：有效字数或词数 / 发言分钟；
- 教师连续讲授时长；
- 长停顿；
- 教师问题数量；
- 问题后等待时间；
- 学生回答或齐答；
- 教师反馈类型；
- 课堂结构时间分布；
- 填充词、笼统理解检查、模糊指代；
- 信息密度提示。

信息密度不输出黑箱总分，只输出可观察原因。

## 13. 中国课堂重点事件

课堂事件识别的是行为，不是直接评价教学质量。

重点事件：

- `teacher_question`
- `teacher_self_answer`
- `student_response`
- `choral_response`
- `individual_response`
- `teacher_feedback`
- `teacher_follow_up`
- `generic_comprehension_check`
- `specific_comprehension_check`
- `answer_replacement`
- `transfer_to_another_student`

M1 的创新点应优先围绕中国课堂高频真实问题：

- 自问自答；
- 齐答和个体回答区分；
- 笼统理解检查；
- 问题、等待、回答、反馈链；
- 结尾加速；
- 连续讲授过长；
- 可追溯证据卡；
- 教师确认后报告。

## 14. 证据与 Guardrail

每张候选证据卡必须分清：

```text
事实
判断
建议
不确定性
来源
```

核心约束：

```text
没有事实，不生成判断
没有证据，不生成结论
没有判断，不生成改进建议
不确定时，明确说不确定
```

不允许输出：

- 教师教学水平分数；
- 教师能力不足；
- 学生不认真；
- 学生没有理解；
- 教师课堂管理能力差；
- 该课堂效果优秀或不合格；
- 根据单节课进行教师排名；
- 把相关性写成因果性。

Evidence Validator 必须检查：

- `segment_id` 或 `section_id` 是否存在；
- 时间范围是否合法；
- 是否属于当前课堂；
- 引用文字是否与逐字稿一致；
- 判断是否有事实；
- 事实是否绑定指标或来源；
- 建议是否绑定判断；
- 是否引用未确认翻译；
- 是否包含不支持的分析维度；
- 是否出现空证据。

## 15. Human-in-the-Loop

教师证据审核是 workflow 的正式暂停节点。

```text
AI 生成候选证据
→ 程序 Guardrail
→ 教师审核
→ 接受 / 修改后接受 / 驳回 / 需要更多上下文
→ 报告生成
```

稳定枚举：

```text
pending_review
accepted
edited_and_accepted
rejected
needs_more_context
```

证据卡操作：

- 查看来源时间点；
- 查看逐字稿；
- 查看指标；
- 展开前后文；
- 修改事实；
- 修改判断；
- 修改建议；
- 写审核备注；
- 接受；
- 驳回；
- 要求重新分析。

报告只能使用 `accepted` 和 `edited_and_accepted`。

## 16. 报告 Agent

报告 Agent 不重新分析原始逐字稿，只整理教师确认后的证据。

不允许：

- 新增未审核判断；
- 改写教师确认后的含义；
- 删除证据时间点；
- 将被驳回证据写入报告。

M1 报告结构：

```text
# 课堂复盘报告

## 1. 课堂基本信息
## 2. 本次复盘目标
## 3. 素材与分析范围
## 4. 课堂结构与关键指标
## 5. 教师确认的主要发现
## 6. 证据详情
## 7. 下一次课堂可尝试的改进
## 8. 分析限制与不确定性
```

M1 可先导出 Markdown 或 HTML，PDF 放到后续。

## 17. 前端工作区

前端采用浅色工作台，桌面和手机分工不同。

桌面端：

- 主区：视频上传、播放、时间段导航、大段课堂记录编辑；
- 右侧：AI 任务助手、阶段进度、对话、处理卡片、证据卡、报告操作。

手机端：

- 查看课堂库；
- 播放视频；
- 查看处理状态；
- 阅读逐字稿；
- 快速接受或驳回证据。

核心页面：

1. 首页课堂库：查看已有课堂视频、状态、删除记录；
2. 新建课堂：课堂标题、课堂类型、学段、学科、复盘目标、视频上传；
3. 处理进度：上传、音频、ASR、分段、指标、证据、等待审核；
4. 逐字稿：时间轴、大段编辑、原文、按需翻译、跳转视频；
5. 证据审核：待审核、已接受、已修改、已驳回、需要更多上下文；
6. 报告：预览、编辑、导出。

## 18. Observability

M1 必须有基础观测，不需要先接复杂 LLMOps 平台。

必须记录：

- workflow 哪一步失败；
- 使用哪个模型；
- Prompt 版本；
- 输入和输出 Token；
- 耗时；
- 重试次数；
- Schema 是否通过；
- 生成了多少事件；
- 生成了多少证据；
- Guardrail 驳回了多少证据。

开发环境可以增加 `/diagnostics`，展示 workflow run、agent run、当前步骤、错误信息、模型耗时和证据校验结果。普通教师不需要看到完整 Prompt 和原始模型调用内容。

## 19. Evaluation

M1 应建立 5-10 个离线评测片段：

- 正常中文讲授；
- 教师自问自答；
- 全班齐答；
- 学生个体回答；
- 提问后长等待；
- 教师泛泛表扬；
- 中英混合；
- 学生声音较弱；
- 直播网课技术中断；
- 录播课无学生互动。

分模块评测：

- 逐字稿整理：时间戳、原文保留、说话人、低置信度；
- 课堂事件：提问、自问自答、齐答、反馈、互动链；
- 证据：引用正确、事实支撑、拒绝无证据判断、无越界评价、时间点可播放；
- 翻译：原文保留、术语一致、中英混合、教师修改保存。

HITL 在线质量信号：

```text
接受率
修改后接受率
驳回率
需要更多上下文比例
平均审核时间
```

这些是产品质量信号，不能简单等同为模型准确率。

## 20. Memory 与 RAG

M1 不需要复杂 Agent Memory。

M1 只保存业务状态：

- 当前课堂；
- 复盘目标；
- 课堂类型；
- 已选择分析维度；
- 教师修改的逐字稿；
- 教师审核结果；
- 报告版本。

这些进入数据库，不需要向量化。

M1 暂时不需要完整 RAG。当前分析对象是单节课，结构化数据库查询、关键词检索、时间窗口检索比向量检索更稳定。M2 比较两轮相似教学情境时，再加入轻量语义检索；M3 结合多门课程、课件、教学规范时，再正式引入 pgvector、Hybrid Search、Metadata Filter、Reranker 和 Citation。

## 21. 部署与配置

平台分工：

| 平台 | 负责内容 |
| --- | --- |
| Supabase | PostgreSQL 数据库，保存课堂、视频元数据、逐字稿、证据、报告 |
| Cloudflare R2 | 原始视频、临时音频、导出报告文件 |
| Google Cloud | Cloud Run API、Cloud Run Web、Cloud Run Job、Cloud Build、Artifact Registry、Secret Manager、Logging |
| 阿里云 | ASR、LLM、按需翻译 |
| GitHub | 代码版本管理和线上部署源 |

Google Secret Manager 使用 `APP_CONFIG_ENV` 保存 JSON 配置。Cloud Run Service 和 Cloud Run Job 都要绑定该 Secret。

关键配置：

```text
DATABASE_URL
DIRECT_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
ASR_PROVIDER=aliyun
ALIYUN_DASHSCOPE_API_KEY
ALIYUN_ASR_MODEL=qwen3-asr-flash-filetrans
ALIYUN_ASR_BASE_URL
LLM_BASE_URL
LLM_API_KEY
LLM_MODEL
FRONTEND_ORIGIN
NEXT_PUBLIC_API_BASE_URL
```

本地开发：

```bash
pnpm install
pnpm web:dev
pnpm api:dev
pnpm worker:dev
```

检查和构建：

```bash
pnpm check
pnpm build
```

线上部署：

```bash
gcloud builds submit --config infra/google-cloud/cloudbuild.yaml
gcloud run jobs execute class-reflect-worker --region asia-southeast1 --wait
```

健康检查：

```text
https://你的-api-cloud-run-url/api/health
```

## 22. M1 验收清单

P0 必须真实实现：

- 创建课堂；
- 课堂类型选择；
- 视频上传到 R2；
- 视频对象和音频对象入库；
- 上传进度真实显示；
- 独立音频通道或 FFmpeg 回退抽音频；
- 真实 ASR；
- 带时间点逐字稿；
- 大段课堂记录；
- 逐字稿编辑保存；
- 点击翻译；
- 基础指标计算；
- 至少三类证据卡；
- 证据可回到时间点和原文；
- 接受、修改后接受、驳回；
- 报告只使用确认内容；
- 基础日志、错误提示和重试。

P1 最值得展示的创新：

- 课堂节奏曲线；
- 结尾加速提示；
- 齐答与个体回答区分；
- 笼统理解检查；
- 问题、等待、回答、反馈链；
- 信息密度提示；
- 可分析能力矩阵；
- 不确定性提示。

P2 有余力再做：

- 直播聊天记录 CSV 导入；
- 课件页关联；
- 课堂画面截图作为证据；
- 更细课堂结构；
- PDF 导出。

## 23. 最终原则

这套 M1 架构不是“很多 Agent 自主乱跑”，而是一个可控的证据生产流程：

```text
课堂任务与画像 Agent
→ 真实视频处理与 ASR
→ 逐字稿整理 Agent
→ Metrics Engine
→ 课堂事件与互动 Agent
→ 教学证据 Agent
→ 程序 Guardrail
→ 教师 Human-in-the-Loop
→ 报告 Agent
```

周边能力分类：

```text
ASR                  外部模型服务
FFmpeg               媒体工具
翻译                 点击触发 Tool
语速与等待时间        确定性 Metrics Engine
证据合法性            Validator / Guardrail
证据是否适合教学判断   Human-in-the-Loop
课堂语义分析          Agent
报告整理              Agent
任务运行与失败重试     Workflow
运行日志              Observability
质量验证              Evaluation
当前课堂上下文         业务数据库
跨资料语义检索         M2/M3 再使用 RAG
```

后续任何新增功能都必须先回答：它属于前端、API、Orchestrator、Worker、Pipeline、Provider、Infrastructure、Domain、Database、Evaluation 里的哪一层。
