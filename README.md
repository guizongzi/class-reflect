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

## 模拟与待接入部分

前端仍保留 localStorage 演示数据，方便没有后端环境时预览完整交互。接入后端后，视频会先直传阿里云 OSS，数据库只保存文件归属、对象地址和处理状态，后端再从 OSS 读取视频完成音频抽取、语音识别和证据分析。

## 本地运行

直接打开 `index.html` 即可使用前端演示。

如需用本地服务预览：

```bash
python3 -m http.server 8080
```

然后访问：

```text
http://localhost:8080
```

## 后端运行

第一版后端使用阿里云 OSS 保存视频，数据库只保存文件归属、OSS object key 和处理状态，不保存视频二进制。

1. 准备 PostgreSQL。
2. 准备阿里云 OSS bucket，并配置 CORS 允许前端域名 `PUT` 上传。
3. 复制 `.env.example` 为 `.env`，填写：

```text
DATABASE_URL=postgres://...
S3_REGION=oss-cn-hangzhou
S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
S3_BUCKET=你的 bucket
S3_ACCESS_KEY_ID=你的 AccessKeyId
S3_SECRET_ACCESS_KEY=你的 AccessKeySecret
S3_FORCE_PATH_STYLE=false
FRONTEND_ORIGIN=https://guizongzi.github.io
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
