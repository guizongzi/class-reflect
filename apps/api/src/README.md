# API source layout

后端正式实现应逐步迁入本目录。根目录下现有 `index.js`、`processor.js` 等文件属于第一版过渡实现，后续改动优先落到 `src/` 的对应层。

分层顺序：

```text
app -> application -> domain
application -> infrastructure / integrations
pipelines -> application / infrastructure / integrations
workers -> pipelines
```

禁止反向依赖：`domain` 不引用数据库、HTTP、R2、ASR 或 LLM SDK。
