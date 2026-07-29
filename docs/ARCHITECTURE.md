# 架构说明

第一版只实现基础链路，但目录按可扩展产品组织。代码不能因为 MVP 小就临时堆在一起；未来新增用户系统、队列、AI Agent、报告模板、第三方平台接入时，都应该进入对应层。

## 目录

```text
apps/
  web/                 前端页面、样式和浏览器交互
  api/                 后端 API、流程编排、数据库、对象存储和外部系统适配
    src/
      app/             HTTP、任务入口、权限中间件、请求响应适配
      domain/          课堂、视频、转写、证据、报告等核心业务概念与规则
      application/     用例服务与流程编排，例如创建课堂、上传完成、重建课堂记录
      pipelines/       长流程编排，例如视频进入后并行触发上传确认、音频抽取、ASR、写库
      infrastructure/  数据库、对象存储、媒体处理、队列、缓存、日志等基础设施
      integrations/    阿里云、Cloudflare、Supabase、LLM 等外部系统适配器
      workers/         后台任务、Cloud Run Jobs、队列消费者
      shared/          错误、时间格式、配置读取、通用类型与小工具
    modules/
      auth/            用户、教师、权限与账号隔离
      uploads/         视频上传、对象存储、文件归属
      transcripts/     ASR 时间轴、课堂记录、人工校订
      analysis/        AI 教学分析、证据卡片、复核工作流
      reports/         报告生成、导出文件
docs/                  产品方案、架构说明、验收说明
infra/                 Docker、Cloud Run、Cloud Build 等部署配置
temp/                  临时测试脚本、一次性调试文件，本目录内容不进入正式链路
tests/                 后续自动化测试
```

`modules/` 是产品功能视角，方便前端、产品和评审理解；`src/` 是工程实现视角，方便长期开发维护。一个功能可以横跨多层，但每一层只做自己的事。

## 后端分层原则

| 层 | 放什么 | 不放什么 |
| --- | --- | --- |
| `app` | HTTP 路由、请求校验、响应格式、鉴权中间件 | 业务规则、云厂商 SDK 细节 |
| `domain` | 课堂、视频、转写段、证据卡片、报告的核心规则 | 数据库 SQL、fetch、S3 SDK |
| `application` | 一个用户动作对应的用例，例如“创建上传任务”“保存校订文本” | 具体 HTTP 细节、云厂商 SDK |
| `pipelines` | 多步骤长任务编排，例如视频处理、AI 分析、报告导出 | 单个底层工具实现 |
| `infrastructure` | PostgreSQL、R2、FFmpeg、队列、日志、缓存 | 产品判断、AI 提示词策略 |
| `integrations` | 阿里云 ASR、LLM、Supabase Auth、Cloudflare R2 API 适配 | 跨步骤业务流程 |
| `workers` | 后台任务入口、队列消费者、Cloud Run Jobs | 页面交互逻辑 |
| `shared` | 错误类型、时间格式、配置工具、通用校验 | 具体业务流程 |

## AI 时代的文件分类

AI 功能不应该全部塞进一个 `ai.js`。按职责拆：

- `integrations/llm`：只负责调用模型、重试、超时、模型响应解析。
- `domain/analysis`：定义什么是课堂事件、证据、结论、复核状态。
- `application/analysis`：把逐字稿变成分析任务，把教师复核写回系统。
- `pipelines/analysis`：长任务编排，例如分块、并行分析、合并证据、写库。
- `modules/analysis`：对产品侧说明这个功能模块的边界。

这样换模型、换提示词、换云服务时，不会影响上传、数据库、报告和前端流程。

## 当前真实链路

```text
web 选择视频
→ api 创建 lesson 和 video 记录
→ api 生成 Cloudflare R2 预签名上传地址
→ web 直传视频到 R2 并显示上传进度
→ api 确认对象存在并创建 workflow_run / workflow_step_runs
→ worker / Cloud Run Job 认领 queued workflow
→ worker 从 R2 读取视频
→ worker 调用 FFmpeg 抽取音频
→ worker 将临时音频上传回 R2
→ worker 调用 ASR 生成带时间点逐字稿
→ worker 将 transcript_segments 和 lesson_sections 写回 PostgreSQL
→ web 展示、编辑并保存课堂记录
→ api 导出基础课堂记录报告
```

## 视频处理应解耦

第一版已经把 API 请求与音频抽取/ASR 执行解耦。API 只创建 workflow，worker / Cloud Run Job 负责认领并执行长任务。后续可以继续把媒体处理改为更并行的通道：

```text
用户选择视频
├─ 通道 A：浏览器直传原始视频到 R2，保存长期归档和播放地址
└─ 通道 B：worker 认领 workflow，生成临时音频或接收轻量媒体任务做 ASR

流程控制器统一记录状态：
queued / verify_upload / download_video / extract_audio / upload_audio / asr / build_sections / write_transcript / ready / failed
```

后续可选优化：

- 小视频：worker 从 R2 拉取后用 FFmpeg 抽音频，简单可靠。
- 大视频：前端或边缘任务同时上传视频和音频，ASR 不必等待原视频完全入库后再开始。
- 批量高并发：Cloud Run Jobs 或队列消费者处理音频，API 只负责任务创建和状态查询。
- 专业媒体处理：独立 Python/FFmpeg worker 处理格式转换、切片、降噪、VAD。

## JS、Python、Java 和 AI 的职责判断

| 任务 | 推荐位置 | 原因 |
| --- | --- | --- |
| 页面交互、上传进度、播放器控制 | 前端 JS | 与浏览器能力强相关，响应最快 |
| 预签名上传地址、权限校验、状态保存 | 后端 API | 需要密钥和数据归属校验，不能放前端 |
| FFmpeg 抽音频、格式转换、长视频切片 | 后端 worker，Node 或 Python 均可 | 计算耗时，不应阻塞网页；Python 媒体生态更强，Node 编排更方便 |
| ASR / LLM 调用 | integrations 层 | 统一处理超时、重试、模型替换、响应解析 |
| 课堂业务规则 | domain 层 | 不依赖框架和云厂商，方便测试和复用 |
| 证据生成、报告生成 | application + pipelines | 需要串联模型、数据库、人工复核状态 |
| 强实时交互 | 前端 + 轻 API | 避免页面卡顿，后端只返回必要状态 |

原则：前端只做用户体验和轻量状态，不放密钥、不做长耗时、不承担最终数据可信来源。AI 只负责生成和辅助判断，最终可追溯数据、状态和复核结果必须写回后端。

## 后续扩展原则

- 用户系统：产品边界写入 `apps/api/modules/auth`，实现放入 `src/domain/auth`、`src/application/auth`、`src/integrations/supabase`。
- 上传和对象存储：产品边界写入 `apps/api/modules/uploads`，实现放入 `src/application/uploads`、`src/infrastructure/storage`。
- 时间轴、转写、校订：产品边界写入 `apps/api/modules/transcripts`，实现放入 `src/domain/transcripts`、`src/application/transcripts`。
- AI 分析和证据卡片：产品边界写入 `apps/api/modules/analysis`，实现放入 `src/domain/analysis`、`src/application/analysis`、`src/pipelines/analysis`，不要写规则伪结论冒充 AI。
- 报告模板和导出：产品边界写入 `apps/api/modules/reports`，实现放入 `src/domain/reports`、`src/application/reports`、`src/infrastructure/storage`。
- 临时测试脚本放入 `temp`，验证后要么删除，要么迁入正式模块或 `tests`。

## 十万级用户后的演进路径

第一版仍保持简单，但从一开始避免把路堵死：

- API 服务只处理短请求和状态查询。
- 长任务进入队列或 Cloud Run Jobs。
- 视频、音频、报告都在对象存储，数据库只保存元数据和状态。
- `analysis_tasks` 是流程状态源，前端永远从它推导阶段，不靠本地聊天记录。
- 外部平台都走 `integrations`，替换供应商不改业务层。
- 每个功能有自己的 `domain/application/pipeline` 文件，避免上千功能时互相引用成网。
