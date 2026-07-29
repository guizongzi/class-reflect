# integrations layer

放外部系统适配器，例如：

- 阿里云 ASR
- 阿里云 / 兼容 OpenAI 的 LLM
- Supabase Auth
- Cloudflare API

这一层只负责“怎么调用外部系统”和“如何解析响应”，不负责课堂业务规则。
