# Python FastAPI backend

这是新的长期后端骨架。选择 Python 的原因是项目核心是 AI Agent、长任务、文本处理、评测和模型编排，后续维护者也更熟 Python。

当前 Node/Express 后端仍保留为 legacy parity source：已有线上链路不立刻打断，但新增后端能力应优先进入本目录，并按下面职责分层：

```text
app/              FastAPI app、路由、请求响应 DTO
application/      Agent Orchestrator、用例服务、权限后的业务入口
domain/           课堂、视频、逐字稿、证据、报告等业务规则
pipelines/        视频转写、翻译、证据分析、报告生成等长链路
workers/          后台任务入口、队列消费、重试、日志、并发
infrastructure/   PostgreSQL、R2、FFmpeg、日志等基础设施
integrations/     阿里云 ASR、LLM 等外部服务适配器
shared/           配置、错误、时间、通用类型
```

禁止新增临时逻辑：

- 路由里不直接写 ASR、LLM、R2 SDK 调用。
- Worker 不决定产品策略，只执行 Orchestrator 给出的任务。
- Agent 不直接管理用户权限、数据库事务或对象归属。
- 前端不保存最终可信数据，不直接调用模型。

