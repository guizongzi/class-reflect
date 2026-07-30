# AI 课堂回放与教学分析系统

MVP 使用新的正式工程骨架：

```text
pnpm Workspace + Turborepo
Next.js + React + TypeScript 前端
NestJS + TypeScript 主业务 API
独立 TypeScript Worker
packages 分层复用类型、契约、领域规则、Provider、Agent、Metrics、Guardrail
M2/M3 可选 Python ai-runtime
```

当前 M1 只聚焦一条真实链路：

```text
上传课堂视频
→ 选择课堂类型
→ 对象存储
→ Worker 处理音频与 ASR
→ 时间轴逐字稿
→ 大段课堂记录
→ 教师校订
→ 按需翻译
→ 证据复核
→ 确认后报告
```

## 文档

- [MVP 产品设计及技术方案](docs/MVP产品设计及技术方案.md)
- [技术手册](docs/TECHNICAL_MANUAL.md)
- [架构基线](docs/ARCHITECTURE_BASELINE.md)
- [文档入口](docs/README.md)

规则：

- 当前 M1 功能范围、验收边界和真实链路看 `TECHNICAL_MANUAL.md`。
- 文件架构、目录分层和长期扩展标准看 `ARCHITECTURE_BASELINE.md`。

## 目录

```text
apps/
  web/          Next.js 前端
  api/          NestJS 主业务 API
  worker/       TypeScript 后台任务
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

legacy/
  node-mvp/     旧速成验证版，仅作为迁移参考
```

## 本地运行

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制示例配置：

```bash
cp .env.example .env
```

至少需要填写：

```text
DATABASE_URL
FRONTEND_ORIGIN
NEXT_PUBLIC_API_BASE_URL
R2_ACCOUNT_ID
R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
ASR_PROVIDER
ALIYUN_DASHSCOPE_API_KEY
ALIYUN_ASR_MODEL
ALIYUN_ASR_BASE_URL
LLM_BASE_URL
LLM_API_KEY
LLM_MODEL
```

本地只做前后端烟测时，可以先使用：

```text
ASR_PROVIDER=mock
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
FRONTEND_ORIGIN=http://localhost:3001
```

真实视频上传和转写需要配置 Cloudflare R2、Supabase/PostgreSQL 和阿里云 DashScope。真实 secret key 只放在本地 `.env` 或云端 Secret Manager，不能提交到仓库。

### 3. 准备数据库

创建 PostgreSQL 数据库后，执行迁移目录中的 SQL：

```bash
psql "$DATABASE_URL" -f packages/database/migrations/20260730_workflow_runs.sql
psql "$DATABASE_URL" -f packages/database/migrations/20260730_section_translations.sql
psql "$DATABASE_URL" -f packages/database/migrations/20260730_teaching_evidence_agent.sql
```

如果使用 Supabase，可以在 Supabase SQL Editor 中按相同顺序执行这些文件内容。

### 4. 启动服务

分别启动前端、API 和 Worker：

```bash
pnpm web:dev
pnpm api:dev
pnpm worker:dev
```

也可以启动整个 workspace：

```bash
pnpm dev
```

默认端口：

```text
API: http://localhost:3000
Web: Next.js dev server 输出的本地地址，通常是 http://localhost:3001
```

### 5. 本地烟测

检查 API：

```bash
curl http://localhost:3000/api/health
```

推荐烟测顺序：

```text
1. 打开 Web 本地地址
2. 创建课堂并选择课程形式
3. 上传视频，确认前端拿到 R2 预签名地址
4. 完成视频和音频上传确认
5. 启动 Worker 认领 workflow
6. 查看课堂详情、workflow 进度和候选证据
```

当前 M1 正式骨架中，R2 上传、ASR Provider 入口、ASR 逐字稿入库、大段课堂记录生成、基础指标、Guardrail、教学证据生成 Agent 已接入；`detect_events`、`generate_report`、`export_report` 仍是后续要补齐的处理器。因此本地已经可以测试到“ASR 写库 → 分段 → 生成候选教学证据”，完整报告导出还不是全自动闭环。

检查和构建：

```bash
pnpm check
pnpm build
```

## 平台

| 平台 | 职责 |
| --- | --- |
| Supabase PostgreSQL | 课堂、视频对象、workflow、逐字稿、证据、复核、报告 |
| Cloudflare R2 | 原始视频、临时音频、导出报告 |
| Google Cloud Run | API 和 Worker Job |
| Google Secret Manager | `APP_CONFIG_ENV` |
| 阿里云 ASR | 文件转写与时间点 |
| 阿里云 LLM | 候选证据、按需翻译、报告整理 |

## 旧实现

旧 Node/Express + Vite 版本已经移动到 `legacy/node-mvp`。它只用于参考已跑通过的 R2、Supabase、阿里云 ASR 和 Cloud Run 逻辑，不再作为正式入口继续扩张。
