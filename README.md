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

## 技术栈与版本

版本以 `package.json`、`pnpm-lock.yaml` 和部署 Dockerfile 为准。当前只列出 M1 已实际使用的技术和服务。Node 和 pnpm 版本必须匹配，否则本地安装、Next.js 构建或 Cloud Run 镜像构建可能失败。

### 工程与运行时

| 技术 | 声明版本 | 当前锁定/部署版本 | 用途 |
| --- | --- | --- | --- |
| Node.js | 必须 `22.x` | Dockerfile 使用 `node:22-bookworm-slim` | API、Web、Worker 容器运行时；本地也必须使用 Node 22 |
| pnpm | 必须 `11.9.0` | `packageManager: pnpm@11.9.0` | workspace 包管理；本地也必须使用 pnpm 11.9.0 |
| Turborepo | `^2.3.3` | `2.10.7` | monorepo 构建与任务编排 |
| TypeScript | `^5.7.3` | `5.9.3` | 全仓库主要开发语言 |
| tsx | `^4.19.2` | `4.23.1` | Worker 本地开发 watch 启动 |
| FFmpeg | Debian apt 安装 | 随 `node:22-bookworm-slim` 镜像仓库解析 | API/Worker 媒体处理依赖 |

### 前端

| 技术 | 声明版本 | 当前锁定版本 | 用途 |
| --- | --- | --- | --- |
| Next.js | `^15.1.4` | `15.5.22` | Web 前端框架 |
| React | `^19.0.0` | `19.2.8` | 前端 UI |
| React DOM | `^19.0.0` | `19.2.8` | 浏览器渲染 |
| `@types/react` | `^19.0.2` | `19.2.17` | React 类型 |
| `@types/react-dom` | `^19.0.2` | `19.2.3` | React DOM 类型 |

### 后端 API 与 Worker

| 技术 | 声明版本 | 当前锁定版本 | 用途 |
| --- | --- | --- | --- |
| NestJS Common/Core/Platform Fastify | `^10.4.15` | `10.4.22` | 主业务 API |
| Fastify Platform | `^10.4.15` | `10.4.22` | NestJS HTTP 适配 |
| RxJS | `^7.8.1` | `7.8.2` | NestJS 运行依赖 |
| reflect-metadata | `^0.2.2` | `0.2.2` | NestJS 装饰器元数据 |
| Zod | `^3.24.1` | `3.25.76` | API 请求契约和配置校验 |
| pg | `^8.22.0` | `8.22.0` | PostgreSQL/Supabase 连接 |
| `@types/pg` | `^8.20.0` | `8.20.0` | pg 类型 |

### 对象存储与外部服务适配

| 技术 | 声明版本 | 当前锁定/配置版本 | 用途 |
| --- | --- | --- | --- |
| AWS SDK S3 Client | `^3.744.0` | `3.1097.0` | Cloudflare R2 S3 兼容 API |
| AWS SDK S3 Request Presigner | `^3.744.0` | `3.1097.0` | R2 预签名上传/读取 URL |
| Cloudflare R2 | 托管服务 | 通过 `R2_*` 环境变量配置 | 原始视频、临时音频、报告导出对象 |
| Supabase PostgreSQL | 托管服务 | 通过 `DATABASE_URL` 配置 | 课堂、逐字稿、证据、指标、报告数据 |
| Google Cloud Run | 托管服务 | `asia-southeast1` | `class-reflect-api`、`class-reflect-web` |
| Google Cloud Run Jobs | 托管服务 | `asia-southeast1` | `class-reflect-worker` 后台任务 |
| Google Cloud Build | 托管服务 | 使用 `infra/google-cloud/cloudbuild.yaml` | API/Web 镜像构建与部署 |
| Google Secret Manager | 托管服务 | `APP_CONFIG_ENV:latest` | 生产环境密钥注入 |
| 阿里云 DashScope ASR | API 服务 | `ALIYUN_ASR_MODEL`，默认 `qwen3-asr-flash-filetrans` | 文件转写 |

### Workspace 内部包

| 包 | 版本 | 作用 |
| --- | --- | --- |
| `@class-reflect/shared-types` | `0.1.0` | 共享类型、课堂类型、workflow step、证据类型 |
| `@class-reflect/api-contracts` | `0.1.0` | API 请求/响应契约 |
| `@class-reflect/config` | `0.1.0` | 环境变量和 `APP_CONFIG_ENV` 解析 |
| `@class-reflect/database` | `0.1.0` | PostgreSQL/Supabase 数据访问 |
| `@class-reflect/domain` | `0.1.0` | 领域规则、课堂事件、报告模板 |
| `@class-reflect/agents` | `0.1.0` | 教学证据生成 Agent 和 workflow 决策 |
| `@class-reflect/metrics` | `0.1.0` | 不依赖 LLM 的确定性课堂指标 |
| `@class-reflect/guardrails` | `0.1.0` | 证据校验和安全边界 |
| `@class-reflect/providers` | `0.1.0` | R2、ASR、按需翻译等外部适配 |
| `@class-reflect/prompts` | `0.1.0` | Agent/LLM prompt 文本 |
| `@class-reflect/observability` | `0.1.0` | 日志封装 |

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

### 0. 确认本地版本

本地必须使用：

```text
Node.js 22.x
pnpm 11.9.0
```

检查版本：

```bash
node -v
pnpm -v
```

推荐启用 Corepack，让项目按 `packageManager` 自动使用 pnpm 11.9.0：

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制示例配置：

```bash
cp .env.example .env
```

当前正式代码实际读取的环境变量如下。

本地最小烟测只需要前端能连到 API，并让 ASR 使用 mock：

```text
API_BASE_URL
ASR_PROVIDER
```

推荐本地烟测值：

```text
ASR_PROVIDER=mock
API_BASE_URL=http://localhost:3001
FRONTEND_ORIGIN=http://localhost:3000
```

真实上传、转写和报告通路需要补齐：

| 变量 | 必填场景 | 示例/说明 |
| --- | --- | --- |
| `DATABASE_URL` | API/Worker 读写课堂数据 | Supabase PostgreSQL connection string |
| `FRONTEND_ORIGIN` | API CORS | 本地 `http://localhost:3000`；云端填 `https://class-reflect-web-113773741484.asia-southeast1.run.app` |
| `API_BASE_URL` | Web 服务端转发 API | 本地 `http://localhost:3001`；云端 Web 服务填 `https://class-reflect-api-113773741484.asia-southeast1.run.app` |
| `NEXT_PUBLIC_API_BASE_URL` | 可选，浏览器直连 API | 留空时使用 Web 同源 `/api/*` 转发；需要绕过 Web 转发时才填写 |
| `R2_ACCOUNT_ID` | 真实视频/音频对象存储 | Cloudflare account id |
| `R2_ENDPOINT` | 真实视频/音频对象存储 | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | 真实视频/音频对象存储 | R2 bucket 名称 |
| `R2_ACCESS_KEY_ID` | 真实视频/音频对象存储 | R2 S3 API access key |
| `R2_SECRET_ACCESS_KEY` | 真实视频/音频对象存储 | R2 S3 API secret key |
| `R2_REGION` | 可选 | 默认 `auto` |
| `ASR_PROVIDER` | Worker 转写 | 本地烟测 `mock`；真实转写 `aliyun` |
| `ALIYUN_DASHSCOPE_API_KEY` | `ASR_PROVIDER=aliyun` | DashScope / Model Studio API key |
| `ALIYUN_ASR_MODEL` | 可选 | 默认 `qwen3-asr-flash-filetrans` |
| `ALIYUN_ASR_BASE_URL` | 可选 | 默认 `https://dashscope.aliyuncs.com/api/v1` |
| `ALIYUN_ASR_TIMEOUT_MS` | 可选 | 默认 `600000` |
| `ALIYUN_ASR_POLL_INTERVAL_MS` | 可选 | 默认 `3000` |
| `TRANSLATION_PROVIDER` | 可选，按需翻译 | 默认 `mymemory`；可设 `mock` 或 `llm` |
| `MYMEMORY_EMAIL` | 可选，MyMemory 翻译 | MyMemory 识别调用方用 |
| `LLM_BASE_URL` | 仅 `TRANSLATION_PROVIDER=llm` 时需要 | OpenAI-compatible `/chat/completions` base URL |
| `LLM_API_KEY` | 仅 `TRANSLATION_PROVIDER=llm` 时需要 | LLM API key |
| `LLM_MODEL` | 仅 `TRANSLATION_PROVIDER=llm` 时需要 | 例如 `qwen-plus` |
| `PORT` | 可选 | Cloud Run 注入 `8080`；本地 API 默认可用 `3000` |

`.env.example` 中若有 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`DIRECT_URL`、`PUBLIC_BASE_URL`、`ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`、`FFMPEG_PATH` 等占位项，当前正式 M1 代码不会读取它们。

生产环境通过 Google Secret Manager 的 `APP_CONFIG_ENV` 注入 API 和 Worker。建议内容是一个 JSON 对象：

```json
{
  "DATABASE_URL": "postgresql://...",
  "FRONTEND_ORIGIN": "https://class-reflect-web-113773741484.asia-southeast1.run.app",
  "R2_ACCOUNT_ID": "...",
  "R2_ENDPOINT": "https://<account-id>.r2.cloudflarestorage.com",
  "R2_BUCKET": "class-reflect",
  "R2_ACCESS_KEY_ID": "...",
  "R2_SECRET_ACCESS_KEY": "...",
  "R2_REGION": "auto",
  "ASR_PROVIDER": "aliyun",
  "ALIYUN_DASHSCOPE_API_KEY": "...",
  "ALIYUN_ASR_MODEL": "qwen3-asr-flash-filetrans",
  "ALIYUN_ASR_BASE_URL": "https://dashscope.aliyuncs.com/api/v1",
  "ALIYUN_ASR_TIMEOUT_MS": 600000,
  "ALIYUN_ASR_POLL_INTERVAL_MS": 3000,
  "TRANSLATION_PROVIDER": "mymemory"
}
```

Web 默认使用同源 `/api/*` 转发到后端。Cloud Run 上建议给 `class-reflect-web` 设置 `API_BASE_URL=https://class-reflect-api-113773741484.asia-southeast1.run.app`，本地则设置 `API_BASE_URL=http://localhost:3001`。`NEXT_PUBLIC_API_BASE_URL` 是可选的前端构建期变量，只有希望浏览器直接请求 API 时才填写。

真实 secret key 只放在本地 `.env` 或云端 Secret Manager，不能提交到仓库。

### 3. 准备数据库

创建 PostgreSQL 数据库后，执行迁移目录中的 SQL：

```bash
psql "$DATABASE_URL" -f packages/database/migrations/20260730_m1_core_tables.sql
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
Web: http://localhost:3000
API: http://localhost:3001
```

### 5. 本地烟测

检查 API：

```bash
curl http://localhost:3001/api/health
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

当前 M1 正式骨架中，R2 上传、ASR Provider 入口、ASR 逐字稿入库、大段课堂记录生成、确定性课堂事件、基础指标、Guardrail、教学证据生成 Agent、证据审核和报告 Markdown 生成/编辑已接入。因此本地已经可以测试到“ASR 写库 → 分段 → 生成候选教学证据 → 人工审核 → 生成报告”。PDF 或 R2 报告文件导出留作后续增强；音视频仍保存在 Cloudflare R2，Supabase/PostgreSQL 只保存对象地址和业务数据。

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
| MyMemory / OpenAI-compatible LLM | 按需翻译；默认使用 MyMemory，只有 `TRANSLATION_PROVIDER=llm` 时才需要 LLM 配置 |

## 旧实现

旧 Node/Express + Vite 版本已经移动到 `legacy/node-mvp`。它只用于参考已跑通过的 R2、Supabase、阿里云 ASR 和 Cloud Run 逻辑，不再作为正式入口继续扩张。
