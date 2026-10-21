# 课堂复盘工作流底座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有课堂复盘流程中落地配置快照、稳定追踪、可恢复失败路由、标注回流与冻结回归集。

**Architecture:** 扩展现有 API、Worker、PostgreSQL，工作流负责业务进度，步骤执行负责租约、尝试和幂等提交。公共配置/失败类型放在独立模块，数据库持久化与业务处理器分离。Next.js 只消费公开配置与状态 API。

**Tech Stack:** TypeScript、NestJS/Fastify、Next.js、PostgreSQL、现有 Node 测试运行器。

**Spec:** `docs/superpowers/specs/2026-10-21-workflow-foundation-design.md`

## Global Constraints

- 沿用 NestJS/Fastify API、现有 Worker、PostgreSQL、Next.js 前端；不引入第二套调度平台。
- 人工终审、lesson_format 指标白名单、场景快照和规则优先的 RAG 隔离保持有效。
- 重试沿用同一配置快照与视频 traceId；attemptId 与 runId 单独区分。
- Schema 失败输出不进入证据列表；业务拒绝不重试；暂时性服务失败持久化退避。
- 回归集冻结后数据库禁止增删改；扩充创建新版本。
- 不把 JSON object 模式称作严格 Schema；按显式模型能力选择服务端格式约束。
- 生产迁移不自动执行；不调用付费模型完成验证。

## Review Focus

- 上传重复确认与网络重送不能创建多份活跃执行或改变 traceId：任务 2 验证。
- 租约到期后旧 Worker 的结果不能覆盖新 Worker：任务 3 验证 fencing token。
- 429 的 Retry-After、半开探测并发不能造成重试风暴：任务 4 验证。
- 人工拒绝、更正和撤销后已发布样例不能继续被错误选择：任务 5 验证。
- 修改配置或场景后，恢复旧任务不能把旧内容当作新执行结果：任务 1、3、6 验证。

---

### Task 1: 配置加载、校验与执行快照

**Files:** 新建 `packages/config/src/workflow-config.ts`、`packages/config/src/workflow-config.test.ts`、`packages/config/src/workflow/*.json`；修改 `packages/config/src/index.ts`、Agent Prompt/Schema/window 文件、`packages/metrics/src/index.ts`、`apps/worker/src/pipelines/lesson-analysis-pipeline.ts`。

**Interfaces:** `loadWorkflowConfig(): WorkflowConfigSnapshot` 返回经过校验、深度冻结的 `{version,hash,config}`；`validateWorkflowSnapshot(value:unknown): WorkflowConfigSnapshot` 验证持久化快照及哈希。`publicWorkflowConfig(snapshot)` 只返回场景标签、公开状态与展示限制。

- [ ] 写失败测试：无效重试预算、缺步骤、未知处理器、快照哈希不匹配均拒绝；相同内容哈希稳定；公开配置不含 Prompt/密钥。
- [ ] 运行 `node --require ./register.cjs --test packages/config/src/workflow-config.test.ts`，确认新增接口缺失导致失败。
- [ ] 实现配置校验与 JSON 文件；迁移 Prompt、窗口 80/重叠 3、指标时长阈值、重试/超时、场景绑定、Schema 与降级策略；代码只保留执行器与结构校验。
- [ ] 按配置步骤运行现有处理器并保留人工暂停节点；配置版本锁定至工作流输入，恢复读取已存快照。
- [ ] 重跑配置及 Agent/指标回归测试，全部通过后提交。

### Task 2: 稳定视频追踪与查询

**Files:** 新增 `packages/database/migrations/20261021_workflow_foundation.sql`、`packages/database/src/workflow-foundation.ts`、`packages/database/src/workflow-foundation.test.ts`、`packages/observability/src/trace-context.ts`；修改数据库入口、API lessons/workflows、Worker workflows、日志和 provider 调用上下文。

**Interfaces:** `getVideoTrace(videoId:string):Promise<string>`；`getTraceTimeline(traceId:string):Promise<TraceTimeline>`。异步上下文 `withTraceContext({traceId,runId,attemptId},fn)` 为日志和 Provider 注入标识，禁止用请求头覆盖数据库 traceId。

- [ ] 写失败测试：重复上传确认/重试 traceId 相同；不同视频不同；日志上下文跨 await 保持、不同请求隔离；无权限不能查询。
- [ ] 运行新增追踪测试，确认接口缺失导致失败。
- [ ] 迁移为视频生成 UUID，并为任务、步骤、转录、指标、证据、审核、报告加可索引关联；使用本地视频关联传播，历史孤立记录统计而不猜配。
- [ ] 补幂等回填脚本、受现有访问控制约束的轨迹 API；API 与 Worker 统一输出 traceId/runId/attemptId。
- [ ] 验证重试、回填重复执行与跨层标识一致，提交。

### Task 3: 步骤租约、幂等与 HITL 恢复

**Files:** 新增 `packages/database/src/step-execution.ts`、`packages/database/src/step-execution.test.ts`；修改工作流迁移、Worker pipeline/workflow、数据库结果保存接口。

**Interfaces:** `claimStep(input):Promise<StepLease|null>` 返回 `{executionId,fencingToken,leaseUntil}`；`renewStepLease(lease):Promise<boolean>`；`completeStep(lease,result):Promise<boolean>`；`releaseStep(lease):Promise<boolean>`。幂等键由 runId/stepKey/输入版本/configHash 组成。

- [ ] 写失败测试：双 Worker 仅一方领取；过期租约允许重领；旧 fencing token 提交被拒；已完成步骤不重复落库；人工节点重启后仍暂停。
- [ ] 运行步骤测试，观察失败。
- [ ] 实现数据库条件领取、心跳续租、结果提交事务和唯一约束；外部调用承认至少一次，不能宣称恰好一次；结果保存校验租约、原文版本、scene_revision。
- [ ] 修改管线按 runId 读取自身步骤，避免同课程最新任务串线；人工确认生成事件后只恢复下一合法节点。
- [ ] 运行并发模拟与可用的真实 PostgreSQL 集成测试；数据库不可达时记录未验证项，提交。

### Task 4: 结构化失败、持久化退避与共享熔断

**Files:** 新增 `packages/shared-types/src/workflow-failure.ts`、测试、`packages/database/src/failure-routing.ts`、`apps/api/src/common/workflow-exception.filter.ts`；修改 provider、Agent LLM 调用包装、Worker 管线。

**Interfaces:** `classifyWorkflowFailure(error,context):WorkflowFailure`；`routeWorkflowFailure(failure,policy):FailureDecision`；持久化 `recordWorkflowFailure(...)`、`acquireProviderProbe(...)`。类别为 schema_invalid/business_rule_rejected/provider_transient/provider_permanent/configuration/internal。

- [ ] 写失败测试：Schema 重试耗尽隔离、业务拒绝零模型重试且入优先人工队列、超时/429/5xx 退避、401 永久失败、Retry-After、半开仅一次探测。
- [ ] 运行失败路由测试，确认新行为尚不存在。
- [ ] 实现安全结构化错误与数据库 failure/review_queue/provider_circuit 表；共享熔断状态、退避到期领取、重启恢复。
- [ ] Provider 设置配置超时和状态码错误；Schema 校验失败不得被 Agent 包装吞为成功；API 过滤器与 Worker 使用同一分类。失败日志不包含密钥、模型原始全文或课堂全文。
- [ ] 故障注入覆盖三条主分支及永久故障；验证持久化后恢复与输入版本保护，提交。

### Task 5: 审核事件、样例池与冻结回归集

**Files:** 新增 `packages/database/src/annotation-feedback.ts`、测试；迁移新增 annotation_events/sample_pool/few_shot_releases/regression_sets/regression_cases；新建 `packages/database/scripts/refresh-few-shot.ts`、`freeze-regression-set.ts`、`backfill-reviewed-samples.ts`；修改审核事务与 Evidence 检索输入。

**Interfaces:** `recordAnnotationFeedback(client,input)` 与审核同事务；`refreshFewShotRelease(input):Promise<Release>`；`freezeRegressionSet(id):Promise<void>`；`selectFewShotCards({scene,category,excludeLessonId,excludeSourceHash,releaseId})` 最多 1–2 条并受配置字符预算约束。

- [ ] 写失败测试：重复审核去重、事务回滚无候选、拒绝/撤销不作为正例、引用不匹配不发布、相同来源去重、本课/本源/冻结集样本排除。
- [ ] 增加真实数据库测试：冻结后父集/用例 INSERT/UPDATE/DELETE 均被拒，刷新脚本不改变冻结集哈希。
- [ ] 先运行测试观察失败，再实现不可变事件、可追溯候选质量门槛、发布版本及数据库冻结触发器；删除规则不能绕过冻结保护。
- [ ] few-shot 保持规则优先、案例低权重；质量不足可发布空样例集，不凑数、不调用额外 LLM judge。
- [ ] 运行脚本 dry-run 与事务/过滤测试，提交。

### Task 6: 全流程验证与运行手册

**Files:** 新建 `apps/worker/src/pipelines/workflow-foundation.test.ts`、`docs/WORKFLOW_FOUNDATION.md`；修改 API 状态输出与 Next 展示、根测试脚本。

**Interfaces:** 前端读取公开配置和 `{traceId,status,errorKind,retryAt,waitingFor}`；后台轨迹查询不对外暴露内部 Prompt 或原始失败内容。

- [ ] 用模拟 Provider 写完整故障流程：上传→ASR→校对→人工确认→指标→抽取→审核→报告，校验 traceId 一致、配置快照一致和人工节点不可跳过。
- [ ] 验证 Schema 耗尽没有证据、业务拒绝存在优先审核项、429 重启后恢复、场景中途变化拒绝旧提交、冻结集不进入 few-shot。
- [ ] 实现前端简洁恢复状态与追踪编号，运行完整源测试及全项目类型检查；仅对真实运行的检查宣称通过。
- [ ] 更新迁移顺序、回填、脚本 dry-run、恢复/回滚限制、部署前检查说明；不执行生产迁移。
- [ ] 最终审查整个分支，修复重要发现并重跑相关测试，提交与交付；明确本地验证/真实数据库验证/部署状态。

## 执行状态（2026-10-21）

代码实现与Mock验证已执行，进度见 `docs/WORKFLOW_FOUNDATION_PROGRESS.md`；验证实录见 `docs/validation/2026-10-21-workflow-foundation.md`。任务1–5已接入现有代码，但任务2/3/5的真实数据库验收未运行。任务6的真实模型正常链路未通过，数据库E2E与人工黄金集尚缺；不将整个计划标记完成。用户稍后提供专用测试数据库。
