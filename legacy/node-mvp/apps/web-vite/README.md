# Web frontend

前端长期骨架为 React + TypeScript + Vite。

分层：

```text
src/api/                    后端 API client 和 DTO 类型
src/features/lesson-review/ 课堂复盘核心功能
src/components/             可复用 UI 组件
src/state/                  页面状态与持久会话状态
```

原则：

- 前端只负责交互、上传进度、播放器、编辑器和状态展示。
- 前端不直接调用 ASR/LLM。
- 最终可信数据必须写回后端和数据库。
- AI 任务阶段由后端 workflow / orchestrator 返回，前端只展示。

