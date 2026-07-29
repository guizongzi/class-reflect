# 课堂复盘与教学分析系统架构基线

> 文档状态：文件架构与长期架构标准。本文用于约束代码目录、分层边界、模块拆分和 M2/M3 商业化扩展方向；新增文件、迁移文件、拆分模块时应优先参考本文。当前 M1 的功能范围、验收边界、已定平台和已跑通链路仍以 `TECHNICAL_MANUAL.md` 为准。本文可以决定“文件应该放哪一层”，但不能把登录、多租户、OCR、课件、预置组织字段等长期能力提前变成当前 M1 必做功能。

基于最终版规划，推荐使用 **pnpm Workspace + Turborepo 的 Monorepo**：

```
Next.js 前端
NestJS API
TypeScript Worker
共享类型与业务规则
未来可选 Python AI Runtime
```

这样既保留当前 M1 的简洁，也方便以后增加多用户、多课程、课堂对比、RAG、多模态和商业化能力。你的系统核心链路本身就是“浏览器上传 → API 创建任务 → Worker 处理视频与 ASR → AI 生成证据 → PostgreSQL 保存 → 教师审核”，因此 API 和 Worker 应从目录层面独立。

# 一、仓库顶层目录

```
classroom-review-system/
├── apps/
│   ├── web/                    # Next.js 前端
│   ├── api/                    # NestJS 主业务 API
│   ├── worker/                 # 后台任务与视频处理
│   └── ai-runtime/             # M2/M3 可选 Python AI 服务
│
├── packages/
│   ├── shared-types/           # 前后端共享类型
│   ├── api-contracts/          # API 请求与响应 Schema
│   ├── database/               # 数据库 Schema、迁移、Repository 基础
│   ├── domain/                 # 核心领域对象与业务规则
│   ├── prompts/                # Agent Prompt 与版本
│   ├── agents/                 # 可复用 Agent 核心实现
│   ├── metrics/                # 确定性课堂指标
│   ├── guardrails/             # AI 输出与教学边界校验
│   ├── providers/              # ASR、LLM、翻译、存储适配器
│   ├── observability/          # 日志、Tracing、成本记录
│   ├── config/                 # 共享配置校验
│   ├── ui/                     # 共享 UI 组件
│   └── eslint-config/          # 统一代码规范
│
├── infrastructure/
│   ├── docker/
│   ├── cloud-run/
│   ├── terraform/              # 后期可选
│   └── scripts/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── agents/
│   ├── database/
│   └── decisions/
│
├── tests/
│   ├── fixtures/
│   ├── evaluation/
│   └── e2e/
│
├── .github/
│   └── workflows/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── eslint.config.js
└── README.md
```

# 二、前端 `apps/web`

推荐使用 Next.js App Router，但按业务模块组织，不要把所有代码都堆进 `app/`。

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   │
│   │   ├── lessons/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [lessonId]/
│   │   │       ├── layout.tsx
│   │   │       ├── page.tsx
│   │   │       ├── transcript/
│   │   │       │   └── page.tsx
│   │   │       ├── analysis/
│   │   │       │   └── page.tsx
│   │   │       ├── evidence/
│   │   │       │   └── page.tsx
│   │   │       └── report/
│   │   │           └── page.tsx
│   │   │
│   │   ├── comparisons/        # M2
│   │   ├── courses/            # M3
│   │   ├── settings/           # M3
│   │   └── diagnostics/        # 开发环境
│   │
│   ├── features/
│   │   ├── lesson-create/
│   │   ├── video-player/
│   │   ├── transcript-editor/
│   │   ├── translation/
│   │   ├── processing-progress/
│   │   ├── classroom-rhythm/
│   │   ├── language-analysis/
│   │   ├── question-chain/
│   │   ├── evidence-review/
│   │   ├── report-editor/
│   │   └── ai-assistant/
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── feedback/
│   │   └── common/
│   │
│   ├── hooks/
│   │   ├── use-video-timeline.ts
│   │   ├── use-processing-events.ts
│   │   └── use-evidence-selection.ts
│   │
│   ├── stores/
│   │   ├── player.store.ts
│   │   ├── workspace.store.ts
│   │   └── evidence-filter.store.ts
│   │
│   ├── services/
│   │   ├── api-client.ts
│   │   ├── lesson-api.ts
│   │   ├── transcript-api.ts
│   │   ├── evidence-api.ts
│   │   └── report-api.ts
│   │
│   ├── lib/
│   │   ├── query-client.ts
│   │   ├── format-time.ts
│   │   └── download-file.ts
│   │
│   └── styles/
│
├── public/
├── next.config.ts
├── tsconfig.json
└── package.json
```

## 前端组织原则

`app/` 只负责：

- 路由；
- 页面入口；
- Layout；
- 页面级数据加载。

`features/` 负责真正的产品功能。

例如证据审核：

```
features/evidence-review/
├── components/
│   ├── evidence-card.tsx
│   ├── evidence-source.tsx
│   ├── evidence-editor.tsx
│   └── review-actions.tsx
├── hooks/
│   └── use-evidence-review.ts
├── api/
│   └── evidence-review.api.ts
├── model/
│   └── evidence-review.model.ts
└── index.ts
```

不要按照纯技术类型把整个项目拆成一个巨大 `components/`、一个巨大 `hooks/`。

# 三、主后端 `apps/api`

NestJS 采用“业务模块优先”，而不是简单的 controller/service 全局分类。

```
apps/api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── modules/
│   │   ├── lessons/
│   │   ├── assets/
│   │   ├── transcripts/
│   │   ├── translations/
│   │   ├── classroom-profiles/
│   │   ├── classroom-events/
│   │   ├── question-chains/
│   │   ├── metrics/
│   │   ├── evidence/
│   │   ├── reviews/
│   │   ├── reports/
│   │   ├── workflows/
│   │   ├── conversations/
│   │   └── diagnostics/
│   │
│   ├── application/
│   │   ├── commands/
│   │   ├── queries/
│   │   └── use-cases/
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── queue/
│   │   ├── storage/
│   │   ├── cache/
│   │   └── events/
│   │
│   ├── common/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   └── errors/
│   │
│   └── config/
│
├── test/
├── Dockerfile
├── nest-cli.json
├── tsconfig.json
└── package.json
```

## 单个业务模块示例

```
modules/evidence/
├── evidence.module.ts
├── evidence.controller.ts
├── evidence.service.ts
│
├── dto/
│   ├── list-evidence.dto.ts
│   ├── update-evidence.dto.ts
│   └── review-evidence.dto.ts
│
├── application/
│   ├── create-evidence.use-case.ts
│   ├── review-evidence.use-case.ts
│   └── regenerate-evidence.use-case.ts
│
├── domain/
│   ├── evidence.entity.ts
│   ├── evidence-status.ts
│   └── evidence-policy.ts
│
├── infrastructure/
│   └── evidence.repository.ts
│
└── evidence.spec.ts
```

M1 不需要严格照搬完整 DDD，但建议至少保留：

```
controller
service / use-case
repository
domain rules
dto
```

避免 Controller 直接访问数据库。

# 四、后台任务 `apps/worker`

Worker 和 API 应该独立进程、独立部署，但共享业务包。

```
apps/worker/
├── src/
│   ├── main.ts
│   ├── worker.module.ts
│   │
│   ├── queues/
│   │   ├── media.queue.ts
│   │   ├── transcript.queue.ts
│   │   ├── analysis.queue.ts
│   │   └── report.queue.ts
│   │
│   ├── processors/
│   │   ├── media/
│   │   │   ├── extract-audio.processor.ts
│   │   │   ├── probe-media.processor.ts
│   │   │   └── generate-thumbnail.processor.ts
│   │   │
│   │   ├── asr/
│   │   │   ├── submit-asr.processor.ts
│   │   │   ├── poll-asr.processor.ts
│   │   │   └── persist-transcript.processor.ts
│   │   │
│   │   ├── transcript/
│   │   │   └── normalize-transcript.processor.ts
│   │   │
│   │   ├── metrics/
│   │   │   └── calculate-metrics.processor.ts
│   │   │
│   │   ├── analysis/
│   │   │   ├── detect-events.processor.ts
│   │   │   ├── build-question-chains.processor.ts
│   │   │   └── generate-evidence.processor.ts
│   │   │
│   │   └── report/
│   │       └── generate-report.processor.ts
│   │
│   ├── workflows/
│   │   ├── lesson-analysis.workflow.ts
│   │   ├── transcript-reanalysis.workflow.ts
│   │   └── report-generation.workflow.ts
│   │
│   ├── temp-files/
│   │   ├── temp-file.service.ts
│   │   └── cleanup.service.ts
│   │
│   └── config/
│
├── Dockerfile
├── tsconfig.json
└── package.json
```

你的真实链路要求处理失败可显示原因并重新执行，因此每一个 Processor 应尽量：

- 幂等；
- 可重试；
- 输入和输出明确；
- 不把整条流程写在一个函数里；
- 记录 `workflow_run_id`；
- 记录当前步骤。

系统要求视频上传后持久保存、生成时间轴逐字稿、证据可跳转、教师可审核、报告只包含确认内容，这也说明工作流必须拆成稳定步骤。

# 五、共享领域包 `packages/domain`

这个包只放纯业务逻辑，不依赖 NestJS、Next.js 或数据库。

```
packages/domain/
├── src/
│   ├── lesson/
│   │   ├── lesson.ts
│   │   ├── lesson-status.ts
│   │   └── delivery-mode.ts
│   │
│   ├── transcript/
│   │   ├── transcript-segment.ts
│   │   └── speaker-role.ts
│   │
│   ├── evidence/
│   │   ├── evidence-card.ts
│   │   ├── evidence-status.ts
│   │   ├── evidence-source.ts
│   │   └── evidence-review-policy.ts
│   │
│   ├── workflow/
│   │   ├── workflow-status.ts
│   │   └── workflow-step.ts
│   │
│   └── report/
│       └── report-status.ts
│
├── package.json
└── tsconfig.json
```

例如审核规则：

```
export function canIncludeInReport(
  status: EvidenceReviewStatus,
): boolean {
  return (
    status === "accepted" ||
    status === "edited_and_accepted"
  );
}
```

该规则应该被 API、Worker 和测试共同使用，而不是各写一遍。

# 六、共享类型 `packages/shared-types`

只保存跨项目稳定使用的数据结构：

```
packages/shared-types/
├── src/
│   ├── lesson.ts
│   ├── transcript.ts
│   ├── classroom-event.ts
│   ├── question-chain.ts
│   ├── metric.ts
│   ├── evidence.ts
│   ├── report.ts
│   ├── workflow.ts
│   └── index.ts
```

建议区分：

```
Domain 类型
API DTO
数据库模型
前端 ViewModel
```

不要用一个 `Lesson` 类型同时代表四层数据。

# 七、API Contract `packages/api-contracts`

使用 Zod 定义请求与响应。

```
packages/api-contracts/
├── src/
│   ├── lessons/
│   │   ├── create-lesson.contract.ts
│   │   ├── get-lesson.contract.ts
│   │   └── list-lessons.contract.ts
│   │
│   ├── transcripts/
│   ├── translations/
│   ├── evidence/
│   ├── reports/
│   └── workflows/
```

示例：

```
import { z } from "zod";

export const ReviewEvidenceRequestSchema = z.object({
  status: z.enum([
    "accepted",
    "edited_and_accepted",
    "rejected",
    "needs_more_context",
  ]),
  finalFact: z.string().optional(),
  finalJudgment: z.string().optional(),
  finalSuggestion: z.string().optional(),
  reviewComment: z.string().optional(),
});

export type ReviewEvidenceRequest = z.infer<
  typeof ReviewEvidenceRequestSchema
>;
```

前端、API 和自动化测试使用同一个 Schema。

# 八、数据库包 `packages/database`

```
packages/database/
├── src/
│   ├── schema/
│   │   ├── lessons.ts
│   │   ├── lesson-assets.ts
│   │   ├── transcript-segments.ts
│   │   ├── translations.ts
│   │   ├── classroom-events.ts
│   │   ├── question-chains.ts
│   │   ├── classroom-metrics.ts
│   │   ├── evidence-cards.ts
│   │   ├── evidence-sources.ts
│   │   ├── reports.ts
│   │   ├── workflow-runs.ts
│   │   └── agent-runs.ts
│   │
│   ├── migrations/
│   ├── seeds/
│   ├── client.ts
│   └── index.ts
│
├── drizzle.config.ts
└── package.json
```

当前无登录版不要加入：

```
users
organizations
memberships
roles
subscriptions
```

但未来 M3 增加时，可以独立加入：

```
schema/identity/
├── users.ts
├── organizations.ts
├── memberships.ts
└── permissions.ts
```

而不需要修改现有课堂分析模块的大部分目录。

# 九、Agent 包 `packages/agents`

```
packages/agents/
├── src/
│   ├── core/
│   │   ├── agent.interface.ts
│   │   ├── agent-context.ts
│   │   ├── agent-result.ts
│   │   └── agent-runner.ts
│   │
│   ├── task-profile/
│   │   ├── task-profile.agent.ts
│   │   ├── task-profile.input.ts
│   │   ├── task-profile.output.ts
│   │   └── task-profile.validator.ts
│   │
│   ├── transcript-normalizer/
│   ├── classroom-event/
│   ├── teaching-evidence/
│   ├── report/
│   │
│   ├── improvement-plan/       # M2
│   ├── comparison/             # M2
│   └── knowledge-structure/    # 可选
│
├── package.json
└── tsconfig.json
```

一个 Agent 目录建议固定包含：

```
agent.ts
input.schema.ts
output.schema.ts
validator.ts
examples.ts
agent.spec.ts
```

Agent 不直接：

- 查询任意数据库；
- 修改证据审核状态；
- 上传文件；
- 调用 FFmpeg；
- 自己决定下一条后台任务。

这些由 Orchestrator 或 Use Case 控制。

# 十、Prompt 包 `packages/prompts`

Prompt 不应直接散落在 Service 字符串中。

```
packages/prompts/
├── src/
│   ├── task-profile/
│   │   ├── v1.0.0.system.md
│   │   ├── v1.0.0.user.ts
│   │   └── index.ts
│   │
│   ├── transcript-normalizer/
│   ├── classroom-event/
│   ├── teaching-evidence/
│   ├── report/
│   └── registry.ts
│
├── evaluations/
│   ├── task-profile/
│   ├── classroom-event/
│   └── teaching-evidence/
│
└── package.json
```

数据库记录：

```
agent_name
prompt_version
model_provider
model_name
```

避免线上结果无法追溯。

# 十一、指标包 `packages/metrics`

所有确定性指标独立出来，不放进 Agent。

```
packages/metrics/
├── src/
│   ├── core/
│   │   ├── metric.interface.ts
│   │   ├── metric-context.ts
│   │   └── metric-result.ts
│   │
│   ├── speech/
│   │   ├── speech-rate.metric.ts
│   │   ├── speaking-time.metric.ts
│   │   └── continuous-lecture.metric.ts
│   │
│   ├── interaction/
│   │   ├── pause.metric.ts
│   │   ├── wait-time.metric.ts
│   │   └── question-chain.metric.ts
│   │
│   ├── language/
│   │   ├── filler-word.metric.ts
│   │   ├── connector.metric.ts
│   │   └── comprehension-check.metric.ts
│   │
│   └── structure/
│       └── information-density.metric.ts
│
├── fixtures/
└── package.json
```

# 十二、Provider 包 `packages/providers`

统一隔离第三方厂商。

```
packages/providers/
├── src/
│   ├── llm/
│   │   ├── llm-provider.interface.ts
│   │   ├── dashscope.provider.ts
│   │   ├── openai.provider.ts
│   │   └── mock-llm.provider.ts
│   │
│   ├── asr/
│   │   ├── asr-provider.interface.ts
│   │   ├── aliyun-asr.provider.ts
│   │   └── mock-asr.provider.ts
│   │
│   ├── translation/
│   │   ├── translation-provider.interface.ts
│   │   └── llm-translation.provider.ts
│   │
│   └── storage/
│       ├── object-storage.interface.ts
│       └── r2-storage.provider.ts
│
└── package.json
```

业务模块只能依赖接口：

```
interface AsrProvider {
  submit(request: AsrRequest): Promise<AsrJob>;
  getResult(jobId: string): Promise<AsrResult>;
}
```

不要在业务 Service 里直接出现阿里云 SDK 细节。

# 十三、Guardrail 包

```
packages/guardrails/
├── src/
│   ├── input/
│   │   ├── recording-capability.guardrail.ts
│   │   └── analysis-dimension.guardrail.ts
│   │
│   ├── evidence/
│   │   ├── evidence-source.validator.ts
│   │   ├── timestamp.validator.ts
│   │   ├── unsupported-claim.validator.ts
│   │   └── report-eligibility.validator.ts
│   │
│   ├── teaching/
│   │   ├── scoring-language.guardrail.ts
│   │   ├── personality-judgment.guardrail.ts
│   │   ├── attention-inference.guardrail.ts
│   │   └── causality.guardrail.ts
│   │
│   └── index.ts
```

# 十四、未来 Python AI Runtime

M1 不需要创建这个项目。等真正需要本地模型、OCR、说话人分离或重排序时再增加：

```
apps/ai-runtime/
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── health.py
│   │   ├── diarization.py
│   │   ├── ocr.py
│   │   ├── embeddings.py
│   │   └── reranking.py
│   │
│   ├── services/
│   ├── models/
│   ├── schemas/
│   ├── pipelines/
│   └── observability/
│
├── tests/
├── pyproject.toml
├── Dockerfile
└── README.md
```

NestJS 是唯一对外业务入口，前端不直接访问 Python 服务。

# 十五、推荐的依赖方向

依赖必须单向：

```
apps/web
  → api-contracts
  → shared-types
  → ui

apps/api
  → domain
  → api-contracts
  → database
  → providers
  → observability

apps/worker
  → domain
  → database
  → agents
  → metrics
  → guardrails
  → providers

agents
  → domain
  → prompts
  → providers
  → guardrails

database
  → shared-types
```

禁止：

```
packages/domain → NestJS
packages/domain → 数据库 ORM
packages/metrics → LLM Provider
packages/agents → 前端
apps/web → database
apps/web → providers
```

# 十六、当前 M1 可以先落地的精简版

不必第一天就创建所有目录。当前先做：

```
apps/
├── web/
├── api/
└── worker/

packages/
├── shared-types/
├── api-contracts/
├── database/
├── prompts/
├── agents/
├── metrics/
├── guardrails/
└── providers/
```

M2 再增加：

```
packages/domain/
packages/observability/
apps/ai-runtime/
```

但从第一天开始，至少要分开：

```
API
Worker
Agent
Metrics
Provider
Prompt
Database
```

# 十七、最终推荐目录总览

```
classroom-review-system/
├── apps/
│   ├── web/                    # Next.js 产品前端
│   ├── api/                    # NestJS 业务 API
│   ├── worker/                 # BullMQ / Cloud Run 后台任务
│   └── ai-runtime/             # 后期 Python 服务
│
├── packages/
│   ├── domain/                 # 核心业务规则
│   ├── shared-types/           # 跨项目基础类型
│   ├── api-contracts/          # API Schema
│   ├── database/               # PostgreSQL / Drizzle
│   ├── agents/                 # Agent 逻辑
│   ├── prompts/                # Prompt 版本
│   ├── metrics/                # 确定性指标
│   ├── guardrails/             # AI 与证据校验
│   ├── providers/              # 外部服务适配器
│   ├── observability/          # 日志和追踪
│   ├── config/                 # 环境配置
│   └── ui/                     # 共享组件
│
├── infrastructure/
├── tests/
├── docs/
└── .github/
```

这套结构的核心不是目录数量，而是边界清楚：

> **前端负责交互，API 负责业务，Worker 负责长任务，Agent 负责语义判断，Metrics 负责确定性计算，Guardrail 负责边界校验，Provider 负责隔离供应商，数据库负责持久化，教师负责最终判断。**
