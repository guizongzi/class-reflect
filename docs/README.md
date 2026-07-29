# 文档入口

当前开发只以 `TECHNICAL_MANUAL.md` 作为主技术手册。

| 文件 | 当前状态 | 用途 |
| --- | --- | --- |
| `TECHNICAL_MANUAL.md` | 主文档 | M1 产品边界、技术选型、真实链路、数据库、Agent/Tool/Worker 分工 |
| `MVP产品设计及技术方案.md` | 产品简版 | 用于快速理解 MVP 交互与验收，不作为数据库和架构最终依据 |
| `ARCHITECTURE.md` | 架构速览 | 用于快速查看目录和分层，详细规则以主技术手册为准 |
| `ARCHITECTURE_BASELINE.md` | 历史长期标杆 | 保留长期想象力，但其中 M1 登录、多租户、OCR、强制翻译等内容已被主技术手册覆盖 |

如果这些文件互相冲突，优先级固定为：

```text
TECHNICAL_MANUAL.md
→ ARCHITECTURE.md
→ MVP产品设计及技术方案.md
→ ARCHITECTURE_BASELINE.md
```
