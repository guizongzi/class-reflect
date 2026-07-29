# 课堂复盘与教学分析系统

> 文档状态：文件架构与长期架构标准。本文用于约束代码目录、分层边界、模块拆分和 M2/M3 商业化扩展方向；新增文件、迁移文件、拆分模块时应优先参考本文。当前 M1 的功能范围、验收边界、已定平台和已跑通链路仍以 `TECHNICAL_MANUAL.md` 为准。本文可以决定“文件应该放哪一层”，但不能把登录、多租户、OCR、课件、预置组织字段等长期能力提前变成当前 M1 必做功能。

## 前后端、AI Agent 与基础设施搭建框架

# 1. 架构设计目标

系统需要同时满足四个目标：

1. **M1 可落地**：能够完整分析一节真实课堂。
2. **M2 可迭代**：能够把改进建议转成行动，并比较下一节课是否发生变化。
3. **M3 可管理**：能够管理多个课程、课堂和教师，但不在第一版过度平台化。
4. **商业化可扩展**：未来可以支持学校、教研组、多租户、套餐计费、模型切换和数据隔离。

因此，系统采用以下分层：

```text
用户交互层
Frontend
        │
        ▼
业务接口层
Backend API
        │
        ├───────────────┐
        ▼               ▼
业务流程层           AI 编排层
Workflow Engine      AI Agent Runtime
        │               │
        └───────┬───────┘
                ▼
领域数据层
PostgreSQL / Object Storage / Vector Store
                │
                ▼
外部服务层
ASR / LLM / OCR / Translation / FFmpeg / Email
```

各层职责必须严格分开：

- 前端负责展示和用户操作。
- 后端负责业务规则、权限、状态、数据和流程。
- AI Agent 负责推理、分析和内容生成。
- 外部服务负责提供基础能力。
- Workflow 负责把后端、AI 和外部服务串成可恢复的长任务。

---

# 2. 推荐技术栈总览

| 层级 | 推荐技术 | 主要语言 |
|---|---|---|
| Web 前端 | Next.js、React、TypeScript | TypeScript |
| UI 组件 | Tailwind CSS、shadcn/ui | TypeScript/CSS |
| 视频播放 | HTML5 Video、Video.js 或 HLS.js | TypeScript |
| 状态管理 | TanStack Query、Zustand | TypeScript |
| 后端 API | NestJS | TypeScript |
| 数据校验 | Zod 或 class-validator | TypeScript |
| ORM | Prisma 或 Drizzle ORM | TypeScript/SQL |
| 数据库 | PostgreSQL，初期使用 Supabase | SQL |
| 身份验证 | Supabase Auth | TypeScript |
| 对象存储 | Cloudflare R2 | S3 API |
| 后台任务 | Cloud Run Jobs | TypeScript/Python |
| 任务队列 | v1 数据库任务表；v2 Cloud Tasks/Pub/Sub | TypeScript |
| 视频处理 | FFmpeg | Shell/CLI |
| ASR | 阿里云 DashScope ASR | HTTP API |
| LLM | 通义千问兼容接口，预留多模型适配 | HTTP API |
| AI Agent | Python FastAPI，或初期 NestJS 内部 Agent 模块 | Python/TypeScript |
| Schema 校验 | Pydantic、JSON Schema | Python |
| 向量库 | v3 PostgreSQL pgvector | SQL/Python |
| 部署 | Google Cloud Run、Cloud Run Jobs | Docker/YAML |
| 日志监控 | Google Cloud Logging、OpenTelemetry | TypeScript/Python |
| CI/CD | GitHub Actions 或 Cloud Build | YAML |

## 2.1 语言选择原则

建议使用两种主语言：

```text
TypeScript：前端、业务后端、API、权限、工作流控制
Python：复杂 AI Agent、文本分析、知识图谱、模型评测
```

M1 阶段为了减少复杂度，AI Agent 可以先写在 NestJS 内部，全部使用 TypeScript。

进入 M2 或需要知识图谱、复杂评测后，再将 AI Agent Runtime 独立为 Python 服务。

不建议：

- 前端使用一种语言、API 使用 Java、Worker 使用 Go、AI 使用 Python，造成早期维护负担。
- 一开始就拆十几个微服务。
- 让 LLM 直接访问数据库或决定业务流程。

---

# 3. 仓库整体目录

推荐采用 Monorepo。

```text
classroom-analysis/
├── apps/
│   ├── web/                     # 教师端 Web 前端
│   ├── admin-web/               # 商业化管理后台，M3 启用
│   ├── api/                     # 核心业务后端 API
│   ├── worker/                  # 后台流程 Worker
│   └── agent-runtime/           # 独立 AI Agent 服务，M2/M3 启用
│
├── packages/
│   ├── ui/                      # 公共 UI 组件
│   ├── shared-types/            # 前后端共享类型
│   ├── domain/                  # 领域对象与业务规则
│   ├── api-client/              # 前端调用 API 的 SDK
│   ├── database/                # ORM Schema、Migration、Repository
│   ├── workflow-contracts/      # Worker 任务输入输出协议
│   ├── agent-contracts/         # Agent 输入输出 JSON Schema
│   ├── prompts/                 # Prompt 模板与版本
│   ├── observability/           # 日志、Tracing、Metrics
│   └── config/                  # ESLint、TSConfig 等配置
│
├── infrastructure/
│   ├── docker/
│   ├── cloud-run/
│   ├── cloud-build/
│   ├── terraform/               # M3 或商业部署使用
│   └── scripts/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── workflows/
│   ├── agents/
│   ├── deployment/
│   └── operations/
│
├── tests/
│   ├── fixtures/
│   ├── integration/
│   ├── e2e/
│   └── agent-evaluation/
│
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

推荐使用：

- `pnpm workspace`
- `Turborepo`
- 一个 GitHub 仓库
- 独立 Dockerfile
- 独立部署单元

这样早期开发集中，后续又能逐渐拆分。

---

# 4. 前端职责与目录

## 4.1 前端的职责

前端只负责用户交互，不负责核心分析。

主要职责：

- 登录与身份状态。
- 创建课程和课堂。
- 上传视频。
- 展示处理进度。
- 播放视频。
- 展示时间轴逐字稿。
- 展示中文译文。
- 编辑逐字稿和课堂记录。
- 点击证据跳转到视频时间点。
- 接受、修改或驳回证据。
- 编辑改进计划。
- 查看两次课堂对比。
- 预览和下载报告。
- 管理多门课程。

前端不应该：

- 在浏览器中直接调用 LLM。
- 把模型 API Key 放在浏览器。
- 在前端决定哪些证据可以进入报告。
- 在浏览器中执行长时间视频分析。
- 只将教师修改保存在 localStorage。
- 自己计算商业套餐权限。

## 4.2 前端目录

```text
apps/web/
├── app/
│   ├── login/
│   ├── dashboard/
│   ├── courses/
│   │   └── [courseId]/
│   ├── lessons/
│   │   └── [lessonId]/
│   │       ├── page.tsx
│   │       ├── transcript/
│   │       ├── evidence/
│   │       ├── review/
│   │       └── report/
│   ├── comparisons/
│   │   └── [comparisonId]/
│   └── settings/
│
├── components/
│   ├── video/
│   │   ├── VideoPlayer.tsx
│   │   ├── VideoTimeline.tsx
│   │   └── EvidenceMarker.tsx
│   ├── transcript/
│   │   ├── TranscriptEditor.tsx
│   │   ├── TranslationPanel.tsx
│   │   └── SectionNavigator.tsx
│   ├── evidence/
│   │   ├── EvidenceCard.tsx
│   │   └── EvidenceReviewForm.tsx
│   ├── agent/
│   │   ├── AgentChat.tsx
│   │   └── TaskProgress.tsx
│   ├── comparison/
│   └── report/
│
├── hooks/
├── services/
├── stores/
├── schemas/
└── tests/
```

## 4.3 前端技术选择

### Next.js

适合：

- 教师工作台。
- 课程列表。
- 分析页面。
- 管理后台。
- 后续 SEO 不重要，但路由、鉴权和构建体系完整。

### TanStack Query

负责服务器状态：

- 课堂信息。
- 任务进度。
- 逐字稿。
- 证据卡片。
- 报告。
- 对比结果。

### Zustand

只负责页面临时状态：

- 当前视频时间点。
- 当前选中证据。
- 编辑器是否展开。
- 页面布局状态。

数据库数据不能只放 Zustand。

### 视频播放器

M1 直接使用 HTML5 Video。

出现以下需求时再引入 Video.js 或 HLS.js：

- 多清晰度。
- HLS 流媒体。
- 大视频分段播放。
- 字幕轨。
- 更复杂时间轴插件。

---

# 5. 后端职责与目录

## 5.1 后端的职责

后端是整个系统的业务控制中心。

负责：

- 身份验证和授权。
- 组织、教师、课程、课堂的数据管理。
- 创建视频上传凭证。
- 确认上传结果。
- 创建分析工作流。
- 保存任务状态。
- 调度 Worker。
- 构建 Agent 输入。
- 校验 Agent 输出。
- 保存逐字稿、证据、复核和报告。
- 管理版本。
- 管理对比任务。
- 管理套餐、额度和成本。
- 生成签名播放与下载地址。
- 审计用户行为。

## 5.2 后端目录

```text
apps/api/src/
├── main.ts
├── app.module.ts
│
├── common/
│   ├── auth/
│   ├── guards/
│   ├── decorators/
│   ├── validation/
│   ├── errors/
│   ├── idempotency/
│   ├── logging/
│   ├── tracing/
│   └── pagination/
│
├── modules/
│   ├── users/
│   ├── organizations/
│   ├── memberships/
│   ├── courses/
│   ├── lessons/
│   ├── videos/
│   ├── uploads/
│   ├── transcripts/
│   ├── translations/
│   ├── sections/
│   ├── evidences/
│   ├── reviews/
│   ├── reports/
│   ├── improvement-plans/
│   ├── comparisons/
│   ├── knowledge-graphs/
│   ├── conversations/
│   ├── workflow-runs/
│   ├── usage/
│   ├── subscriptions/
│   └── audit-logs/
│
├── workflows/
│   ├── lesson-analysis/
│   ├── lesson-reanalysis/
│   ├── lesson-comparison/
│   ├── report-generation/
│   └── knowledge-graph-generation/
│
├── adapters/
│   ├── storage/
│   ├── queue/
│   ├── asr/
│   ├── llm/
│   ├── translation/
│   ├── ocr/
│   ├── email/
│   └── billing/
│
└── config/
```

## 5.3 后端模块边界

### Course Module

负责“同一门课”的长期容器。

例如：

```text
五年级数学
└── 分数的意义
    ├── 第一次课堂
    └── 第二次课堂
```

M2 的两次课堂对比必须建立在 Course 或 Teaching Unit 之下，不能只比较两个孤立视频。

### Lesson Module

代表一次真实课堂。

包含：

- 课堂元数据。
- 视频。
- 分析版本。
- 逐字稿。
- 证据。
- 报告。

### Improvement Plan Module

M2 核心模块。

将教师确认后的建议转为结构化行动：

```json
{
  "goal": "增加教师提问后的等待时间",
  "target_behavior": "开放问题后至少等待5秒",
  "evidence_source_ids": ["evidence-id"],
  "success_metric": {
    "metric": "average_wait_time",
    "operator": ">=",
    "target": 5,
    "unit": "seconds"
  }
}
```

### Comparison Module

比较两次课堂：

- 改进动作是否出现。
- 指标是否变化。
- 证据是否充足。
- 哪些变化可能是正向的。
- 哪些结论仍需教师确认。

### Organization 与 Membership Module

M1 可以只建立数据表和权限字段，不做复杂页面。

M3 启用：

- 学校。
- 教研组。
- 教师。
- 管理员。
- 多租户数据隔离。

---

# 6. Worker 与后台任务

## 6.1 为什么必须有 Worker

课堂视频分析包含：

- 视频下载。
- FFmpeg。
- ASR。
- 翻译。
- 多次 LLM 调用。
- 报告导出。

这些任务可能运行数分钟，不应占用 HTTP 请求。

## 6.2 Worker 目录

```text
apps/worker/src/
├── main.ts
├── workers/
│   ├── media.worker.ts
│   ├── asr.worker.ts
│   ├── translation.worker.ts
│   ├── transcript.worker.ts
│   ├── analysis.worker.ts
│   ├── comparison.worker.ts
│   ├── report.worker.ts
│   ├── graph.worker.ts
│   ├── export.worker.ts
│   └── cleanup.worker.ts
│
├── workflow/
│   ├── runner.ts
│   ├── step-registry.ts
│   ├── retry-policy.ts
│   └── idempotency.ts
│
└── adapters/
```

## 6.3 完整课堂分析工作流

```text
VERIFY_UPLOAD
→ EXTRACT_MEDIA
→ TRANSCRIBE
→ DETECT_LANGUAGE
→ TRANSLATE_NON_CHINESE
→ NORMALIZE_TRANSCRIPT
→ BUILD_SECTIONS
→ EXTRACT_CLASSROOM_EVENTS
→ CALCULATE_RULE_METRICS
→ GENERATE_EVIDENCE
→ VALIDATE_EVIDENCE
→ READY_FOR_REVIEW
→ GENERATE_REPORT
```

换一段视频重新分析时，应创建新的：

```text
workflow_run
analysis_version
transcript_version
evidence_version
```

不能覆盖上一轮结果。

---

# 7. AI Agent 的职责与目录

## 7.1 AI Agent 的定义

AI Agent 不是整个后端。

AI Agent 只负责需要语义理解、推理或生成的部分。

后端决定：

- 什么时候调用 Agent。
- 给 Agent 哪些数据。
- 使用哪个 Prompt。
- 使用哪个模型。
- 输出存在哪里。
- 输出是否有效。
- 是否可以进入报告。

Agent 不直接管理用户、权限、数据库事务或任务状态。

## 7.2 Agent Runtime 目录

```text
apps/agent-runtime/
├── app/
│   ├── main.py
│   ├── api/
│   ├── agents/
│   │   ├── transcript_agent.py
│   │   ├── translation_review_agent.py
│   │   ├── classroom_event_agent.py
│   │   ├── pedagogy_agent.py
│   │   ├── evidence_agent.py
│   │   ├── report_agent.py
│   │   ├── improvement_agent.py
│   │   ├── comparison_agent.py
│   │   ├── knowledge_graph_agent.py
│   │   └── quality_agent.py
│   │
│   ├── orchestration/
│   │   ├── agent_runner.py
│   │   ├── model_router.py
│   │   ├── prompt_registry.py
│   │   └── retry.py
│   │
│   ├── schemas/
│   ├── validators/
│   ├── evaluation/
│   └── adapters/
│
├── prompts/
├── tests/
├── requirements.txt
└── Dockerfile
```

推荐：

- FastAPI。
- Pydantic。
- 官方模型 SDK 或标准 OpenAI-compatible SDK。
- pytest。
- JSON Schema。
- 可选 LangGraph，但 M1 不必引入复杂 Agent 框架。

## 7.3 Agent 划分

### Transcript Agent

负责：

- 修复明显断句。
- 判断课堂活动边界。
- 辅助识别教师与学生话语。
- 不改变时间轴事实。

### Translation Agent

遇到英文或其他非中文内容时：

- 保留原文。
- 生成中文译文。
- 逐段绑定相同时间点。
- 标记翻译置信度。
- 专有名词不确定时标记待确认。

数据必须保存为：

```text
original_text
translated_text
source_language
translation_status
translation_model
```

不能用中文译文覆盖英文原文。

### Classroom Event Agent

提取：

- 教师讲授。
- 教师提问。
- 学生回答。
- 教师反馈。
- 课堂练习。
- 总结。
- 技术中断。
- 活动转换。

### Pedagogy Agent

根据事件和指标生成谨慎判断。

负责：

- 等待时间。
- 连续讲授。
- 问题类型。
- 反馈类型。
- 总结闭环。
- 学习证据是否出现。

不负责给教师打总分。

### Evidence Agent

把判断变成证据卡片：

```json
{
  "claim": "教师提问后的等待时间较短",
  "start_ms": 680000,
  "end_ms": 690000,
  "quote": "……",
  "metric": {
    "name": "wait_time",
    "value": 2.1,
    "unit": "seconds"
  },
  "confidence": "needs_review"
}
```

### Improvement Agent

M2 启用。

将教师确认的建议转成：

- 下一轮动作。
- 可观察行为。
- 目标指标。
- 复查条件。
- 可比较维度。

### Comparison Agent

M2 启用。

输入：

- 第一次课堂的确认证据。
- 改进计划。
- 第二次课堂的事实和证据。
- 两轮结构化指标。

输出：

- 是否执行改进动作。
- 指标变化。
- 证据引用。
- 不能确定的地方。
- 教师需要确认的结论。

### Knowledge Graph Agent

扩展功能。

负责：

- 从课件和逐字稿中提取知识点。
- 提取先后、包含、因果、举例等关系。
- 每个节点绑定来源。
- 每条关系绑定证据。
- 支持教师修改和确认。

---

# 8. 规则计算与 AI 推理的边界

不能把所有事情交给 LLM。

## 8.1 后端规则引擎负责

适合确定性计算的内容：

- 提问结束到回答开始的秒数。
- 连续发言时长。
- 教师与学生话语占比。
- 每分钟问题数。
- 总结段时长。
- 不同活动时间占比。
- 两次课堂指标差值。

这些应通过代码计算。

建议使用：

```text
TypeScript Domain Rules
或
Python pandas / NumPy
```

## 8.2 AI Agent 负责

适合语义判断的内容：

- 一个句子是不是教学提问。
- 问题是开放式还是封闭式。
- 教师反馈是否具体。
- 一段话是不是课堂总结。
- 改进建议如何表达得具体、克制。
- 两轮变化具有怎样的教学意义。

正确链路：

```text
ASR 原始事实
→ Agent 提取事件
→ 后端计算指标
→ Agent 解释指标
→ 生成证据
→ 教师确认
```

---

# 9. 数据层设计

## 9.1 核心领域关系

```text
Organization
└── User
    └── Course
        └── TeachingUnit
            ├── Lesson 1
            │   ├── Video
            │   ├── Transcript
            │   ├── Evidence
            │   └── Report
            │
            ├── ImprovementPlan
            │
            └── Lesson 2
                ├── Video
                ├── Transcript
                ├── Evidence
                └── Report

Lesson 1 + ImprovementPlan + Lesson 2
                    │
                    ▼
               Comparison
```

## 9.2 主要数据表

M1：

- users
- organizations
- memberships
- courses
- teaching_units
- lessons
- lesson_videos
- workflow_runs
- workflow_step_runs
- transcript_versions
- transcript_segments
- transcript_translations
- lesson_sections
- classroom_events
- evidence_cards
- evidence_reviews
- reports
- report_evidence_refs

M2：

- improvement_plans
- improvement_actions
- comparison_runs
- comparison_metrics
- comparison_findings

M3：

- course_groups
- organization_reports
- report_templates
- subscriptions
- usage_records
- quotas
- audit_logs

扩展：

- source_documents
- knowledge_nodes
- knowledge_edges
- knowledge_evidence_refs
- graph_versions

---

# 10. 外部服务职责

## 10.1 Supabase

负责：

- PostgreSQL。
- 用户登录。
- Session。
- 基础 RLS。

不负责：

- 课堂分析流程。
- 视频处理。
- Agent 编排。
- 商业业务规则。

## 10.2 Cloudflare R2

负责保存：

```text
原始视频
抽取音频
关键帧
课件
报告导出文件
知识图谱导出文件
```

后端数据库只保存 object key，不保存永久公开地址。

## 10.3 阿里云 ASR

负责：

- 文件转写。
- 时间点。
- 可选说话人识别。

后端负责：

- 提交。
- 轮询。
- 下载。
- 标准化。
- 重试。
- 入库。

## 10.4 翻译服务

翻译是可选 Tool，不是 Agent，也不默认强制翻译整节课。M1 采用“系统识别可翻译片段，教师点击后生成译文”的方式；演示时可以点击翻译至少一个英文片段来证明能力。

可选方案：

1. 直接使用 LLM 翻译。
2. 阿里云机器翻译。
3. 组合方式：机器翻译初稿，LLM 根据课堂语境校正。

M1 推荐直接使用 LLM，减少服务数量，但必须保留 Translation Provider 接口，便于后续替换为专业翻译 API。

对大量商业化调用，可在 M2/M3 切换为专业翻译 API 以降低成本。

## 10.5 FFmpeg

负责：

- 音频抽取。
- 音频标准化。
- 视频元数据读取。
- 关键帧抽取。
- 预览视频生成。

FFmpeg 是本地执行工具，不属于 AI Agent。

## 10.6 LLM Provider

必须通过统一适配器调用：

```text
LLMAdapter
├── DashScopeAdapter
├── OpenAIAdapter
├── AnthropicAdapter
└── PrivateModelAdapter
```

业务代码不能直接绑定某一个模型供应商。

---

# 11. M1、M2、M3 模块启用范围

## M1：完整分析一节课

必须启用：

### 前端

- 登录。
- 创建课堂。
- 视频上传。
- 任务进度。
- 视频播放器。
- 带时间点逐字稿。
- 英文原文与中文译文。
- 证据卡片。
- 人工修改确认。
- 报告预览与导出。
- 更换视频后重新建立分析版本。

### 后端

- Lesson。
- Video。
- Upload。
- Workflow。
- Transcript。
- Translation。
- Evidence。
- Review。
- Report。
- Versioning。

### Worker

- Media。
- ASR。
- Translation。
- Analysis。
- Report。
- Export。

### Agent

- Transcript Agent。
- Translation Agent。
- Classroom Event Agent。
- Pedagogy Agent。
- Evidence Agent。
- Report Agent。
- Quality Agent。

---

## M2：第二轮改进比较

新增：

### 前端

- 改进计划编辑。
- 第二轮课堂绑定。
- 两轮对比页面。
- 指标变化展示。
- 证据并排播放。
- 对比结论确认。

### 后端

- Teaching Unit。
- Improvement Plan。
- Comparison Run。
- Comparison Metrics。
- Comparison Findings。
- 版本关联。

### Agent

- Improvement Agent。
- Comparison Agent。

### 规则引擎

- 两轮指标标准化。
- 相同指标比较。
- 改进动作命中检测。
- 变化幅度计算。

---

## M3：多课程管理

新增：

### 前端

- 课程列表。
- 多课堂筛选。
- 教师趋势页面。
- 汇总报告。
- 组织管理后台。

### 后端

- Organization。
- Membership。
- Course Group。
- Aggregation。
- Organization Report。
- Subscription。
- Usage。
- Quota。
- Audit Log。

### 商业化

- 按课堂次数计费。
- 按视频分钟数计费。
- 按教师席位计费。
- 套餐额度。
- 超额限制。
- 学校私有部署。
- 数据保留策略。

---

## 扩展：脑图与知识图谱

新增：

### 前端

- 脑图画布。
- 知识图谱画布。
- 点击节点回到原文。
- 节点和关系编辑。
- 教师确认状态。

推荐技术：

- React Flow：适合可编辑脑图和知识关系。
- Cytoscape.js：适合复杂知识图谱。
- D3.js：适合高度定制，但研发成本较高。

### 后端

- Source Document。
- Knowledge Node。
- Knowledge Edge。
- Evidence Reference。
- Graph Version。

### AI Agent

- Knowledge Extraction Agent。
- Relation Agent。
- Graph Quality Agent。

每个节点必须有：

```json
{
  "label": "分数单位",
  "type": "concept",
  "source_refs": [
    {
      "source_type": "transcript",
      "start_ms": 680000,
      "end_ms": 702000
    }
  ],
  "review_status": "pending"
}
```

---

# 12. 可扩展性设计

## 12.1 模块化单体优先

M1 使用模块化单体：

```text
一个 API 服务
一个 Worker 镜像
一个数据库
一个 Agent 模块
```

但代码边界按照未来服务边界组织。

不要一开始拆微服务。

## 12.2 数据版本化

以下数据都不能直接覆盖：

- 逐字稿。
- 翻译。
- 课堂分段。
- Agent 分析。
- 证据。
- 教师复核。
- 报告。
- 改进计划。
- 对比结果。
- 知识图谱。

每次重新分析都创建版本。

## 12.3 Provider Adapter

所有外部能力通过 Adapter：

```text
StorageProvider
ASRProvider
LLMProvider
TranslationProvider
OCRProvider
ExportProvider
NotificationProvider
```

这样商业化后可以：

- 根据客户地区切换服务。
- 根据价格切换模型。
- 为学校部署私有模型。
- 发生供应商故障时降级。

## 12.4 Prompt 版本化

每次 Agent 调用记录：

- Agent 名称。
- Prompt 版本。
- 模型。
- 温度。
- 输入摘要。
- 输出 Schema 版本。
- Token 消耗。
- 耗时。
- 成本。
- 是否人工修改。

否则后续无法解释不同时间生成结果为什么不同。

---

# 13. 商业化必须提前预留的能力

即使 M1 不提供收费页面，数据模型也要预留：

## 租户隔离

所有核心表包含：

```text
organization_id
created_by
```

## 用量统计

记录：

- 上传视频分钟数。
- ASR 分钟数。
- 翻译字符数。
- LLM Token。
- 报告数量。
- 导出次数。
- 存储容量。

## 套餐与额度

```text
Plan
Subscription
UsageRecord
Quota
BillingPeriod
```

## 数据安全

- 私有对象存储。
- 短期签名 URL。
- 组织级权限。
- 操作审计。
- 数据删除。
- 数据导出。
- 保留周期。
- 敏感日志脱敏。
- 不在 LLM 日志中保存完整课堂内容。

## 企业部署

后续应支持：

```text
公有 SaaS
学校独立租户
学校专属数据库
客户私有云
本地化部署
```

因此不能把 Supabase、R2 或某一个 LLM 的调用写死在领域业务中。

---

# 14. 推荐实施形态

## M1 实际部署

```text
Next.js Web
        │
NestJS API
        │
PostgreSQL + Supabase Auth
        │
Cloud Run Job Worker
        │
R2 + FFmpeg + 阿里云 ASR + 通义千问
```

AI Agent 暂时放在 NestJS 或 Worker 中。

## M2 建议部署

```text
Next.js Web
        │
NestJS API
        │
Cloud Tasks / Pub/Sub
        │
Worker Services
        │
Python Agent Runtime
```

将 Agent 与业务后端分离。

## M3 商业化部署

```text
Web / Admin Web
        │
API Gateway
        │
Business API
        ├── Workflow Workers
        ├── Agent Runtime
        ├── Usage & Billing
        └── Organization Analytics
```

同时增加：

- Redis。
- OpenTelemetry。
- 告警。
- 成本监控。
- 多租户配额。
- 自动扩容。
- 基础设施即代码。

---

# 15. 最终技术选择结论

## 前端

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
Zustand
React Hook Form
Zod
```

## 后端

```text
NestJS
TypeScript
PostgreSQL
Prisma 或 Drizzle
Supabase Auth
Cloud Tasks/Pub/Sub（M2）
```

## Worker

```text
TypeScript
Cloud Run Jobs
FFmpeg
```

复杂媒体和算法处理增加后，可局部使用 Python。

## AI Agent

M1：

```text
TypeScript
结构化 Prompt
JSON Schema
LLM Adapter
```

M2 以后：

```text
Python
FastAPI
Pydantic
pytest
可选 LangGraph
```

## 数据与存储

```text
Supabase PostgreSQL
Cloudflare R2
pgvector（扩展阶段）
```

## 基础设施

```text
Google Cloud Run
Cloud Run Jobs
Cloud Build 或 GitHub Actions
Secret Manager
Cloud Logging
Docker
Terraform（M3）
```

这套方案的核心不是技术越多越好，而是：

```text
前端负责交互
后端负责规则和数据
Workflow 负责流程
Worker 负责长任务
Agent 负责推理
外部服务负责原子能力
教师负责最终确认
```

这个边界在 M1 就建立起来，M2、M3 和知识图谱扩展才不会推倒重来。
