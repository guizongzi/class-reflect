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

```bash
pnpm install
pnpm dev
```

单独启动：

```bash
pnpm web:dev
pnpm api:dev
pnpm worker:dev
```

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
