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
| 阿里云 | ASR 将课堂音频转为带时间点逐字稿；LLM 将逐字稿生成课堂事件、证据卡片和报告 | ASR 的 AppKey/AccessKey；LLM 的 `BASE_URL`、`API_KEY`、`MODEL` |
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
ALIYUN_ASR_APP_KEY=...
ALIYUN_ACCESS_KEY_ID=...
ALIYUN_ACCESS_KEY_SECRET=...
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=...
LLM_MODEL=qwen-plus
FRONTEND_ORIGIN=https://你的前端域名
```

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
