# Class Reflect 逐字稿处理 Agent 设计文档

## 1. 文档目标

逐字稿处理 Agent，以下简称 **Transcript Agent**，负责将语音识别系统输出的原始 ASR 数据，转换为一套：

- 可追溯；
- 可按句编辑；
- 可定位到视频时间；
- 可区分教师、单个学生、群体发言和未知说话人；
- 可保留语气词、重复、停顿、自我修正等课堂表达信号；
- 可直接供后续教学分析使用；
- 不需要下游 Agent 重复读取多份完整逐字稿；

的标准化课堂逐字稿数据。

Transcript Agent 不负责生成两份独立维护的“展示稿”和“分析稿”。

系统统一维护 Segment/Sentence 级事实数据，再根据使用场景动态生成：

- 教师前端展示投影；
- 后续分析输入；
- 局部证据原文；
- 章节与时间轴。

## 2. 核心架构

推荐数据流：

```
原始 ASR Segment
    ↓
输入校验与预处理
    ↓
Sentence Reconstruction
    ↓
Speaker Registry 与角色映射
    ↓
Transcript Agent Patch
    ↓
确定性 Patch 合并
    ↓
deliveryFeatures 与 TranscriptEvent
    ↓
教师编辑
    ↓
Effective Text / Effective Speaker
    ↓
├─ Section Builder
├─ 前端展示投影
├─ 下游分析 Input Builder
└─ Evidence 引用与报告
```

系统不保存以下多套独立文档：

```
完整原始稿
完整 Agent 稿
完整教师稿
完整分析稿
完整展示稿
```

而是在每个句子或 Segment 上维护必要字段，并动态构建使用视图。

## 3. 核心设计原则

### 3.1 原始 ASR 永不覆盖

`rawText` 是原始事实来源。

任何 Agent 修正、教师编辑、前端清理或下游分析，都不得覆盖原始 ASR 数据。

原始文本用于：

- ASR 错误回溯；
- 语气词和重复分析；
- 自我修正分析；
- 原始课堂证据核查；
- Agent 输出质量评估；
- 教师修改差异分析。

### 3.2 Agent 与教师修改分层保存

每个句子或 Segment 维护：

```
rawText
agentNormalizedText
teacherEditedText
```

含义分别为：

- `rawText`：原始 ASR 文本，不可修改；
- `agentNormalizedText`：Agent 纠错后的文本，可为空；
- `teacherEditedText`：教师人工编辑后的文本，可为空。

其中：

```
agentNormalizedText = null
```

表示 Agent 未修改该句。

```
teacherEditedText = null
```

表示教师未修改该句。

不额外持久化 `effectiveText`。

### 3.3 有效语义文本动态计算

后续内容、术语、知识点和教学证据分析统一使用：

```
teacherEditedText
→ 否则 agentNormalizedText
→ 否则 rawText
```

对应纯函数：

```
function resolveEffectiveText(sentence: TranscriptSentence): string {
  return (
    sentence.teacherEditedText ??
    sentence.agentNormalizedText ??
    sentence.rawText
  );
}
```

该逻辑必须集中实现，不能散落在不同业务模块中。

### 3.4 不生成两份完整逐字稿

数据库可以在单个 Sentence 上保存三层文本字段，但这不等于维护三份完整文档。

前端与分析模块只通过投影读取需要的字段。

下游 Agent 默认只接收：

- effective semantic text；
- compact delivery features；
- 时间轴；
- effective speaker；
- 必要的局部 raw excerpt。

不得默认同时发送完整原始稿和完整教师稿。

### 3.5 Agent 只处理语言理解任务

Transcript Agent 负责：

- 明显 ASR 错误修正；
- 专业术语修正；
- 标点和可读性整理；
- 说话人角色推断；
- 歧义与人工复核标记；
- 重复、自我修正等类型判断；
- 可选章节边界建议。

Transcript Agent 不负责：

- 统计句子数量；
- 统计教师和学生发言数量；
- 生成完整分析 projection；
- 生成完整前端文档；
- 计算确定性课堂指标；
- 决定工作流下一步；
- 覆盖数据库原始数据。

### 3.6 未确认内容不得被“修正确”

Transcript Agent 只能修复高置信度 ASR 错误。

不得：

- 把学生错误答案改成正确答案；
- 把教师未明确修正的口误自动改正确；
- 根据学科常识补充原音频未出现的内容；
- 把不完整表达扩写成完整讲解；
- 猜测无法确认的专业术语；
- 猜测数学公式、数字或单位；
- 为提升可读性而改变事实含义。

不确定时应：

```
保留原文
+
needsHumanReview = true
```

## 4. 系统输入

输入优先采用 ASR Segment 和词级时间数据。

```
interface AsrSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;

  speakerId?: string;
  speakerConfidence?: number;
  transcriptionConfidence?: number;

  words?: AsrWord[];
}

interface AsrWord {
  text: string;
  startMs: number;
  endMs: number;

  confidence?: number;
  speakerId?: string;
}
```

输入必须保留：

- 原始 Segment ID；
- 原始 speaker ID；
- 开始时间；
- 结束时间；
- 原始文本；
- 可用的 ASR 置信度；
- 可用的词级时间信息。

## 5. Sentence Reconstruction

### 5.1 为什么需要 Sentence

ASR Segment 不一定等于自然语言句子。

常见情况包括：

- 一个 Segment 包含多个完整句子；
- 一句话被拆成多个 Segment；
- 半句话因 ASR 分片被分开；
- 问题和回答被错误合并；
- 说话人切换发生在同一 Segment 内。

因此系统需要将 ASR Segment 重建为可引用的 Transcript Sentence。

### 5.2 Sentence 数据结构

```
interface TranscriptSentence {
  id: string;
  lessonId: string;
  order: number;

  startMs: number;
  endMs: number;

  timingPrecision:
    | "word"
    | "segment"
    | "estimated";

  sourceSegmentIds: string[];

  rawText: string;
  agentNormalizedText?: string | null;
  teacherEditedText?: string | null;

  rawSpeakerIds: string[];

  agentSpeakerRole?: SpeakerRole | null;
  agentSpeakerIdentityId?: string | null;

  teacherSpeakerRole?: SpeakerRole | null;
  teacherSpeakerIdentityId?: string | null;

  transcriptionConfidence?: number | null;
  speakerConfidence?: number | null;
  agentConfidence?: number | null;

  agentChangeTypes?: TranscriptChangeType[];

  needsHumanReview: boolean;
  reviewReason?: string | null;

  deliveryFeatures: DeliveryFeatures;

  version: number;
}
```

### 5.3 Sentence 切分依据

优先依据：

- 完整陈述结束；
- 完整问题结束；
- 指令结束；
- 说话人发生变化；
- 较长停顿；
- 问答轮次变化；
- 自我修正形成两个语义阶段；
- 教学活动或话题转换。

不应机械切分：

- 同一个问题中的多个条件；
- 未结束的数学推导；
- 同一条课堂指令；
- 因 ASR 分片产生的半句话；
- 很短但语义连续的表达。

短回答如：

```
不会
十八
不知道
是
不是
```

如果具有独立课堂意义，应保留为独立 Sentence。

### 5.4 Sentence ID 与来源映射

每个 Sentence 必须：

- 有稳定 ID；
- 记录来源 Segment ID；
- 保留时间范围；
- 支持回溯原始 ASR。

如果教师后续合并或拆分 Sentence，应保留旧 ID 到新 ID 的映射关系。

```
interface TranscriptSentenceMapping {
  oldSentenceId: string;
  newSentenceIds: string[];
  operation: "split" | "merge" | "replace";
}
```

## 6. Speaker Registry

### 6.1 角色与身份分离

必须区分：

```
Speaker Role
```

和：

```
Speaker Identity
```

角色表示：

- 教师；
- 单个学生；
- 群体学生；
- 多人重叠；
- 未知。

身份表示：

- Teacher 1；
- Student A；
- Student B；
- Student C；
- Unknown 1。

### 6.2 Speaker Role

```
type SpeakerRole =
  | "teacher"
  | "student"
  | "students"
  | "multiple"
  | "unknown";
```

含义：

- `teacher`：主要授课教师；
- `student`：可区分的单个学生；
- `students`：全班齐答、小组统一发言或群体朗读；
- `multiple`：多人重叠发言，无法可靠拆分；
- `unknown`：证据不足。

### 6.3 Canonical Speaker

```
interface CanonicalSpeaker {
  id: string;
  lessonId: string;

  role: SpeakerRole;
  displayLabel: string;

  rawSpeakerIds: string[];

  confidence: number;

  source:
    | "asr"
    | "agent"
    | "teacher";

  version: number;
}
```

示例：

```
speaker_0 → teacher_1 → 教师
speaker_2 → student_1 → 学生 A
speaker_5 → student_2 → 学生 B
```

### 6.4 学生稳定编号

学生编号只需在同一节课内稳定。

推荐按第一次可靠出现的顺序分配：

```
student_1 → 学生 A
student_2 → 学生 B
student_3 → 学生 C
```

同一个 raw speaker ID 在同一节课内，应保持一致映射。

如果证据不足：

```
speakerRole = unknown
identityId = null
```

不得凭文本内容随意创造学生 A/B/C。

### 6.5 教师识别依据

教师识别不能只依赖讲话时长。

应综合：

- 是否持续讲解知识；
- 是否发布课堂指令；
- 是否发起提问；
- 是否评价学生回答；
- 是否控制活动开始和结束；
- 是否进行总结与反馈；
- 是否承担课堂管理功能；
- 是否在整节课中保持主导角色。

### 6.6 教师人工修正

教师可以修改：

- speaker role；
- speaker identity；
- display label；
- raw speaker 到 canonical speaker 的映射。

有效说话人计算：

```
effectiveSpeakerRole =
  teacherSpeakerRole ??
  agentSpeakerRole ??
  rawInferredRole ??
  "unknown";
effectiveSpeakerIdentityId =
  teacherSpeakerIdentityId ??
  agentSpeakerIdentityId ??
  rawSpeakerId ??
  null;
```

教师修改后，下游分析必须使用教师确认的说话人信息。

## 7. Transcript Agent Patch Only 输出

### 7.1 为什么采用 Patch Only

LLM 不应返回完整逐字稿。

它只返回发生变化的 Sentence。

这样可以：

- 降低输出 token；
- 避免复制全文；
- 防止遗漏或覆盖未修改数据；
- 提高校验能力；
- 保留 Agent 修改痕迹；
- 更方便比较教师修改。

### 7.2 Agent 输入

```
interface TranscriptAgentInput {
  lessonId: string;

  sentences: Array<{
    id: string;

    rawText: string;

    startMs: number;
    endMs: number;

    rawSpeakerIds: string[];

    transcriptionConfidence?: number;
    speakerConfidence?: number;

    previousContext?: string;
    nextContext?: string;
  }>;

  glossary?: string[];
}
```

只发送必要上下文。

不得发送：

- 完整教师稿；
- 完整 Agent 稿；
- 展示 Projection；
- 统计结果；
- 数据库内部字段；
- 重复的文本字段。

### 7.3 Agent 输出

```
interface TranscriptAgentPatchOutput {
  patches: TranscriptPatch[];
  sectionBoundarySuggestions?: SectionBoundarySuggestion[];
  warnings: string[];
}

interface TranscriptPatch {
  sentenceId: string;

  correctedText?: string;

  speaker?: {
    role?: SpeakerRole;
    identityId?: string | null;
  };

  confidence: number;

  changeTypes: TranscriptChangeType[];

  needsHumanReview: boolean;
  reviewReason?: string;
}

type TranscriptChangeType =
  | "asr_correction"
  | "term_correction"
  | "punctuation"
  | "speaker_role"
  | "speaker_identity"
  | "readability"
  | "repetition_classification"
  | "self_correction_classification"
  | "uncertain";
```

未修改 Sentence 不应返回。

### 7.4 禁止输出的字段

Agent 不得返回：

- 完整 transcript；
- 时间戳覆盖；
- 原始文本覆盖；
- 完整 display sections；
- 句子统计；
- 教学指标；
- 报告内容；
- 课堂评价；
- 不相关解释。

## 8. Patch 合并与校验

### 8.1 Patch 校验

必须校验：

- sentenceId 是否存在；
- sentenceId 是否重复；
- correctedText 是否为空；
- correctedText 是否超过长度限制；
- confidence 是否在 0～1；
- changeTypes 是否在白名单；
- 是否试图修改时间戳；
- 是否返回未允许字段；
- speaker role 是否有效；
- section boundary 是否引用存在 Sentence；
- Patch 数量是否异常；
- 是否存在明显无依据扩写。

### 8.2 写入规则

```
correctedText 与 rawText 实质相同
→ agentNormalizedText = null
correctedText 存在有效变化
→ agentNormalizedText = correctedText
未返回 Patch
→ agentNormalizedText 不写入
```

Agent 不得修改：

- rawText；
- sourceSegmentIds；
- startMs；
- endMs。

### 8.3 失败行为

如果 LLM 输出校验失败：

- 不保存部分错误数据；
- rawText 保持不变；
- 记录 validation errors；
- 使用确定性 fallback；
- 第一阶段不自动发起第二次完整付费请求；
- 将必要内容标记为人工复核。

## 9. deliveryFeatures

### 9.1 设计目标

教师可能删除：

- 嗯；
- 呃；
- 重复；
- 起句残片；
- 自我修正过程。

这些内容不应继续出现在最终可读文本中，但其课堂表达价值必须保留。

因此 `deliveryFeatures` 从原始表达中提取，独立于教师编辑文本。

### 9.2 数据结构

```
interface DeliveryFeatures {
  fillerWords: Array<{
    word: string;
    count: number;
  }>;

  fillerWordCount: number;

  repetitions: RepetitionSignal[];
  repetitionCount: number;

  selfCorrections: SelfCorrectionSignal[];
  selfCorrectionCount: number;

  incompleteUtterance: boolean;

  possibleQuestion: boolean;
  possibleInstruction: boolean;
  possibleAnswer: boolean;
  possibleFeedback: boolean;

  pauseBeforeMs?: number;
  pauseAfterMs?: number;

  speakerTurnChanged?: boolean;

  interrupted?: boolean;
  overlap?: boolean;

  unclearAudio?: boolean;
  backgroundNoise?: boolean;
}
```

### 9.3 重复信号

```
interface RepetitionSignal {
  text: string;
  count: number;

  type:
    | "hesitation"
    | "emphasis"
    | "instruction"
    | "answer"
    | "possible_asr_error";

  startOffset?: number;
  endOffset?: number;
}
```

确定性代码负责检测重复文本和位置。

需要语义判断的重复类型，可以由 Agent Patch 标注。

### 9.4 自我修正

```
interface SelfCorrectionSignal {
  originalText: string;
  correctedText: string;

  startOffset?: number;
  endOffset?: number;

  confidence: number;
}
```

例如：

```
这个角是六十度，不对，是九十度。
```

不能只记录：

```
selfCorrectionCount = 1
```

还应保留修改前后的具体内容。

### 9.5 特征来源

仅依赖文本即可计算：

- filler words；
- 简单重复；
- 部分自我修正；
- incomplete utterance；
- question flag；
- 部分 instruction/answer 判断。

依赖时间信息：

- pause before；
- pause after；
- speaker turn；
- silence duration。

依赖音频或多模态：

- 精确语速；
- overlap；
- 音频听不清；
- 背景噪音；
- 笑声；
- 掌声；
- 媒体播放。

## 10. TranscriptEvent

部分课堂信号不属于任何一个 Sentence，必须单独保存为时间轴事件。

```
interface TranscriptEvent {
  id: string;
  lessonId: string;

  type: TranscriptEventType;

  startMs: number;
  endMs: number;

  speakerIds?: string[];
  relatedSentenceIds?: string[];

  confidence: number;

  metadata?: Record<string, unknown>;
}
```

支持事件类型：

```
type TranscriptEventType =
  | "SILENCE"
  | "LONG_PAUSE"
  | "OVERLAPPING_SPEECH"
  | "INTERRUPTION"
  | "BACKGROUND_NOISE"
  | "LAUGHTER"
  | "APPLAUSE"
  | "GROUP_RESPONSE"
  | "INAUDIBLE"
  | "MEDIA_PLAYBACK"
  | "OFF_TOPIC_AUDIO";
```

### 10.1 静默与等待

例如：

```
教师提问：00:10–00:13
静默：00:13–00:19
学生回答：00:19–00:23
```

应保存：

```
Sentence：教师问题
Event：SILENCE，6 秒
Sentence：学生回答
```

Transcript Agent 只记录事实。

它不直接判断：

```
教师等待充分
```

或：

```
课堂出现冷场
```

这类评价交给后续 Teaching Evidence Agent。

## 11. 教师编辑

### 11.1 文本编辑

教师编辑只写：

```
teacherEditedText
```

不得覆盖：

```
rawText
agentNormalizedText
```

教师未修改时：

```
teacherEditedText = null
```

### 11.2 教师编辑与 deliveryFeatures

教师将：

```
嗯，这个这个二氧化碳呢……
```

修改为：

```
二氧化碳……
```

只改变有效语义文本。

以下信息继续保留：

```
{
  "fillerWordCount": 2,
  "repetitionCount": 1
}
```

### 11.3 整句删除

整句删除必须区分：

- 仅从展示中隐藏；
- ASR 噪音，不参与语义分析；
- 非课堂内容；
- 隐私内容；
- 不参与任何分析。

推荐字段：

```
interface TranscriptInclusionPolicy {
  includeInDisplay: boolean;
  includeInSemanticAnalysis: boolean;
  includeInDeliveryAnalysis: boolean;

  reason?: string;
}
```

### 11.4 教师确认

教师即使未修改文本，也可以确认：

```
reviewStatus = teacher_confirmed
```

推荐状态：

```
type TranscriptReviewStatus =
  | "unreviewed"
  | "agent_processed"
  | "teacher_edited"
  | "teacher_confirmed"
  | "requires_review";
```

## 12. Version Control

### 12.1 为什么必须有版本

教师修改逐字稿后，旧的：

- 指标；
- 事件判断；
- 教学证据；
- 报告；

可能已经失效。

系统必须知道分析是基于哪个 Transcript 版本生成。

### 12.2 版本字段

```
interface TranscriptVersion {
  lessonId: string;

  version: number;

  updatedAt: string;
  updatedBy: string;

  changeType:
    | "agent"
    | "teacher"
    | "system";

  requiresReanalysis: boolean;
}
```

分析结果应保存：

```
analysisBasedOnTranscriptVersion
```

### 12.3 失效规则

教师修改以下内容时，应标记相关分析 stale：

- 术语；
- 事实内容；
- speaker role；
- speaker identity；
- Sentence 合并或拆分；
- Section 调整；
- 是否参与分析。

不应自动重跑整堂课所有步骤。

应根据受影响 Sentence、Section 和 Evidence 做局部失效。

## 13. Section Builder

### 13.1 职责

Section Builder 将 Sentence 组织为教师前端使用的语义段落。

它不生成第二份逐字稿，只保存：

- Section 边界；
- 标题；
- Sentence ID 引用；
- 时间范围。

### 13.2 Section 数据结构

```
interface TranscriptSection {
  id: string;
  lessonId: string;

  order: number;

  startMs: number;
  endMs: number;

  title: string;

  sentenceIds: string[];

  characterCount: number;

  confidence?: number;
}
```

### 13.3 切段原则

优先按：

- 主题变化；
- 教学活动变化；
- 讲解转提问；
- 提问转学生回答；
- 学生回答转教师反馈；
- 练习开始或结束；
- 活动转换；
- 长静默；
- 课堂管理事件；
- 场景变化。

长度要求：

- 推荐 150～350 个中文字符；
- 最大 500 个中文字符；
- 不得切断 Sentence；
- 很短但语义完整的 Section 可以低于 150 字。

### 13.4 问答段落

连续问答可以放在一个 Section 中：

```
教师：为什么这个角是九十度？

学生 A：因为两条直线互相垂直。

教师：对。那我们可以使用哪一个定理？
```

但每句话必须继续保留自己的：

- Sentence ID；
- 时间轴；
- speaker；
- effective text。

### 13.5 Section 标题

每个 Section 必须有可理解标题。

优先格式：

```
教学活动：核心内容
```

例如：

- 导入与复习：分数的意义
- 问题探究：哪两个角相等
- 推理说明：角平分线依据
- 练习讲评：判断分数单位
- 总结与作业：今日内容回顾

标题要求：

- 建议 6～18 个中文字符；
- 来自实际课堂内容；
- 不得臆造教材章节；
- 不得使用占位标题。

禁止：

```
课堂片段 1
第 3 段
教学内容
片段
```

Section Boundary 可以由 Agent 提供建议，但最终 Section 组装和长度校验由确定性代码执行。

## 14. 前端展示投影

前端展示不是一份独立持久化逐字稿。

它由 Section、Sentence、effective text 和 effective speaker 动态生成。

```
interface DisplayTranscriptSentence {
  id: string;

  startMs: number;
  endMs: number;

  speakerLabel: string;

  text: string;

  confidenceLevel?: "high" | "medium" | "low";

  editable: boolean;
}
```

前端应支持：

- 点击句子跳转视频；
- 视频播放时高亮当前句；
- 按句编辑；
- 修改说话人；
- 查看原始 ASR；
- 查看 Agent 修改；
- 合并或拆分 Sentence；
- 显示低置信度；
- 查看必要的停顿、重复、重叠和听不清标记。

普通阅读模式不默认展示：

- filler count；
- ASR speaker ID；
- 完整分析标签；
- 噪音细节；
- 所有 raw text。

校对模式可以查看。

## 15. Downstream Analysis Input Builder

### 15.1 输入原则

下游 Agent 不接收：

```
完整 raw transcript
+
完整 Agent transcript
+
完整 teacher transcript
```

而接收紧凑结构：

```
interface AnalysisSentenceInput {
  id: string;

  startMs: number;
  endMs: number;

  speakerRole: SpeakerRole;
  speakerIdentityId?: string | null;
  speakerLabel: string;

  semanticText: string;

  deliveryFeatures?: CompactDeliveryFeatures;

  reviewStatus?: TranscriptReviewStatus;

  rawExcerpt?: string;
}
```

### 15.2 Compact Delivery Features

下游只接收任务需要的特征：

```
interface CompactDeliveryFeatures {
  fillerWordCount?: number;
  repetitionCount?: number;
  selfCorrectionCount?: number;

  pauseBeforeMs?: number;
  pauseAfterMs?: number;

  incompleteUtterance?: boolean;

  possibleQuestion?: boolean;
  possibleInstruction?: boolean;
  possibleAnswer?: boolean;
}
```

详细信息继续保存在数据库。

### 15.3 Raw Excerpt

仅在以下情况下附带原文：

- needsHumanReview；
- 术语修正置信度低；
- 教师修改与原文差异较大；
- 证据引用需要原话；
- 表达判断依赖原始措辞；
- 修正存在冲突；
- 重复或自我修正需要核查；
- 听不清或多种解释。

必须限制：

- 每次最大 excerpt 数量；
- 单条最大字符数；
- 总 excerpt 字符数；
- 仅发送相关 Sentence。

## 16. 后续模块使用规范

### 16.1 Metrics

确定性统计使用：

- effective speaker；
- Sentence 时间；
- TranscriptEvent；
- deliveryFeatures；
- Section。

不应让 LLM 自己统计：

- 教师发言时长；
- 学生发言次数；
- 停顿次数；
- 问题数量；
- 重复数量。

### 16.2 Teaching Evidence Agent

使用：

- Sentence ID；
- semanticText；
- effective speaker；
- 问答轮次；
- deliveryFeatures；
- TranscriptEvent；
- review status；
- confidence。

输出证据必须引用：

- Sentence ID；
- 时间范围；
- 必要时 raw excerpt。

### 16.3 Report Agent

主要使用已经确认的 Evidence。

不应重新读取整份逐字稿并重新判断所有课堂事实。

## 17. Transcript Quality

### 17.1 Lesson 级质量

```
interface TranscriptQuality {
  overallScore: number;

  lowConfidenceSentenceRatio: number;
  unknownSpeakerRatio: number;
  estimatedTimingRatio: number;

  inaudibleDurationMs: number;
  overlapDurationMs: number;

  requiresHumanReview: boolean;
  reviewReasons: string[];
}
```

### 17.2 人工复核触发条件

包括：

- 低置信度 Sentence 比例过高；
- 教师身份无法判断；
- Unknown speaker 比例过高；
- 专业术语错误较多；
- 大量音频听不清；
- 时间轴主要依赖估算；
- 多人重叠比例过高；
- Patch 校验失败；
- 数字、公式或专名存在冲突。

## 18. 数据库建议

### 18.1 Transcript Sentence

至少包含：

```
id
lesson_id
order
start_ms
end_ms
timing_precision
source_segment_ids

raw_text
agent_normalized_text
teacher_edited_text

raw_speaker_ids
agent_speaker_role
agent_speaker_identity_id
teacher_speaker_role
teacher_speaker_identity_id

transcription_confidence
speaker_confidence
agent_confidence
agent_change_types

delivery_features
needs_human_review
review_reason
review_status

version
created_at
updated_at
```

### 18.2 Canonical Speaker Registry

单独表保存：

```
speaker_id
lesson_id
role
display_label
raw_speaker_ids
confidence
source
version
```

### 18.3 Transcript Event

单独表保存时间轴事件。

### 18.4 Transcript Section

保存：

- Section ID；
- 标题；
- 顺序；
- 时间范围；
- Sentence IDs；
- 字符数量。

不保存第二份完整段落文本。

### 18.5 Transcript Version

Lesson 级保存 Transcript 当前版本及是否需要重新分析。

## 19. Agent 处理流程

### 步骤 1：输入校验

检查：

- 时间轴是否合法；
- Segment 是否缺失；
- 是否有空文本；
- 是否存在异常重叠；
- speaker ID 是否可用；
- 词级时间是否可用；
- ASR 数据是否完整。

### 步骤 2：Sentence Reconstruction

根据：

- 文本语义；
- 标点；
- 停顿；
- speaker 变化；
- ASR Segment 边界；

构建 Transcript Sentence。

### 步骤 3：Speaker Registry

建立：

- raw speaker；
- canonical role；
- lesson 内稳定 identity；
- display label。

### 步骤 4：确定性特征提取

提取：

- filler；
- 重复位置；
- 停顿；
- Sentence 顺序；
- 说话轮次；
- 基础问句标记；
- 时间轴事件。

### 步骤 5：Agent Patch

LLM 只输出：

- 必要文本修改；
- speaker 修正；
- 语义类型标注；
- 人工复核；
- Section boundary 建议。

### 步骤 6：Patch 校验与合并

校验成功后写入：

- agentNormalizedText；
- agent speaker；
- confidence；
- change types；
- review flags。

### 步骤 7：Section Builder

确定性构建 Section，确保：

- 按语义和活动切段；
- 每段不超过 500 字；
- 不切断 Sentence；
- 有可理解标题。

### 步骤 8：教师复核

教师可：

- 修改文本；
- 修改 speaker；
- 合并或拆分 Sentence；
- 调整 Section；
- 确认内容；
- 排除噪音或非课堂内容。

### 步骤 9：版本更新

重要修改后：

- Transcript version +1；
- 标记相关分析 stale；
- 记录影响范围。

### 步骤 10：下游输入构建

根据任务动态生成：

- semanticText；
- compact deliveryFeatures；
- effective speaker；
- selected raw excerpts。

## 20. 测试与验收

### 20.1 文本安全

必须满足：

- rawText 不被覆盖；
- Sentence 不无故丢失；
- 时间轴不被 LLM 修改；
- 学生错误答案不被修正确；
- 不确定术语不被强行猜测；
- Agent 不扩写课堂内容。

### 20.2 Patch 验收

- 未知 ID 为 0；
- 重复 ID 为 0；
- 时间戳修改为 0；
- 关键事实错误为 0；
- 输出 schema 通过率达到要求；
- 未修改 Sentence 不重复返回；
- 输出 token 显著低于完整稿方案。

### 20.3 Speaker 验收

- 教师角色识别准确；
- Student A/B/C 在同一节课内稳定；
- 同一 raw speaker 不频繁切换身份；
- 群体发言可识别为 Students；
- 多人重叠不强行分配单人；
- 不确定时输出 Unknown；
- 教师修改后全局映射一致。

### 20.4 Sentence 验收

- 每句有唯一 ID；
- 每句有开始和结束时间；
- 每句可回溯 source Segment；
- 句子不因字数机械切断；
- 短回答不会丢失；
- 合并和拆分可追溯。

### 20.5 Section 验收

- 每个 Section 不超过 500 个中文字符；
- 每个 Section 由完整 Sentence 组成；
- Section 按教学主题或活动切分；
- 问答关系不被拆散；
- 标题不是占位文本；
- 每个 Section 可定位到时间轴。

### 20.6 deliveryFeatures 验收

教师删除语气词、重复后：

- filler 数据仍存在；
- repetition 数据仍存在；
- self-correction 数据仍存在；
- 原始时间和事件仍可追溯。

### 20.7 Version 验收

教师重要修改后：

- Transcript version 更新；
- 旧 Evidence 或 Report 可识别为 stale；
- 下游不会继续把旧分析当作最新结果。

## 21. 最终验收标准

系统最终必须满足：

1. 所有可识别语言均保留 rawText；
2. rawText 永不被 Agent 或教师覆盖；
3. Agent 只返回 Patch，不返回完整逐字稿；
4. 每个 Sentence 有稳定 ID 和时间轴；
5. 每个 Sentence 可追溯至原始 ASR Segment；
6. 教师、Student A/B/C、Students、Multiple 和 Unknown 可区分；
7. 同一学生在单节课内身份稳定；
8. 教师修改优先用于语义分析；
9. 教师清理文本不会销毁原始表达信号；
10. 停顿、重叠和噪音可通过 TranscriptEvent 保存；
11. 学生错误回答不会被 Agent 自动纠正；
12. Section 按语义和课堂活动切分；
13. 单个 Section 不超过 500 个中文字符；
14. 每个 Section 有实际意义标题；
15. 下游 Agent 不接收多份完整逐字稿；
16. Evidence 可引用 Sentence ID 和时间范围；
17. 人工修改会更新 Transcript version；
18. 旧分析结果可被标记为 stale；
19. 低质量内容会触发人工复核；
20. 所有分析结论可回到原始音频和原始文本。

## 22. 最终架构结论

系统最终维护的不是多套逐字稿，而是一套 Segment/Sentence 级事实数据：

```
rawText
agentNormalizedText
teacherEditedText
speaker mapping
deliveryFeatures
TranscriptEvent
TranscriptVersion
```

在此基础上动态生成：

```
教师展示投影
Section 时间轴
下游分析输入
Evidence 原文引用
```

整体原则为：

```
原始事实不覆盖
Agent 修改可追踪
教师修改优先
行为信号不丢失
下游输入不重复
分析版本可校验
```

Transcript Agent 的核心价值不是生成一份看起来流畅的稿件，而是把课堂语音转换为一套可靠、可编辑、可引用、可分析的课堂事实数据。
