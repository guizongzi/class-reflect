# 工作流配置与输出契约

服务端从 `src/workflow/default.json` 与 `src/workflow/scene-profiles.json` 合并配置，校验后生成版本和内容哈希；重试使用持久化快照。客户端场景规则只通过 `@class-reflect/config/browser` 获取，不加载 Node.js 的异步上下文或哈希模块。

开发环境选择 `LLM_MODEL=qwen3.7-flash`、`WORKFLOW_MODEL_PROFILE=qwen3.7-flash`，配合 Singapore 兼容端点启用原生严格 Schema。该预设单独配置模型、端点白名单及完整字段契约；不设置 profile 时仍使用通用 JSON Object 默认配置。旧任务已持久化的配置快照不会自动替换。

真实调用已验证原生 Schema、数组格式故障后的重试和一次 429 后重试；业务规则仍会拒绝过强的教学判断，格式正确不代表证据正确。见 `docs/validation/2026-10-21-qwen37-flash.md`。此前 qwen-max 的失败记录保留为历史证据。

原生模式需要同时显式配置 `llm.responseFormat=json_schema`、`strictSchemaModels` 和 `strictSchemaEndpoints`，运行时匹配当前模型与端点。空白名单默认拒绝。原生模式通过请求参数发送 Schema；JSON Object 模式在严格工作流的 system 消息中附加一次配置中的输出契约，本地仍严格校验。

Schema 的 `required` 可以是 `properties` 的合法子集，未列为必填的字段可省略；`required` 引用不存在字段会在加载时拒绝。项目仍要求原生模式对象设置 `additionalProperties=false`。该限制是本项目约束，不代表所有厂商 API 的要求。

参考：[阿里云 Structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)。能力以具体模型、端点与当前官方说明为准。
