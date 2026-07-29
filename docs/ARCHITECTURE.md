# 架构说明

第一版只实现基础链路，但目录按可扩展产品组织。

## 目录

```text
apps/
  web/                 前端页面、样式和浏览器交互
  api/                 后端 API、视频处理、数据库和对象存储
    modules/
      auth/            用户、教师、权限与账号隔离
      uploads/         视频上传、对象存储、文件归属
      transcripts/     ASR 时间轴、课堂记录、人工校订
      analysis/        AI 教学分析、证据卡片、复核工作流
      reports/         报告生成、导出文件
docs/                  产品方案、架构说明、验收说明
infra/                 Docker、Cloud Run、Cloud Build 等部署配置
temp/                  临时测试脚本、一次性调试文件，本目录内容不进入正式链路
tests/                 后续自动化测试
```

## 当前真实链路

```text
web 选择视频
→ api 创建 lesson 和 video 记录
→ api 生成 Cloudflare R2 预签名上传地址
→ web 直传视频到 R2 并显示上传进度
→ api 确认对象存在并创建处理任务
→ processor 从 R2 读取视频
→ ffmpeg 抽取音频
→ ASR 生成带时间点逐字稿
→ PostgreSQL 保存 transcript_segments 和 lesson_sections
→ web 展示、编辑并保存课堂记录
→ api 导出基础课堂记录报告
```

## 后续扩展原则

- 用户系统写入 `apps/api/modules/auth`。
- 上传和对象存储能力写入 `apps/api/modules/uploads`。
- 时间轴、转写、校订能力写入 `apps/api/modules/transcripts`。
- AI 分析和证据卡片写入 `apps/api/modules/analysis`，不要写规则伪结论冒充 AI。
- 报告模板和导出能力写入 `apps/api/modules/reports`。
- 临时测试脚本放入 `temp`，验证后要么删除，要么迁入正式模块或 `tests`。
