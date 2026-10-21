# 云端开发交接 — 2026-10-22

## 从这里继续

仓库：https://github.com/guizongzi/class-reflect

接续分支：`codex/scene-evaluation-isolation`。代码检查点：`fd81ad5`；本交接文档及数据库验收记录在后续交接提交中。读取此分支，不以 main 或旧 PR 的实现状态替代它。

目标：在云端继续轻量工作流底座验收，完成专用数据库迁移测试、真实模型故障/回归验证，随后准备 GCP 切换与线上端到端验收。用户已授权自主实施普通开发、测试及可回退的开发分支提交；重大业务规则改变、不可恢复的数据删除、新增付费义务保留人工决策。日常汇报使用中文。

## 当前已完成与边界

- 校对→证据抽取→评审、场景指标白名单、上下文变更失效、业务规则与 Schema 校验、持久化任务/步骤租约和幂等、错误分类与重试熔断、HITL、标注回流、冻结回归集等代码已在分支。
- Qwen 预设使用 `LLM_MODEL=qwen3.7-flash`、`WORKFLOW_MODEL_PROFILE=qwen3.7-flash`，端点 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`。原生 strict Schema 实测可用。429 重试恢复成功；真实响应数组格式被故障注入破坏后，格式重试成功，但一张卡被业务守卫拒绝，整次业务验收未通过。
- Supabase 业务数据已复制到 Neon：12 表、1,141 行，逐行 0 差异，180 列、43 个约束、17 个独立索引、RLS 定义核对一致；事务回滚写入检查通过。源项目仍保留。
- **Neon 正式库复制的是原线上表结构，尚未应用本分支新增的工作流底座迁移。数据库迁移成功不代表底座验收完成。**
- 本地开发环境已改连 Neon；GCP 尚未读取/修改运行配置，没有线上切换或部署。GCP 仍可能向 Supabase 写入，新旧库增量需在正式切换前重新核对。
- 缺少人工审核冻结的黄金证据集，不能计算或声称证据召回提升、架构改造前后收益百分比。
- 之前单独暂停的 `work/evidence-fix` 输出/引用核验修复未合并；保持暂停边界。现有守卫不强制每条引用精确匹配，禁止声称无幻觉。

## 云端接续步骤与验收条件

1. **环境可复现。** 确认云端具有仓库检出、终端、Git 和网络能力；检出接续分支并记录 HEAD。依据 Docker 的 Node 22 基线与 package.json 的 packageManager 配置依赖。优先运行 `pnpm install --frozen-lockfile`；当前锁文件版本与 pnpm 组合需要在干净环境实测，失败时先记录原因，保留版本约束。不要复制本地 node_modules 软链接、临时 register.cjs 或临时 tsconfig。
2. **建立检查基线。** 执行 `node scripts/test-source.cjs` 和 `pnpm exec tsc -p tsconfig.source-check.json`。最后本地记录为 135 项、134 通过、1 个真实数据库测试跳过；这是历史结果，云端需重新执行。先分清依赖/环境问题与代码失败。
3. **独立数据库验证。** 使用专用测试数据库或分支，确认 URL 指向测试库，再按 SQL 依赖顺序应用迁移；不要按同日期文件名盲目排序（例如核心表先于依赖它的指标/场景迁移）。已有 Neon 验证库含业务快照，应另开一次性测试库，或明确隔离后再测试。真实冻结集测试只读取 `ANNOTATION_TEST_DATABASE_URL`，它会创建并清理测试 schema；不得指向正式库。验证租约/过期令牌、事务回滚、重试原子发布、输入版本变更、冻结集不可变性，再记录实际结果。
4. **真实模型验收。** 单元/集成优先 Mock；故障注入、回归和最终端到端使用真实模型。运行 `validation/workflow-foundation/real-acceptance.ts` 的 normal、real-response-corrupt-array、429-once；保留失败原因，分开报告结构恢复与业务核验。重复运行须有修复或实验依据。少量节选不是黄金集，也不代表整课 E2E。
5. **GCP 切换准备。** 取得已有云凭据后先核对实际项目、运行服务、镜像版本及 Secret Manager 的 APP_CONFIG_ENV；仅替换数据库连接时保留其他字段。先完成数据库新迁移的隔离验收、代码部署方案及源库增量核对，安排写入暂停窗口/最终同步，再切换。验证上传→转码→ASR→分片→证据→人工审核→报告，并准备回退。用户只是交接开发，不要求现在删除 Supabase。

每一步完成条件：可复现命令、实际结果、明确未验证事项，写入 validation 与进度文档。环境或凭据缺失时继续 Mock/静态检查等独立工作，并明确缺失项，不将云端任务建立等同于可运行环境验收。

## 云端需配置的访问（只提供变量名）

- 专用测试 PostgreSQL：`DATABASE_URL`、迁移用 `DIRECT_URL`；冻结集集成测试单独设置 `ANNOTATION_TEST_DATABASE_URL`。
- 模型：`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`WORKFLOW_MODEL_PROFILE`。
- 完整视频验收才需要：`ASR_PROVIDER`、`ALIYUN_DASHSCOPE_API_KEY`、ASR 区域与模型参数，及 `.env.example` 中现有 R2 配置。沿用现有提供商，不更换 API 服务。
- GCP：已有部署账号/受控凭据、Cloud Tasks 和 Secret Manager 权限。当前本地未取得可用 GCP 登录，云端也不能默认具有。

云环境配置使用受控环境变量/凭据存储，不把真实 .env、数据库连接密码或课程正文写入仓库/任务消息。Neon 新加坡项目 `cool-snow-67349609`，正式库 class_reflect；存在 migration-validation 分支及同项目独立 class_reflect_migration_validation 数据库，它们是不同的隔离资源，使用前确认实际端点。

持久备份只在用户本机：Documents/DevWorkspace/class-reflect-migration-backups/2026-10-22，包含旧配置和可恢复数据归档。云端不能假设可访问这些本地文件，也不能把备份路径当作云端挂载路径。

## 按需参考

- 架构与已批准计划：`docs/superpowers/specs/2026-10-21-workflow-foundation-design.md`、`docs/superpowers/plans/2026-10-21-workflow-foundation.md`。
- 当前实现入口与使用：`docs/WORKFLOW_FOUNDATION.md`。
- 模型实测：`docs/validation/2026-10-21-qwen37-flash.md`；旧 qwen-max 失败记录仍保留，不用于新模型当前结论。
- 数据库复制验收：`docs/validation/2026-10-22-supabase-neon-migration.md`。
- 参考范围：Unstract 仅借鉴工作流/步骤状态、失败隔离、HITL、配置、worker 租约与幂等思想；本项目继续使用 Next.js、NestJS/Fastify、Worker、PostgreSQL、R2，不复刻平台。不再引用 AIDE。
- RAG：规则库和单节课逐字稿检索空间分离；案例短卡单指标、低权重最多 1–2 条，不能单独判分。模拟试讲不评价真实学生回应。
