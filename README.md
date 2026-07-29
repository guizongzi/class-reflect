# 课堂复盘与教学分析系统

第一版聚焦一条真实可跑通的基础链路：对话发起复盘任务、上传课堂视频、持久保存到对象存储、基于语音转文字生成带时间轴的课堂记录、教师校订文本、导出基础课堂记录报告。

## 已完成范围

- 真实问题与用户场景说明。
- 对话式任务发起和快捷复盘目标。
- 课堂视频上传、对象存储持久保存、播放器预览。
- 带时间轴的 ASR 逐字稿入库。
- 按时间、停顿和课堂活动边界聚合的大段课堂记录。
- 大段课堂记录编辑并保存到后端。
- 原始逐字稿小段编辑接口，支持后续接入时间轴编辑器。
- 对话式 AI 任务助手，嵌入处理过程、证据、复核和报告卡片。
- 处理状态、失败原因和从失败步骤重试。
- 不依赖 AI 的基础 Markdown 课堂记录报告。
- 电脑端和手机端响应式布局。

## 第一版创新点

系统不做自动打分，而是先做“可追溯课堂记录底座”。第一版不伪造 AI 结论，先确保视频、对象存储、ASR 时间轴、文本校订和基础报告真实可用。后续 AI 教学分析必须基于已保存的时间轴逐字稿生成，并经过教师确认后才能进入分析报告。

## 模拟与真实后端

前端仍保留 localStorage 演示数据，方便没有后端环境时预览界面。接入后端后，视频会先直传 Cloudflare R2，Supabase PostgreSQL 只保存文件归属、对象地址、可选音频对象、workflow 状态、逐字稿、课堂分段和校订结果。API 只负责创建上传凭证、确认上传和创建 workflow；音频抽取、ASR 和写库由独立 worker / Cloud Run Job 消费队列完成。

## 平台分工

| 账号/平台 | 负责的主要功能 | 关键配置 |
|---|---|---|
| Supabase | PostgreSQL 数据库、教师登录、保存课堂/逐字稿/证据卡片/复核结果/报告 | `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`DATABASE_URL`、`DIRECT_URL` |
| Google Cloud | 部署前端和 API、运行后台视频处理任务、构建和保存 Docker 镜像、保存密钥、查看日志 | Cloud Run、Cloud Run Jobs、Cloud Build、Artifact Registry、Secret Manager、Logging |
| Cloudflare | 使用 R2 存储课堂原始视频、临时音频和导出文件；提供预签名上传与播放 | `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_ENDPOINT` |
| 阿里云 | ASR 将课堂音频转为带时间点逐字稿；LLM 将逐字稿生成课堂事件、证据卡片和报告 | DashScope API Key；LLM 的 `BASE_URL`、`API_KEY`、`MODEL` |
| GitHub | 保存代码、版本管理、让 AI Agent 修改和提交项目 | 代码仓库及访问权限 |

## 本地运行

直接打开 `apps/web/index.html` 即可预览前端界面。

如需用本地服务预览：

```bash
python3 -m http.server 8080 --directory apps/web
```

然后访问：

```text
http://localhost:8080
```

## 后端运行

第一版后端使用 Cloudflare R2 保存视频、临时音频和导出文件，数据库只保存文件归属、R2 object key 和处理状态，不保存视频二进制。

1. 准备 Supabase 项目，复制数据库连接串。
2. 准备 Cloudflare R2 bucket，并配置 CORS 允许前端域名 `PUT` 上传。
3. 复制 `.env.example` 为 `.env`，填写：

```text
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgres://...
DIRECT_URL=postgres://...
R2_ACCOUNT_ID=...
R2_ENDPOINT=https://你的账号ID.r2.cloudflarestorage.com
R2_BUCKET=你的 bucket
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
ALIYUN_ASR_MODEL=qwen3-asr-flash-filetrans
ALIYUN_DASHSCOPE_API_KEY=...
ALIYUN_ASR_BASE_URL=https://dashscope.aliyuncs.com/api/v1
ALIYUN_ASR_POLL_INTERVAL_MS=3000
ALIYUN_ASR_TIMEOUT_MS=600000
ALIYUN_ASR_FILE_URL_EXPIRES_SECONDS=3600
ALIYUN_ACCESS_KEY_ID=...
ALIYUN_ACCESS_KEY_SECRET=...
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=...
LLM_MODEL=qwen-plus
FRONTEND_ORIGIN=https://你的前端域名
```

真实 ASR 流程：API 确认视频已进入 R2 后创建 `workflow_runs` 和 `workflow_step_runs`；如果前端或媒体任务已经通过 `/api/videos/{videoId}/audio-upload-url` 上传了独立音频，worker 会直接用该音频生成 ASR 临时读取 URL；如果没有独立音频，worker 才从 R2 读取视频，抽取 wav 音频后上传回 R2。随后 worker 提交给 `qwen3-asr-flash-filetrans`，轮询 DashScope 任务，下载 `transcription_url` 里的 JSON，并把 `sentences[].begin_time/end_time/text` 写入逐字稿表。课堂记录中的每一行都会保留 `开始时间-结束时间`，长停顿会显示停顿提示。

4. 安装依赖并初始化数据库：

```bash
npm install
npm run db:init
npm start
```

另开一个终端运行 worker，消费已入队的课堂分析 workflow：

```bash
npm run worker
```

只想处理一条队列任务时：

```bash
npm run worker:once
```

前端默认请求同源 `/api`。如果前端部署在 GitHub Pages、后端部署在其他域名，可在浏览器控制台设置：

```js
localStorage.setItem("classReflectApiBase", "https://你的后端域名")
```

然后刷新页面。

## Google Cloud 上线步骤

第一版把 API/前端部署为 Cloud Run Service，把视频处理部署为 Cloud Run Job。API 只处理短请求和状态查询；视频下载、FFmpeg、ASR 和写库由 worker job 执行，避免上传请求或网页会话被长任务拖住。

1. 在 Google Cloud 创建项目，并启用：

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

2. 创建 Artifact Registry：

```bash
gcloud artifacts repositories create class-reflect \
  --repository-format=docker \
  --location=asia-southeast1
```

3. 在 Secret Manager 创建一个密钥：`APP_CONFIG_ENV`。

推荐内容是一个 JSON 对象。可以使用平铺环境变量名：

```json
{
  "DATABASE_URL": "postgres://...",
  "DIRECT_URL": "postgres://...",
  "SUPABASE_URL": "https://你的项目.supabase.co",
  "SUPABASE_ANON_KEY": "...",
  "SUPABASE_SERVICE_ROLE_KEY": "...",
  "R2_ACCOUNT_ID": "...",
  "R2_ENDPOINT": "https://你的账号ID.r2.cloudflarestorage.com",
  "R2_BUCKET": "你的 bucket",
  "R2_ACCESS_KEY_ID": "...",
  "R2_SECRET_ACCESS_KEY": "...",
  "ASR_PROVIDER": "aliyun",
  "ALIYUN_DASHSCOPE_API_KEY": "...",
  "ALIYUN_ASR_MODEL": "qwen3-asr-flash-filetrans",
  "ALIYUN_ASR_BASE_URL": "https://你的业务空间ID.ap-southeast-1.maas.aliyuncs.com/api/v1",
  "LLM_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "LLM_API_KEY": "...",
  "LLM_MODEL": "qwen-plus",
  "FRONTEND_ORIGIN": "https://你的前端域名",
  "DEBUG_TOKEN": "临时调试口令"
}
```

也可以使用分组对象：

```json
{
  "databaseUrl": "postgres://...",
  "directUrl": "postgres://...",
  "frontendOrigin": "https://你的前端域名",
  "supabase": {
    "url": "https://你的项目.supabase.co",
    "anonKey": "...",
    "serviceRoleKey": "..."
  },
  "r2": {
    "accountId": "...",
    "endpoint": "https://你的账号ID.r2.cloudflarestorage.com",
    "bucket": "你的 bucket",
    "accessKeyId": "...",
    "secretAccessKey": "..."
  },
  "aliyun": {
    "dashscopeApiKey": "...",
    "asrModel": "qwen3-asr-flash-filetrans",
    "asrBaseUrl": "https://你的业务空间ID.ap-southeast-1.maas.aliyuncs.com/api/v1"
  },
  "llm": {
    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "apiKey": "...",
    "model": "qwen-plus"
  }
}
```

4. 用 Cloud Build 构建和部署 API Service 与 Worker Job：

```bash
gcloud builds submit --config infra/google-cloud/cloudbuild.yaml
```

5. 部署后确认 Cloud Run Service 和 Cloud Run Job 的 Variables & Secrets 中都已绑定：

```text
APP_CONFIG_ENV=APP_CONFIG_ENV:latest
```

6. 打开 API 健康检查：

```text
https://你的-cloud-run-url/api/health
```

返回 `ok: true` 后，再初始化数据库并测试上传链路。

7. 上传视频后，执行 worker job 消费队列：

```bash
gcloud run jobs execute class-reflect-worker \
  --region asia-southeast1 \
  --wait
```

执行后页面会通过 `/api/lessons/{lessonId}/status` 看到 workflow 步骤变化。后续可接 Cloud Scheduler、Cloud Tasks 或 Pub/Sub 自动触发 worker；M1 先把 API 与音频抽取/ASR 的运行单元解耦。

如果数据库之前已经初始化过，也需要重新运行一次：

```bash
npm run db:init
```

这会补齐 `transcript_segments` 的人工校订字段，以及 `workflow_runs` / `workflow_step_runs` 流程表，不会清空已有数据。

可选：如果需要让 Cloud Run 直接检测阿里云 ASR，可以在 `APP_CONFIG_ENV` 里临时加入 `DEBUG_TOKEN`，重新部署后调用：

```bash
curl -X POST "https://你的-cloud-run-url/api/debug/asr-smoke-test" \
  -H "Content-Type: application/json" \
  -H "x-debug-token: 你的 DEBUG_TOKEN" \
  -d '{}'
```

接口会使用线上同一套 Secret 和网络，转写一个公开测试音频，并返回预览和完整逐字稿。调试结束后建议删除 `DEBUG_TOKEN` 或换成不可猜测的长随机值。
