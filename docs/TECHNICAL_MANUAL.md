# 课堂复盘与教学分析系统技术手册

本文是当前项目的主技术手册。它以最新版产品约束为准，并吸收仓库中已经跑通的实现：React + TypeScript + Vite 前端、Node/Express 过渡 API、Supabase PostgreSQL、Cloudflare R2、Google Cloud Run、阿里云 ASR/LLM，以及正在预留的 Python FastAPI 长期后端骨架。

M1 的目标不是一次性做完整商业平台，而是跑通一条真实、可追溯、可扩展的核心链路：

```text
真实课堂视频
→ 对象存储
→ 音频抽取或独立音频通道
→ 带时间点 ASR
→ 大段课堂记录
→ 教师校订
→ 按需翻译
→ 候选证据
→ 教师复核
→ 只使用确认内容生成报告
```

## 1. M1 产品定位

M1 是面向中国课堂的、基于视频语音证据的教学复盘 Agent。

它不自动给教师打分，也不判断教师“好不好”，而是帮助使用者快速回答：

- 哪些阶段讲得明显较快；
- 哪些片段连续讲授时间较长；
- 教师提出问题后是否真正留给学生思考；
- 问题是自问自答、齐答还是个体回答；
- 学生回答后，教师进行了怎样的反馈；
- 哪些表达包含笼统理解检查、填充词或模糊指代；
- 课堂在讲授、互动、练习、反馈和总结之间如何分配；
- 每一个分析结论对应哪段视频和哪句原文；
- 哪些内容经教师确认后可以写入报告。

M1 的产品形态是：

```text
可追溯课堂记录
+
课堂行为指标
+
AI 候选诊断
+
教师人工复核
+
确认后报告
```

## 2. 当前版本边界

当前版本采用单工作空间设计：

- 第一版只分析一节课或多节独立课堂记录；
- 没有正式登录系统；
- 不区分不同用户、教师、学校或组织；
- 不做多租户、权限、订阅和配额；
- 不做视频 OCR，不基于画面判断学生注意力；
- 翻译由教师点击触发，不默认翻译整节课；
- 教师审核证据是正式的 Human-in-the-Loop 节点；
- M1 建立基础 Guardrail、Observability 和 Evaluation，不急着上完整 RAG、长期 Memory 和复杂 Agent 框架。

历史实现中仍保留 `teacher_id = demo-teacher`，这是为了兼容现有 API 和删除逻辑，不代表 M1 已经有多用户隔离。文档和后续开发中应把它视为单工作空间占位字段。

无登录不等于没有数据安全。M1 仍必须做到：

- 视频保存在私有 Cloudflare R2；
- 访问视频使用短期签名 URL；
- API Key 只保存在后端或 Google Secret Manager；
- 不把原始视频放进数据库；
- 不生成永久公开视频链接；
- 删除课堂时同步删除或标记删除对象文件；
- 页面明确提示当前版本是单工作空间，不支持多人数据隔离。

如果公开部署到互联网，建议至少加一个简单访问口令或平台层访问限制。这不是完整用户系统，只是避免任何人都能打开课堂视频。

## 3. 技术选型

| 层 | 当前状态 | 长期方向 |
| --- | --- | --- |
| 前端 | React + TypeScript + Vite 已作为目标骨架 | 保持 |
| API | Node/Express 已跑通真实链路 | 逐步迁移到 Python FastAPI |
| Worker | Node worker 已跑通队列认领、R2、FFmpeg、ASR、写库 | 逐步迁移到 Python Worker |
| 数据库 | Supabase PostgreSQL | 保持 |
| 对象存储 | Cloudflare R2 | 保持 |
| 部署 | Google Cloud Run / Cloud Run Jobs / Cloud Build | 保持 |
| ASR | 阿里云 `qwen3-asr-flash-filetrans` | 保持 Provider 接口，允许替换 |
| LLM/翻译 | 阿里云兼容 OpenAI 接口 | 保持 Provider 接口，允许替换 |

原则：

```text
确定性计算 → 规则或代码
单步骤能力 → Tool
语义判断 → Agent
价值判断 → Human-in-the-Loop
流程控制 → Workflow
长期保存 → 数据库
```

## 4. 总体架构

```text
Frontend
  课堂库 / 上传 / 视频 / 大段课堂记录 / 对话助手 / 证据 / 报告
    │ HTTP
Backend API
  课堂、视频、上传凭证、状态查询、校订、翻译、报告接口
    │
Workflow Orchestrator
  状态机、阶段切换、任务决策、Agent 选择、暂停等待教师
    │
Worker
  后台认领任务、重试、超时、日志、并发控制
    │
Processor / Pipeline
  视频转写、分段、翻译、证据生成、报告生成
    │
Integration / Infrastructure
  R2、Supabase/PostgreSQL、FFmpeg、阿里云 ASR、LLM
```

当前代码落点：

| 职责 | 当前文件 |
| --- | --- |
| 前端主界面 | `apps/web/src/main.tsx` |
| 前端 API Client | `apps/web/src/api/client.ts` |
| 前端课堂模型 | `apps/web/src/features/lesson-review/model.ts` |
| 当前 API 入口 | `apps/api/index.js` |
| 当前 Worker 入口 | `apps/worker/index.js` |
| 过渡视频处理器 | `apps/api/processor.js` |
| Agent Orchestrator 骨架 | `apps/api/src/application/agent-orchestrator.js` |
| 课堂分段规则 | `apps/api/src/pipelines/lesson-sectioning.js` |
| R2 适配 | `apps/api/src/infrastructure/storage/object-storage.js` |
| 阿里云 ASR 适配 | `apps/api/src/integrations/asr/asr-provider.js` |
| LLM/翻译适配 | `apps/api/src/integrations/llm/llm-provider.js` |
| PostgreSQL 适配 | `apps/api/src/integrations/supabase/postgres.js` |
| Python FastAPI 骨架 | `apps/api_python/` |

## 5. 课堂模式

M1 固定三种课堂模式。前端在“拖入或选择课堂视频”后要求教师选择，后端保存到 `lessons.lesson_format`。

| 数据值 | 页面名称 | 分析重点 |
| --- | --- | --- |
| `offline_classroom_recording` | 线下课堂录像 | 语速、连续讲授、提问链、学生音频回答、齐答、反馈、讲练结构 |
| `live_online_class` | 直播网课 | 语速、讲授结构、连麦问答、可听见学生回答、技术停顿提示 |
| `recorded_online_class` | 录播网课 | 语速、内容结构、表达清晰度、信息密度、示例和总结 |

录播网课不适合分析学生参与、等待学生回答、课堂反馈链。直播网课如果没有聊天记录，不能把未回应简单解释为学生反应慢。

## 6. M1 Agent 与 Tool 边界

M1 推荐采用 1 个 Agent Orchestrator、5 个逻辑 Agent，以及若干普通 Tool 和规则引擎。5 个 Agent 是逻辑角色，不是 5 个独立微服务。

| 组件 | M1 职责 | 当前状态 |
| --- | --- | --- |
| 课堂任务与画像 Agent | 明确复盘目标、课堂模式、可分析维度 | 预留 |
| 逐字稿整理 Agent | 整理 ASR 分段、说话人、语言、低置信度 | 部分由分段规则承担 |
| 课堂事件与互动 Agent | 识别提问、回答、齐答、自答、追问和反馈链 | 待实现 |
| 教学证据 Agent | 将指标和事件转为事实、谨慎判断、建议及证据卡 | 已有接口骨架，需强化 Guardrail |
| 报告 Agent | 只使用教师确认内容生成报告 | 基础 Markdown 报告已实现 |
| Translation Tool | 教师点击后翻译片段 | 已实现为可选链路 |
| Metrics Engine | 语速、停顿、连续讲授、问题等待等确定性计算 | 待从规则伪判断中拆出 |
| Evidence Validator | 校验证据来源、时间点、事实与建议关系 | 待实现 |

Orchestrator 不负责教学判断，只负责控制 AI 工作：

- 根据课堂模式选择规则集；
- 组织 Agent 调用顺序；
- 读取 Prompt 版本；
- 将长逐字稿切分成分析窗口；
- 校验 Agent 输出 Schema；
- 调用 Guardrail；
- 失败重试；
- 记录 Agent Run；
- 在证据生成后暂停等待教师审核；
- 只有审核完成后才允许生成报告。

Orchestrator 不应该做：

- 不直接修改教师确认内容；
- 不直接给教师打分；
- 不绕过 Evidence Validator；
- 不自动发布报告；
- 不负责 FFmpeg 或 ASR。

## 7. 真实处理链路

当前已跑通或已接近跑通的 M1 链路：

```text
web 选择视频
→ web 确认课堂类型
→ api 创建 lesson 和 lesson_video
→ api 生成 R2 预签名上传地址
→ web 直传视频到 R2 并显示上传进度
→ web 尝试并行生成 ASR 用音频并上传到 R2
→ api 确认视频对象存在并创建 workflow_run / workflow_step_runs
→ worker 认领 queued workflow
→ worker 优先使用已上传音频；没有音频时从 R2 读取视频并用 FFmpeg 抽取音频
→ worker 将临时音频上传回 R2
→ worker 调用阿里云 ASR 生成带时间点逐字稿
→ worker 写入 transcript_segments
→ worker 聚合 lesson_sections
→ web 展示大段课堂记录
→ 教师编辑并保存课堂记录
→ 教师按需点击翻译
→ api 生成基础课堂记录报告
```

视频保存和音频处理必须解耦：

```text
通道 A：浏览器直传原始视频到 R2，用于长期归档和播放
通道 B：浏览器或 worker 生成 ASR 音频，独立上传或回退抽取
```

这样 ASR 不必永远等待“视频上传完成后再下载视频、再抽音频”，后续可演进为边缘媒体任务或专门 Python/FFmpeg worker。

## 8. 数据库设计

当前数据库以已实现表为准。

### 已实现核心表

| 表 | 用途 |
| --- | --- |
| `lessons` | 课堂基本信息、课堂类型、状态 |
| `lesson_videos` | 视频对象、音频对象、上传状态、处理状态 |
| `analysis_tasks` | 旧任务表，兼容现有流程 |
| `workflow_runs` | 新流程状态源 |
| `workflow_step_runs` | 每个处理步骤的状态、进度和错误 |
| `transcript_segments` | ASR 原始小段、时间点、原文、译文、校订字段 |
| `lesson_sections` | 3-5 分钟左右的大段课堂记录和编辑结果 |
| `evidence_cards` | 候选证据卡、结论、建议、复核状态 |
| `reports` | Markdown 报告和导出对象 |

### M1 需要继续补齐的表或字段

| 目标 | 建议 |
| --- | --- |
| 翻译独立留痕 | 新增 `translations`，或先继续使用 `transcript_segments.translated_text` |
| 课堂画像 | 新增 `classroom_profiles` |
| 课堂事件 | 新增 `classroom_events` |
| 问题链 | 新增 `question_chains` |
| 确定性指标 | 新增 `classroom_metrics` |
| 证据来源 | 新增 `evidence_sources`，避免只把引用塞在 `evidence_cards.quote_text` |
| Agent 运行日志 | 新增 `agent_runs` |
| 对话状态 | 可新增 `conversation_messages`，直接关联 `lesson_id` |

### 未来演进

当前 `lesson_videos` 可以在 M2/M3 演进为更通用的 `lesson_assets`，支持：

```text
video
audio
chat_log
slide
exported_report
```

但 M1 暂时不上传课件，不需要为了未来扩展立刻迁移表名。

M1 不建议在每张表预先加入：

```text
organization_id
owner_user_id
created_by
tenant_id
```

等正式登录、多用户和组织管理进入 M3 时，再做迁移。

## 9. 逐字稿与校订

ASR 不是 Agent，逐字稿整理才是 Agent。

M1 当前已实现：

- ASR 返回带时间点小段；
- 小段写入 `transcript_segments`；
- 后端聚合成大段 `lesson_sections`；
- 前端展示大段课堂记录；
- 教师可以直接编辑大段文本，不需要逐句确认；
- 原始 ASR 文本保留，编辑文本另存。

M1 后续应补齐：

- 说话人角色：教师、学生、多人、未知；
- 语言标记：中文、英文、中英混合；
- 低置信度和待复核原因；
- 分句合并或拆分；
- 专业术语标记；
- 逐字稿整理 Agent 的 schema 校验。

教师校订可修改：

- 原文；
- 说话人；
- 分段；
- 术语；
- 英文译文。

必须保留原始 ASR 结果，不能用教师编辑结果覆盖唯一事实来源。

## 10. 翻译设计

翻译默认由教师点击触发，不自动翻译整节课。

支持操作：

- 翻译单句；
- 翻译选中片段；
- 重新翻译；
- 编辑译文；
- 可选翻译全部英文片段。

当前采用 LLM Provider 实现翻译，因为课堂中可能有中英混合、学科术语、不完整口语和上下文指代。架构上必须保留 Provider 接口，后续可以替换为专业机器翻译服务。

## 11. Metrics Engine

所有可确定性计算的指标都不应交给 LLM 数数。

M1 推荐优先实现：

- `speech-rate.metric`：有效字数 / 实际发言分钟；
- `speaking-time.metric`：教师、学生、未知说话时长；
- `continuous-lecture.metric`：教师连续发言时长；
- `pause.metric`：长停顿；
- `wait-time.metric`：教师问题结束到首个回应；
- `question-count.metric`：问题数量；
- `question-chain.metric`：问题、等待、回答、反馈链；
- `feedback-count.metric`：反馈类型统计；
- `language-pattern.metric`：填充词、笼统理解检查、指令性语言；
- `lesson-structure.metric`：讲授、互动、练习、反馈、总结分布；
- `information-density.metric`：语速、术语、概念切换、停顿、示例组合提示。

信息密度不输出黑箱总分，只输出可观察原因。

## 12. 中国课堂重点事件

课堂事件 Agent 识别的是课堂行为，不是直接评价教学质量。

通用事件：

- `teacher_explanation`
- `teacher_question`
- `student_response`
- `teacher_feedback`
- `teacher_follow_up`
- `activity_instruction`
- `student_practice`
- `lesson_summary`
- `classroom_management`
- `technical_interruption`

中国课堂重点事件：

- `teacher_self_answer`
- `choral_response`
- `individual_response`
- `named_student_response`
- `generic_comprehension_check`
- `specific_comprehension_check`
- `answer_replacement`
- `transfer_to_another_student`

重点创新：

- 自问自答：教师提出问题后很短时间内自己作答，不计为真实学生互动；
- 齐答：反映课堂节奏，但不能证明所有学生理解；
- 笼统理解检查：如“听懂了吗、明白了吗、有没有问题”；
- 具体理解检查：如“请解释原因、请举例、请比较、请用自己的话说明”；
- 反馈类型：结果确认、泛泛表扬、具体肯定、直接纠错、提示性纠错、解释性反馈、追问性反馈、转问其他学生、教师直接代答、无明显反馈。

## 13. 证据与 Guardrail

教学证据 Agent 是 M1 的核心 Agent。每张候选证据卡必须分清：

```text
事实
判断
建议
不确定性
来源
```

核心约束：

```text
没有事实，不生成判断
没有证据，不生成结论
没有判断，不生成改进建议
不确定时，明确说不确定
```

不允许输出：

- 教师教学水平分数；
- 教师能力不足；
- 学生不认真；
- 学生没有理解；
- 教师课堂管理能力差；
- 该课堂效果优秀或不合格；
- 根据单节课进行教师排名；
- 把相关性写成因果性。

Evidence Validator 使用代码校验：

- `segment_id` 或 `section_id` 是否存在；
- 时间范围是否合法；
- 是否属于当前课堂；
- 引用文字是否与逐字稿一致；
- 判断是否有事实；
- 事实是否绑定指标或来源；
- 建议是否绑定判断；
- 是否引用未确认翻译；
- 是否包含不支持的分析维度；
- 是否出现空证据。

教学边界 Guardrail 检查：

- 自动评分；
- 人格评价；
- 无依据能力判断；
- 学生心理推断；
- 仅凭未开摄像头判断注意力；
- 将在线时长等同于有效学习；
- 将网络延迟解释为学生反应慢；
- 将齐答解释为全班掌握；
- 将未发言解释为未参与。

## 14. Human-in-the-Loop

教师证据审核不是附加功能，而是工作流正式暂停节点。

```text
AI 生成候选证据
→ 程序 Guardrail
→ 教师审核
→ 接受 / 修改 / 驳回 / 需要更多上下文
→ 报告生成
```

审核状态：

```text
pending_review
accepted
edited_and_accepted
rejected
needs_more_context
```

当前表中已有中文状态占位，例如 `待复核`。后续应逐步统一为稳定枚举值，前端再映射为中文文案。

证据卡操作：

- 播放对应视频时间点；
- 查看逐字稿；
- 查看指标；
- 展开前后文；
- 修改事实描述；
- 修改判断；
- 修改建议；
- 写审核备注；
- 接受；
- 驳回；
- 要求重新分析。

由于 M1 无用户系统，不需要 `reviewed_by`。可以固定记录 `reviewed_by_role = operator`，或暂时省略。

## 15. 报告 Agent

报告 Agent 只能读取以下状态的证据：

```text
accepted
edited_and_accepted
```

不允许：

- 再次分析原始逐字稿；
- 新增未审核判断；
- 改写教师确认后的含义；
- 删除证据时间点；
- 将被驳回证据写入报告。

M1 报告结构：

```text
# 课堂复盘报告

## 1. 课堂基本信息
## 2. 本次复盘目标
## 3. 素材与分析范围
## 4. 课堂结构与关键指标
## 5. 教师确认的主要发现
## 6. 证据详情
## 7. 下一次课堂可尝试的改进
## 8. 分析限制与不确定性
```

M1 可先导出 Markdown 或 HTML，再考虑 PDF。

## 16. 前端工作区

当前前端采用浅色、双区工作台：

- 左侧或主区：视频、上传、课堂分段、大段课堂记录；
- 右侧：AI 任务助手、阶段进度、对话、处理卡片、证据卡片、报告操作。

电脑端应完整支持上传、预览、校订、证据核对、报告编辑。手机端重点支持查看、播放、快速标注、快速确认，不能把桌面复杂布局硬压成三栏。

核心页面：

1. 首页课堂库：查看所有课堂视频、状态、删除记录；
2. 新建课堂：课堂标题、课堂模式、学段、学科、复盘目标、视频上传；
3. 处理进度：上传视频、抽取音频、生成逐字稿、整理逐字稿、计算指标、识别事件、生成证据、等待审核；
4. 逐字稿：时间轴、大段编辑、说话人、原文、按需翻译、跳转视频；
5. 课堂概览：课堂节奏、课堂语言、互动链路；
6. 证据审核：待审核、已接受、已修改、已驳回、需要更多上下文；
7. 报告：预览、编辑、导出。

## 17. Observability

M1 必须有基础观测，不需要接复杂 LLMOps 平台。

需要记录：

- 哪个 workflow 步骤失败；
- 使用哪个模型；
- 使用哪个 Prompt 版本；
- 输入和输出 Token；
- 耗时；
- 重试次数；
- Schema 是否通过；
- 生成了多少事件；
- 生成了多少证据；
- Guardrail 驳回了多少证据。

开发模式可增加 `/diagnostics`，展示 workflow run、agent run、当前步骤、错误信息、模型耗时和证据校验结果。普通使用者不需要看到完整 Prompt 和原始模型调用内容。

## 18. Evaluation

M1 应建立 5-10 个离线评测片段：

- 正常中文讲授；
- 教师自问自答；
- 全班齐答；
- 学生个体回答；
- 提问后长等待；
- 教师泛泛表扬；
- 中英混合；
- 学生声音较弱；
- 直播网课技术中断；
- 录播课无学生互动。

分模块评测：

- 逐字稿整理：时间戳、原文保留、说话人、低置信度；
- 课堂事件：提问、自问自答、齐答、反馈、互动链；
- 证据：引用正确、事实支撑、拒绝无证据判断、无越界评价、时间点可播放；
- 翻译：原文保留、术语一致、中英混合、教师修改保存。

HITL 在线质量信号：

```text
接受率
修改后接受率
驳回率
需要更多上下文比例
平均审核时间
```

这些是产品质量信号，不能简单等同为模型准确率。

## 19. Memory 与 RAG

M1 不需要复杂 Agent Memory。

M1 只保存业务状态：

- 当前课堂；
- 复盘目标；
- 课堂画像；
- 已选择分析维度；
- 教师修改的逐字稿；
- 教师审核结果；
- 报告版本。

这些都进入数据库，不需要向量化。

M1 暂时不需要完整 RAG。当前分析对象是单节课，结构化数据库查询、关键词检索、时间窗口检索比向量检索更稳定。M2 比较两轮相似教学情境时，再加入轻量语义检索；M3 结合多门课程、课件、教学规范时，再正式引入 pgvector、Hybrid Search、Metadata Filter、Reranker 和 Citation。

## 20. M1 完整工作流

```text
1. 创建课堂
2. 选择课堂模式
3. 输入复盘目标
4. 上传视频
5. 素材质量检查
6. 显示可分析能力
7. 并行音频通道或 FFmpeg 抽音频
8. ASR 生成带时间戳逐字稿
9. 逐字稿整理 Agent
10. 教师校订逐字稿
11. 按需点击翻译
12. Metrics Engine 计算指标
13. 课堂事件与互动 Agent
14. 教学证据 Agent
15. Evidence Validator + Guardrail
16. 教师 HITL 审核
17. 报告 Agent
18. 教师编辑、预览和导出
```

## 21. M1 开发范围

### P0 必须真实实现

- 无登录单工作空间；
- 创建课堂；
- 课堂模式选择；
- 视频上传到对象存储；
- FFmpeg 抽音频或独立音频通道；
- 真实 ASR；
- 带时间戳逐字稿；
- 逐字稿修改；
- 点击翻译；
- 教师语速；
- 连续讲授；
- 教师提问；
- 自问自答；
- 学生回答；
- 等待时间；
- 反馈类型；
- 至少生成三类证据卡；
- 点击证据跳转视频；
- 接受、修改、驳回；
- 报告只使用确认内容；
- 基础日志、错误和重试。

### P1 最值得展示的创新

- 课堂节奏曲线；
- 结尾加速提示；
- 齐答与个体回答区分；
- 笼统理解检查；
- 问题、等待、回答、反馈链；
- 信息密度提示；
- 课堂语言模式；
- 可分析能力矩阵；
- 不确定性提示。

### P2 有余力再做

- 直播聊天记录 CSV 导入；
- 课件页关联；
- 模糊指代结合课件；
- 课堂画面截图作为证据；
- 更细的课堂结构；
- 报告 PDF 导出。

### M1 不建议做

- 登录和多用户；
- 多租户；
- 教师排名；
- 自动教学评分；
- 学生注意力识别；
- 情绪识别；
- 长期教师画像；
- 完整 RAG；
- 知识图谱；
- LangGraph；
- 多模型自动路由；
- 实时直播分析；
- 学校级管理后台。

## 22. M2/M3 演进

M2 聚焦第二轮课堂改进：

- Improvement Plan Agent；
- Comparison Agent；
- 教师术语表；
- 同课程轻量 RAG；
- Prompt 回归测试；
- 跨课堂 Trace；
- 结构化课堂历史。

M3 聚焦多课程和商业化：

- 登录；
- 用户；
- 组织；
- 多租户隔离；
- 权限；
- 课程管理；
- 教师长期趋势；
- 多课程报告；
- 正式 RAG；
- 模型路由；
- 成本配额；
- 审计日志；
- 合规和数据保留策略。

无登录版升级到多用户时，再为核心表补 `organization_id`、`owner_user_id`、`created_by` 等字段。

## 23. 目录规范

本节只记录当前仓库目录与近期迁移方向。更完整的文件架构、模块拆分和长期分层标准，以 `ARCHITECTURE_BASELINE.md` 为准；但 baseline 不能反向扩大当前 M1 的功能范围。

现有目录：

```text
apps/
  web/                 React + TypeScript + Vite 前端
  api/                 当前 Node/Express API 与过渡实现
  api_python/          Python FastAPI 长期后端骨架
  worker/              当前后台任务入口
docs/                  产品方案、架构说明、技术手册
infra/                 Docker、Cloud Run、Cloud Build
temp/                  临时测试脚本，不进入正式链路
tests/                 后续自动化测试
```

后续目标目录：

```text
apps/
  web/
    lesson-create/
    processing/
    transcript/
    classroom-overview/
    evidence-review/
    report/
  api_python/
    app/
    domain/
    application/
    pipelines/
    infrastructure/
    integrations/
    workers/

packages/
  database/
  shared-types/
  prompts/
  rule-sets/
  llm-provider/
```

每个 Agent 后续应按统一结构组织：

```text
agent.py
prompt.py
schema.py
validator.py
examples.json
agent_test.py
```

## 24. 部署与配置

平台分工：

| 平台 | 负责内容 |
| --- | --- |
| Supabase | PostgreSQL 数据库，保存课堂、视频元数据、逐字稿、证据、报告 |
| Cloudflare R2 | 原始视频、临时音频、导出报告文件 |
| Google Cloud | Cloud Run API、Cloud Run Job、Cloud Build、Artifact Registry、Secret Manager、Logging |
| 阿里云 | ASR、LLM、按需翻译 |
| GitHub | 代码版本管理和线上部署源 |

Google Secret Manager 使用 `APP_CONFIG_ENV` 保存 JSON 配置。Cloud Run Service 和 Cloud Run Job 都要绑定该 Secret。

关键配置：

```text
DATABASE_URL
DIRECT_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
ASR_PROVIDER=aliyun
ALIYUN_DASHSCOPE_API_KEY
ALIYUN_ASR_MODEL=qwen3-asr-flash-filetrans
ALIYUN_ASR_BASE_URL
LLM_BASE_URL
LLM_API_KEY
LLM_MODEL
FRONTEND_ORIGIN
```

本地开发：

```bash
npm install
npm run db:init
npm run web:dev
npm start
npm run worker
```

线上部署：

```bash
gcloud builds submit --config infra/google-cloud/cloudbuild.yaml
gcloud run jobs execute class-reflect-worker --region asia-southeast1 --wait
```

健康检查：

```text
https://你的-cloud-run-url/api/health
```

## 25. 最终原则

这套 M1 架构不是“很多 Agent 自主协作”，而是一个可控的证据生产流程：

```text
课堂任务与画像 Agent
→ 真实视频处理与 ASR
→ 逐字稿整理 Agent
→ Metrics Engine
→ 课堂事件与互动 Agent
→ 教学证据 Agent
→ 程序 Guardrail
→ 教师 Human-in-the-Loop
→ 报告 Agent
```

周边能力明确分类：

```text
ASR                  外部模型服务
FFmpeg               媒体工具
翻译                 点击触发 Tool
语速与等待时间        确定性 Metrics Engine
证据合法性            Validator / Guardrail
证据是否适合教学判断   Human-in-the-Loop
课堂语义分析          Agent
报告整理              Agent
任务运行与失败重试     Workflow
运行日志              Observability
质量验证              Evaluation
当前课堂上下文         业务数据库
跨资料语义检索         M2/M3 再使用 RAG
```

后续任何新增功能都必须先回答：它属于前端、API、Orchestrator、Worker、Pipeline、Integration、Infrastructure、Domain、Database、Evaluation 里的哪一层。不能再把临时判断散落在页面、路由或 Worker 中。
