# 文档入口

当前 M1 的产品范围、真实链路、数据库和部署以 `TECHNICAL_MANUAL.md` 为准；文件架构、目录分层、模块边界和长期可扩展性以 `ARCHITECTURE_BASELINE.md` 为标准。两者不是互相替代，而是分工不同。

| 文件 | 当前状态 | 用途 |
| --- | --- | --- |
| `TECHNICAL_MANUAL.md` | M1 主技术手册 | M1 产品边界、技术选型、真实链路、数据库、Agent/Tool/Worker 分工 |
| `MVP产品设计及技术方案.md` | 历史 MVP 方案摘要 | 用于回看早期产品交互和技术设想；当前开发、验收、技术选型、数据库和部署不以它为准 |
| `ARCHITECTURE.md` | 架构速览 | 用于快速查看目录和分层，详细规则以主技术手册为准 |
| `ARCHITECTURE_BASELINE.md` | 文件架构与长期架构标准 | 用于判断文件应放在哪一层、模块如何拆、长期如何扩展；不反向扩大当前 M1 功能范围 |

如果讨论“当前要不要做某个功能”，优先级为：

```text
TECHNICAL_MANUAL.md
→ ARCHITECTURE.md
→ MVP产品设计及技术方案.md
```

如果讨论“文件放哪、层怎么分、以后怎么扩展”，优先级为：

```text
ARCHITECTURE_BASELINE.md
→ TECHNICAL_MANUAL.md
→ ARCHITECTURE.md
```

规则：`ARCHITECTURE_BASELINE.md` 可以作为文件架构标准，但不能把登录、多租户、OCR、课件等长期能力提前变成当前 M1 必做功能。
