# app layer

FastAPI 应用入口、路由注册、请求响应 DTO、鉴权中间件放在这里。

路由只做：

- 解析请求。
- 调用 application service / orchestrator。
- 返回响应。

路由不直接调用 ASR、LLM、R2、FFmpeg 或数据库事务。
