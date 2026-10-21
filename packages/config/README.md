# 工作流配置与输出契约

服务端从 `src/workflow/default.json` 与 `src/workflow/scene-profiles.json` 合并配置，校验后生成版本和内容哈希；重试使用持久化快照。客户端场景规则只通过 `@class-reflect/config/browser` 获取，不加载 Node.js 的异步上下文或哈希模块。

当前项目使用 Singapore 端点与 `qwen-max`，没有配置或验证原生 JSON Schema 能力，保持 `json_object`。真实验收曾返回合法 JSON 但结构不合格，按失败处理；不能把 JSON Object 模式称作严格 Schema。没有切换区域或盲目更换模型。

原生模式需要同时显式配置 `llm.responseFormat=json_schema`、`strictSchemaModels` 和 `strictSchemaEndpoints`，运行时匹配当前模型与端点。空白名单默认拒绝。原生模式通过请求参数发送 Schema；JSON Object 模式在严格工作流的 system 消息中附加一次配置中的输出契约，本地仍严格校验。

Schema 的 `required` 可以是 `properties` 的合法子集，未列为必填的字段可省略；`required` 引用不存在字段会在加载时拒绝。项目仍要求原生模式对象设置 `additionalProperties=false`。该限制是本项目约束，不代表所有厂商 API 的要求。

参考：[阿里云 Structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)。能力以具体模型、端点与当前官方说明为准。
