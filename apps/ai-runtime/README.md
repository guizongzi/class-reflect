# ai-runtime

M2/M3 可选 Python AI 服务预留目录。

M1 不启动这个服务。只有当系统需要本地模型、OCR、说话人分离、embedding、reranking 或更复杂的离线评测时，才在这里创建 FastAPI/Python runtime。

原则：NestJS API 是唯一对外业务入口，前端不直接访问 `ai-runtime`。
