# API source layout

后端正式实现应逐步迁入本目录。根目录下现有 `index.js`、`processor.js` 等文件属于第一版过渡实现，后续改动优先落到 `src/` 的对应层。

分层顺序：

```text
app -> application -> domain
application -> infrastructure / integrations
pipelines -> application / infrastructure / integrations
workers -> application/orchestrator -> pipelines -> infrastructure / integrations
```

禁止反向依赖：`domain` 不引用数据库、HTTP、R2、ASR 或 LLM SDK。

当前 M1 已建立轻量 Orchestrator：

- `application/agent-orchestrator.js`：决定任务阶段、Agent 类型和是否继续执行。
- `worker/index.js`：只负责认领和执行，不直接写产品决策。
- `processor.js`：保留为第一版视频转写 pipeline 过渡执行器，后续逐步拆入 `src/pipelines`。
