# 课堂复盘轻量工作流底座

沿用 NestJS/Fastify、现有 Worker 和 PostgreSQL。工作流状态、步骤状态与执行尝试分离；Next.js 只读取公开配置和任务状态。不引入 Unstract 平台组件；错误分类为本项目独立定义。

## 配置与执行

- `packages/config/src/workflow/default.json`：Prompt、文本窗口（80句/3句重叠）、指标时长阈值、输出 Schema、场景指标绑定、重试/熔断/租约与检索预算。
- 创建工作流时保存配置版本、SHA256 和内容；AsyncLocalStorage 在整个执行/恢复中固定该快照。启动校验不通过则拒绝启动。现有部署地址和密钥仍由环境变量提供，不进入版本配置。
- 模型严格 JSON Schema 仅对显式声明支持的模型启用；默认模型仍为 JSON object，并在本地执行 Schema 校验。二者不得混称。
- ASR 仍整文件提交；窗口是转录文本校对窗口，不代表音频降噪或音频分片识别。

## 状态、失败与人工节点

稳定视频 `traceId` 在上传初始化生成，重试保留；runId、执行令牌和步骤 attempt 用于区分执行。数据库触发器按显式 video/run 关系关联记录，无法确定来源的视频级历史报告不强行回填。

Worker 领取任务/步骤时使用租约与 fencing token；心跳续租，过期任务可恢复；旧租约和原文版本变化的写入被拒绝。外部模型调用按至少一次处理，不能宣称恰好一次。报告按步骤执行 ID 去重。

| 失败类型 | 行为 |
|---|---|
| schema_invalid | Agent 内有限局部重试；耗尽后隔离，不进入证据列表，Worker 不叠加 Schema 重试预算 |
| business_rule_rejected | 不重试模型，保留高优先级人工复核任务 |
| provider_transient | 持久化退避，遵循 Retry-After；数据库共享熔断与半开探测 |
| provider_permanent/configuration/internal | 明确失败，保存安全诊断，人工修正后重试 |

HTTP Worker 也运行到期任务扫描，不依赖原始 HTTP 请求保持连接。故障和恢复时间持久化；查询中的恢复率必须区分任务率与失败事件率。

人工节点：逐字稿确认、证据终审。重复上传确认不能越过它们。场景/角色/文本变化后失效旧分析、撤销样例资格，重新等待逐字稿确认。跳步重试不能代替人工确认。

## 标注回流与冻结集

审核更新、不可变审核事件、样例池资格在同一事务中提交。通过审核不自动等于高质量：须通过原文引用、完整字段和场景来源核验。更正/拒绝/撤销以及材料变化会使旧发布样例不可选。

Few-shot 发布保存不可变快照；选择时复核实时资格与场景，排除本课、本源和冻结集来源。最多2例，并按完整渲染内容计字符预算；只辅助规则理解，不能独立判分。无合格案例时允许空集。发布脚本不改变冻结回归集。

冻结集父/子行由数据库触发器保护增删改及 TRUNCATE；扩充必须创建新版本。自动化无法替代人工黄金标注；离线召回脚本要求明确冻结集和人工审核来源，区分 LLM、规则及 fallback。

## 验证命令

```sh
node scripts/test-source.cjs
node node_modules/typescript/bin/tsc -p tsconfig.source-check.json
node --require ./scripts/register-source.cjs packages/database/scripts/refresh-few-shot.ts
node --require ./scripts/register-source.cjs packages/database/scripts/freeze-regression-set.ts
node --require ./scripts/register-source.cjs packages/database/scripts/backfill-reviewed-samples.ts
```

三个数据库脚本默认 dry-run，`--apply` 才写入。冻结脚本需显式 set ID，刷新需显式发布版本；执行前阅读脚本参数。生产数据库不作为隐式测试库。

真实模型验收：载入已配置凭据后执行（输出必须为 `/private/tmp/` 下私有文件）：

```sh
node --require ./scripts/register-source.cjs validation/workflow-foundation/real-acceptance.ts normal /private/tmp/workflow-real/normal.json
node --require ./scripts/register-source.cjs validation/workflow-foundation/real-acceptance.ts real-response-corrupt-array /private/tmp/workflow-real/corrupt-array.json
node --require ./scripts/register-source.cjs validation/workflow-foundation/real-acceptance.ts 429-once /private/tmp/workflow-real/429.json
```

上述使用真实模型，但转录输入固定为12句试讲节选，恢复调度由验收脚本控制；不能当作真实数据库、上传和ASR端到端验收，也不是黄金召回集。正式黄金集核验使用 `validation/workflow-foundation/evaluate-evidence.ts`，必须保留人工标注来源，不能自己生成答案后宣称召回改善。

## 迁移与部署

1. 备份并确认现有基础迁移已执行。
2. 按顺序执行 `20261021_scene_evaluation_isolation.sql`、`20261021_workflow_foundation.sql`、`20261021_annotation_feedback.sql`。
3. 在专用测试数据库运行冻结保护集成测试，环境变量为 `ANNOTATION_TEST_DATABASE_URL`。
4. 验证历史 trace 回填、配置快照、两个人工节点、重试恢复后，再部署新 API/Worker/前端。

迁移文件不会被应用启动隐式执行。回滚应用前须先停 Worker；新增审计/冻结数据需保留，不能以删除冻结集绕过保护。租约字段上线前未迁移时新版拒绝执行，不能降为不受保护的旧写入模式。

## 已知验证限制

本地 Mock 与真实模型结果分别记录在 `docs/validation/`。现有数据库只读连接返回 ENOTFOUND（DNS），未执行远程迁移；无专用测试 PostgreSQL 时真实数据库集成测试显式跳过。没有已审核冻结黄金集时，不报告证据召回、精确率或业务提升百分比。外部告警平台尚未接入。
