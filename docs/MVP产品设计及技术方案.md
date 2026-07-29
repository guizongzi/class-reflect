# AI 课堂回放与教学分析系统 MVP 产品设计及技术方案

> 文档状态：当前 MVP 产品与技术方案。M1 功能范围、验收边界和真实链路以 `TECHNICAL_MANUAL.md` 为准；文件架构、目录分层和长期扩展标准以 `ARCHITECTURE_BASELINE.md` 为准。

## 1. MVP 目标

第一版只聚焦一节课堂视频的证据链式复盘：

```text
教师上传课堂视频
→ 选择课堂类型
→ API 创建课堂与处理任务
→ 视频进入对象存储
→ Worker 抽取或接收音频
→ ASR 生成带时间点逐字稿
→ 合并为 3-5 分钟大段课堂记录
→ 教师校订大段文本
→ 按需点击翻译
→ AI 基于逐字稿生成候选证据
→ 教师接受、修改或驳回
→ 报告只使用已确认内容
```

核心价值：每条 AI 结论都能回到视频时间点、课堂原文和教师确认记录。

## 2. 用户与真实问题

目标用户是需要复盘课堂录像的一线教师、教研员或教学发展中心工作人员。

真实困难：

- 手动看完整节课耗时太长。
- 传统听评课记录容易只写主观印象。
- 课堂视频和评价结论之间缺少可追溯证据。
- 中英混合或网课录播中，教师很难快速定位关键片段。
- 如果 AI 直接输出评价，教师不容易判断依据是否可靠。

产品成功标准：

- 更换一段真实课堂视频后，系统能重新处理并生成对应逐字稿。
- 逐字稿带时间点，可跳转或定位到视频片段。
- 教师能直接编辑大段课堂记录，而不是逐句确认。
- AI 证据必须引用原文和时间点。
- 未经教师接受或修改确认的内容不能进入报告。
- 失败时页面显示失败步骤和原因，并允许重试。

## 3. M1 范围

### 必须做

- 无登录单工作空间。
- 创建课堂。
- 视频上传到 Cloudflare R2。
- 上传后选择课堂类型：
  - 线下课堂录像；
  - 直播网课；
  - 录播网课。
- 数据库记录课堂、视频对象、处理状态和 workflow 状态。
- Worker 从 R2 读取视频或使用独立音频通道。
- FFmpeg 抽取音频或接收前端生成的音频。
- 阿里云 ASR 生成带时间点逐字稿。
- 逐字稿合并为 3-5 分钟大段课堂记录。
- 教师编辑大段课堂记录。
- 英文或中英混合片段支持按需点击翻译。
- AI 基于逐字稿生成证据卡片。
- 证据卡可回到对应时间点和原文。
- 教师接受、修改后接受、驳回证据。
- 报告只包含已接受和已修改证据。
- 支持 Markdown 报告。
- 常见失败显示原因并允许重试。

### 第一版不做

- 正式登录和多用户。
- 多租户、学校组织、权限、套餐和计费。
- 课件上传与课件分析。
- 视频画面 OCR。
- 证据画面框选。
- 学生注意力识别、情绪识别。
- 学生画像、作业、成绩接入。
- 自动给教师打分。
- 学校管理后台。
- 完整 RAG、知识图谱和长期教师画像。

## 4. 课堂类型

| 类型 | 数据值 | M1 分析重点 |
| --- | --- | --- |
| 线下课堂录像 | `offline_classroom_recording` | 语速、连续讲授、提问、等待、学生回答、齐答、反馈 |
| 直播网课 | `live_online_class` | 语速、连麦问答、技术停顿、可听见的互动 |
| 录播网课 | `recorded_online_class` | 语速、结构、表达清晰度、信息密度、示例和总结 |

录播网课不分析学生参与和等待学生回答。直播网课不能把网络延迟或未开麦直接判断为学生反应慢。

## 5. 前端交互

桌面端采用课堂工作台：

- 主区：视频上传、播放、时间段导航、大段课堂记录编辑。
- 任务助手区：进度、对话、处理卡片、证据卡片、复核操作、报告生成。

手机端重点支持：

- 查看课堂库；
- 播放视频；
- 查看处理状态；
- 快速阅读逐字稿；
- 快速接受或驳回证据。

6 步流程：

```text
对话发起
→ 处理过程
→ 校订原文
→ 核对证据
→ 人工复核
→ 生成报告
```

原文校订原则：

- 不做逐句确认。
- 系统生成大段课堂记录。
- 不需要改的段落不用点确认。
- 需要修改时直接编辑整段。
- 原始 ASR 结果和教师编辑结果分开保存。

翻译原则：

- 默认不翻译整节课。
- 系统识别英文或中英混合片段。
- 教师点击后生成中文译文。
- 教师可以编辑译文。

## 6. AI 分析范围

第一版只基于语音转文字和时间戳分析。

| 维度 | 可用证据 |
| --- | --- |
| 连续讲授 | 教师连续发言时间、段落长度 |
| 语速 | 时间窗口内有效字数或词数 |
| 提问 | 问句、引导词、追问 |
| 等待时间 | 教师提问结束到学生回答开始的间隔 |
| 自问自答 | 教师提问后很短时间内自己作答 |
| 齐答 | 全班短回应，如“是”“对” |
| 反馈 | 表扬、纠错、解释、追问、转问 |
| 课堂结构 | 导入、讲授、练习、总结时间段 |
| 课堂语言 | 填充词、笼统理解检查、模糊指代 |

不做强判断：

- 学生是否真正掌握。
- 学生注意力是否集中。
- 教师教学水平高低。
- 学科知识深度正确性判断。
- 单节课教师排名或评分。

## 7. 技术架构

MVP 使用 baseline 确定的正式骨架：

```text
pnpm Workspace + Turborepo
Next.js + React + TypeScript 前端
NestJS + TypeScript 主业务 API
独立 TypeScript Worker
packages 分层复用业务规则、类型、Provider、Agent、Metrics、Guardrail
M2/M3 可选 Python ai-runtime
```

推荐目录：

```text
apps/
  web/          Next.js 前端
  api/          NestJS 主业务 API
  worker/       后台任务与视频处理
  ai-runtime/   M2/M3 可选 Python AI 服务

packages/
  shared-types/
  api-contracts/
  database/
  domain/
  prompts/
  agents/
  metrics/
  guardrails/
  providers/
  observability/
  config/
  ui/
  eslint-config/
```

职责边界：

- 前端负责交互，不放模型 Key，不直接调用 LLM。
- API 负责业务规则、上传凭证、状态、复核、报告入口。
- Worker 负责视频处理、ASR、长任务、重试和日志。
- Agent 负责语义判断。
- Metrics 负责确定性计算。
- Guardrail 负责证据和教学边界校验。
- Providers 负责隔离 R2、阿里云 ASR、LLM、翻译。
- Database 负责 schema、migration、repository。

## 8. 平台与服务

| 平台 | 职责 |
| --- | --- |
| Supabase PostgreSQL | 保存课堂、视频对象、workflow、逐字稿、证据、复核、报告 |
| Cloudflare R2 | 保存原始视频、临时音频、导出报告 |
| Google Cloud Run | 部署 API 和 Worker Job |
| Google Secret Manager | 保存 `APP_CONFIG_ENV` |
| 阿里云 ASR | 文件转写，生成带时间点逐字稿 |
| 阿里云 LLM | 候选证据、按需翻译、报告整理 |
| GitHub | 保存代码与部署源 |

## 9. 核心数据表

M1 核心表：

- `lessons`：课堂基本信息、课堂类型、状态。
- `lesson_videos`：视频对象、音频对象、上传状态、处理状态。
- `workflow_runs`：处理流程状态源。
- `workflow_step_runs`：每个步骤状态、错误和进度。
- `transcript_segments`：ASR 原始小段、时间点、原文、译文。
- `lesson_sections`：大段课堂记录和教师编辑结果。
- `evidence_cards`：AI 候选证据、建议、复核状态。
- `reports`：Markdown 报告和导出对象。

后续补齐：

- `translations`
- `classroom_profiles`
- `classroom_events`
- `question_chains`
- `classroom_metrics`
- `evidence_sources`
- `agent_runs`
- `conversation_messages`

## 10. API 范围

```http
GET  /api/health
GET  /api/lessons
POST /api/lessons
GET  /api/lessons/{lessonId}
DELETE /api/lessons/{lessonId}

POST /api/lessons/{lessonId}/videos/upload-url
POST /api/videos/{videoId}/complete-upload
POST /api/videos/{videoId}/audio-upload-url
POST /api/videos/{videoId}/complete-audio-upload

GET  /api/lessons/{lessonId}/status
POST /api/lessons/{lessonId}/retry

PATCH /api/sections/{sectionId}
POST /api/lessons/{lessonId}/translate
POST /api/lessons/{lessonId}/analyze
PATCH /api/evidence-cards/{cardId}/review

POST /api/lessons/{lessonId}/reports
GET  /api/reports/{reportId}/markdown
```

API Contract 应进入 `packages/api-contracts`，前端、API 和测试共用同一套 Schema。

## 11. Worker 流程

```text
claim queued workflow
→ verify_upload
→ use_uploaded_audio_or_download_video
→ extract_audio
→ upload_audio
→ asr
→ build_sections
→ write_transcript
→ ready
```

每个步骤必须：

- 有明确输入输出；
- 可重试；
- 记录当前步骤；
- 记录失败原因；
- 不把整条流程写成一个不可拆的大函数。

## 12. 证据与报告规则

证据卡必须区分：

- 事实；
- 判断；
- 建议；
- 不确定性；
- 来源。

报告规则：

- 只读取已接受和已修改后接受的证据。
- 每条结论保留时间点和原文依据。
- 不引入证据之外的判断。
- 不自动评分。
- 不输出教师能力评价。
- 不把齐答解释为全班掌握。
- 不把网络延迟解释为学生反应慢。

## 13. MVP 交付标准

- 源码按 baseline 目录组织。
- README 写清楚启动方法、配置项、已完成范围。
- 数据库迁移可重复执行。
- Cloud Run API 和 Worker Job 可部署。
- 更换视频后能重新处理。
- 页面能显示处理状态和失败原因。
- 至少跑通一次真实视频上传、ASR、逐字稿、校订、证据复核、报告生成流程。
