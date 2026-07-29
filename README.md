# 课堂复盘与教学分析系统

第一版聚焦一条完整功能链：对话发起复盘任务、上传课堂视频、基于语音转文字生成大段课堂记录、运行证据链分析、教师复核结论、导出报告。

## 已完成范围

- 真实问题与用户场景说明。
- 对话式任务发起和快捷复盘目标。
- 课堂视频上传、播放器预览和按语音证据时间定位。
- 课堂片段时间轴与大段课堂记录编辑。
- 对话式 AI 任务助手，嵌入处理过程、证据、复核和报告卡片。
- 基于逐字稿的可重复分析演示，不是固定录像或写死结果。
- 事实 / 判断 / 建议三类证据链卡片。
- 教师接受、修改、驳回结论。
- 只导出已接受或已修改内容的 Markdown 报告。
- 电脑端和手机端响应式布局。

## 第一版创新点

系统不做自动打分，而是做“证据链式课堂复盘”。每条 AI 结论都必须绑定视频时间点和课堂原文，并经过教师确认后才能进入报告。第一版不做视频 OCR、画面证据框选或课件分析，只基于语音转文字与时间戳分析。

## 模拟与真实后端

前端仍保留 localStorage 演示数据，方便没有后端环境时预览完整交互。接入后端后，视频会先直传 Cloudflare R2，Supabase PostgreSQL 只保存文件归属、对象地址和处理状态，后端再从 R2 读取视频完成音频抽取、语音识别和证据分析。

## 平台分工

| 账号/平台 | 负责的主要功能 | 关键配置 |
|---|---|---|
| Supabase | PostgreSQL 数据库、教师登录、保存课堂/逐字稿/证据卡片/复核结果/报告 | `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`DATABASE_URL`、`DIRECT_URL` |
| Google Cloud | 部署前端和 API、运行后台视频处理任务、构建和保存 Docker 镜像、保存密钥、查看日志 | Cloud Run、Cloud Run Jobs、Cloud Build、Artifact Registry、Secret Manager、Logging |
| Cloudflare | 使用 R2 存储课堂原始视频、临时音频和导出文件；提供预签名上传与播放 | `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_ENDPOINT` |
| 阿里云 | ASR 将课堂音频转为带时间点逐字稿；LLM 将逐字稿生成课堂事件、证据卡片和报告 | DashScope API Key；LLM 的 `BASE_URL`、`API_KEY`、`MODEL` |
| GitHub | 保存代码、版本管理、让 AI Agent 修改和提交项目 | 代码仓库及访问权限 |

## 本地运行

直接打开 `index.html` 即可使用。

如需用本地服务预览：

```bash
python3 -m http.server 8080
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

真实 ASR 流程：后端抽取 wav 音频后上传到 R2，生成临时读取 URL，提交给 `qwen3-asr-flash-filetrans`，轮询 DashScope 任务，下载 `transcription_url` 里的 JSON，并把 `sentences[].begin_time/end_time/text` 写入逐字稿表。

4. 安装依赖并初始化数据库：

```bash
npm install
npm run db:init
npm start
```

前端默认请求同源 `/api`。如果前端部署在 GitHub Pages、后端部署在其他域名，可在浏览器控制台设置：

```js
localStorage.setItem("classReflectApiBase", "https://你的后端域名")
```

然后刷新页面。

## Google Cloud 上线步骤

第一版建议先把 API 和前端一起部署到 Cloud Run。视频处理暂时在 API 服务内异步执行，Cloud Run 需要配置较长 timeout；后续再拆成 Cloud Run Jobs。

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

4. 用 Cloud Build 构建和部署：

```bash
gcloud builds submit --config cloudbuild.yaml
```

5. 部署后确认 Cloud Run 的 Variables & Secrets 中已绑定：

```text
APP_CONFIG_ENV=APP_CONFIG_ENV:latest
```

6. 打开健康检查：

```text
https://你的-cloud-run-url/api/health
```

返回 `ok: true` 后，再初始化数据库并测试上传链路。

可选：如果需要让 Cloud Run 直接检测阿里云 ASR，可以在 `APP_CONFIG_ENV` 里临时加入 `DEBUG_TOKEN`，重新部署后调用：

```bash
curl -X POST "https://你的-cloud-run-url/api/debug/asr-smoke-test" \
  -H "Content-Type: application/json" \
  -H "x-debug-token: 你的 DEBUG_TOKEN" \
  -d '{}'
```

接口会使用线上同一套 Secret 和网络，转写一个公开测试音频，并返回前几段逐字稿。调试结束后建议删除 `DEBUG_TOKEN` 或换成不可猜测的长随机值。

## GitHub Pages 部署

1. 将本仓库推送到 GitHub。
2. 进入 GitHub 仓库的 Settings。
3. 打开 Pages。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后等待部署完成。

## 测试方式

成功流程：

1. 输入复盘目标。
2. 选择一段课堂视频。
3. 查看系统生成的大段课堂记录示例。
4. 点击时间段，视频和课堂记录同步切换。
5. 在右侧 AI 任务助手点击“查看依据”。
6. 接受、修改后接受或驳回证据。
7. 点击“预览报告”导出 Markdown。

失败流程：

1. 真实后端接入后，可在处理过程卡片显示失败步骤。
2. 当前前端原型已预留“重试当前步骤 / 查看失败原因”的产品位置。
