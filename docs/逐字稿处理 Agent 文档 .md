# Class Reflect 逐字稿处理 AI Agent 设计文档

## 1. 文档目标

逐字稿处理 Agent，以下简称 **Transcript Agent**，负责将语音识别系统输出的原始 ASR 结果转换为：

1. 适合前端时间轴阅读和人工校对的**展示版逐字稿**；
2. 适合后续课堂结构识别、教学证据提取和统计分析的**分析版逐字稿**。

两个版本必须来源于同一份标准化底层数据，确保：

- 文本内容可追溯；
- 每句话均可定位到视频时间；
- 前端修改可以同步影响后续分析；
- 停顿、重复、错漏和说话人不确定性不会因文本清洗而丢失；
- 后续 Agent 不需要重新解析原始 ASR。

------

## 2. 核心设计原则

### 2.1 单一事实来源

系统不应分别生成两份互不关联的逐字稿。

推荐结构：

```text
原始 ASR
   ↓
标准化逐字稿 Canonical Transcript
   ├─ 前端展示版 Display Transcript
   └─ 后续分析版 Analysis Transcript
```

标准化逐字稿是唯一事实来源。

前端展示版主要优化阅读体验，分析版主要保留完整信号。两者通过稳定的句子 ID 和时间轴关联。

### 2.2 不总结、不扩写

Transcript Agent 不是摘要 Agent，不得：

- 总结教师讲解；
- 将多句话概括为一句；
- 补充音频中未出现的信息；
- 根据教学常识改写原意；
- 将学生错误答案自动纠正为正确答案；
- 为了语言流畅而删除具有分析价值的表达。

### 2.3 句子是最小事实单位

每一句话必须具备独立的：

- 句子 ID；
- 开始时间；
- 结束时间；
- 标准化说话人；
- 原始文本；
- 展示文本；
- 置信度；
- 分析信号。

后续 Evidence Agent 引用课堂证据时，应引用句子 ID，而不是只引用一段纯文本。

### 2.4 语义段是前端主要展示单位

前端可以按小段显示，但这些段落必须由句子组成。

段落切分应优先依据：

- 语义主题；
- 教学活动；
- 交互轮次；
- 说话人关系；
- 教学阶段转换。

字数只作为上限约束，不作为首要切分依据。

### 2.5 展示清洗不能销毁分析信息

例如原始音频为：

```text
嗯……那个……这个答案，对，对，是十八。
```

前端可以显示：

```text
这个答案是十八。
```

但分析版必须保留：

- 填充词；
- 停顿时长；
- 重复表达；
- 自我修正；
- 原始文本；
- 清洗操作记录。

------

## 3. 系统输入

Transcript Agent 接收 ASR 结果。输入应尽可能包含词级或片段级时间轴。

```ts
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

如果 ASR 只能提供片段级时间，Agent 可以在片段内部推断句子边界，但必须标记时间轴精度较低。

------

## 4. 标准化底层数据

标准化逐字稿同时服务于前端版和分析版。

```ts
interface CanonicalTranscript {
  lessonId: string;
  language: string;
  durationMs: number;

  speakers: CanonicalSpeaker[];
  sentences: TranscriptSentence[];
  blocks: TranscriptBlock[];
  events: TranscriptEvent[];

  quality: TranscriptQuality;
  processing: TranscriptProcessingMetadata;
}
```

------

## 5. 句子数据结构

```ts
interface TranscriptSentence {
  id: string;
  order: number;

  startMs: number;
  endMs: number;
  timingPrecision: "word" | "segment" | "estimated";

  speakerId: string;
  speakerRole:
    | "teacher"
    | "student"
    | "students"
    | "unknown";

  rawSpeakerIds: string[];

  rawText: string;
  normalizedText: string;
  displayText: string;

  transcriptionConfidence?: number;
  speakerConfidence?: number;
  normalizationConfidence?: number;

  flags: TranscriptFlag[];
  signals: SentenceAnalysisSignals;

  sourceSegmentIds: string[];
  revision?: TranscriptRevision;
}
```

### 5.1 三种文本字段

#### rawText

从 ASR 中恢复出的原始文本，仅允许合并相邻识别片段，不做语言清洗。

用途：

- 追溯；
- 排查 ASR 错误；
- 重新处理；
- 比较人工修订前后的差异。

#### normalizedText

保留原始表达特征，但完成：

- 标点恢复；
- 句子边界修复；
- 明显同音错字修正；
- 数字和专有名词规范化；
- 相邻 ASR 碎片合并。

例如：

```text
嗯这个这个角应该是九十度
```

标准化后：

```text
嗯，这个、这个角应该是九十度。
```

#### displayText

提供给普通前端用户阅读的版本，可以轻度移除：

- 无意义填充词；
- 明显口吃重复；
- 不影响含义的起句残片；
- 纯识别噪声。

例如：

```text
这个角应该是九十度。
```

但涉及教学分析的实质性内容不得删除，例如：

- 教师重复追问；
- 学生错误答案；
- 教师自我纠正；
- 具有课堂管理意义的重复指令；
- 表达不清导致学生误解的句子。

------

## 6. 说话人识别与校正

ASR 的说话人分离结果只能作为输入信号，不能直接视为最终身份。

### 6.1 标准化角色

最终支持：

```text
Teacher
Student A
Student B
Student C
...
Students
Unknown
```

其中：

- `Teacher`：主要授课教师；
- `Student A/B/C`：本节课内稳定编号的单个学生；
- `Students`：多人齐答、全班朗读或无法拆分的群体发言；
- `Unknown`：证据不足，不能可靠判断身份。

### 6.2 教师识别依据

应综合判断，而不是仅按讲话时长判断：

- 是否持续讲解知识；
- 是否布置任务或发布指令；
- 是否频繁发起提问；
- 是否对学生答案进行评价；
- 是否控制活动开始、停止和转换；
- 是否进行总结、反馈或课堂管理；
- 是否在整节课中保持较稳定的主导身份。

### 6.3 学生稳定编号

学生编号只要求在同一节课内稳定，不要求跨课程识别真实身份。

例如：

```text
ASR Speaker 3 → Student A
ASR Speaker 5 → Student B
```

如果同一个学生被 ASR 错拆为两个 speaker，可结合以下信息合并：

- 声纹相似度；
- 相邻对话关系；
- 座位或视频位置；
- 语言习惯；
- 讲话时间是否存在冲突；
- 多模态身份跟踪结果。

如果证据不足，应保留不同学生编号或标记为 Unknown，不得强行合并。

### 6.4 群体发言

出现以下情况可标记为 `Students`：

- 全班齐读；
- 多人同时回答相同内容；
- ASR 无法区分多个重叠学生；
- 教师提出封闭式问题后出现群体短回答。

### 6.5 说话人不确定性

每句话应保留：

```ts
speakerConfidence: number;
rawSpeakerIds: string[];
```

后续分析在说话人置信度过低时，应降低相关结论的可信度。

例如不能因为一次低置信度识别，就断言某一位学生连续回答了三个问题。

------

## 7. 句子切分规则

句子必须是可单独引用、可单独定位和基本可独立理解的最小语言单位。

### 7.1 优先切分依据

- 完整陈述结束；
- 完整问题结束；
- 明确指令结束；
- 说话人切换；
- 较长停顿；
- 自我修正前后形成不同语义；
- 问答轮次转换；
- 话题或教学行为发生转换。

### 7.2 不应机械切分的情况

以下内容可以保持在同一句：

- 一个问题的多个并列条件；
- 同一条完整课堂指令；
- 一个未结束的数学推导；
- 因 ASR 分片导致的半句话；
- 很短、连续且语义紧密的表达。

### 7.3 句子长度

不设置严格字数要求，但建议：

- 常见句子：5～80个中文字符；
- 超过120字时检查是否包含多个独立语义；
- 过短碎片应尝试与相邻句合并；
- 单独有分析意义的短回答，如“不会”“十八”“不知道”，必须保留为独立句子。

------

## 8. 前端展示版设计

前端展示版由标准化逐字稿派生，不重新调用 AI 改写。

```ts
interface DisplayTranscript {
  lessonId: string;
  blocks: DisplayTranscriptBlock[];
}

interface DisplayTranscriptBlock {
  id: string;
  order: number;

  startMs: number;
  endMs: number;

  title?: string;
  sentences: DisplayTranscriptSentence[];

  characterCount: number;
}

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

### 8.1 前端段落切分目标

每个展示段落：

- 最多500个中文字符；
- 推荐150～350字；
- 包含一个相对完整的语义或课堂活动；
- 由若干完整句子组成；
- 不得为满足字数要求而切断句子；
- 不得将不同教学活动强行合并；
- 很短但语义完整的段落允许低于150字。

500字是硬上限，不是目标长度。

### 8.1.1 展示段落标题要求

每个展示段落必须生成一个对教师有意义的标题。标题用于时间轴和当前段落卡片，帮助教师快速判断“这一段在讲什么 / 在做什么”。

标题不得使用纯序号或占位表达，例如：

- `课堂片段 1`
- `课堂片段 17`
- `第 3 段`
- `片段`
- `教学内容`

标题应优先由两部分组成：

```text
教学活动：核心内容
```

例如：

- `导入与复习：分数的意义`
- `问题探究：哪两个角相等`
- `推理说明：角平分线依据`
- `方法归纳：同类题处理步骤`
- `练习讲评：判断分数单位`
- `总结与作业：今天所学回顾`

如果片段很短、无法稳定提取核心内容，也必须给出教学活动标题，例如：

- `课堂导入`
- `问题探究`
- `推理说明`
- `练习讲评`
- `课堂组织`
- `总结与作业`

标题生成规则：

1. 先判断教学活动类型，如导入、讲解、提问、推理、练习、反馈、组织、总结；
2. 再从片段原文中提取可读关键词，如知识点、题目对象、学生回答对象、方法名称；
3. 标题长度建议控制在 6～18 个中文字符；
4. 标题必须来自片段内容或教学活动判断，不得臆造教材章节；
5. 当前端展示已有旧数据时，若标题仍是占位表达，应按同样规则进行展示侧兜底改写。

### 8.2 优先切段条件

出现以下情况时，应优先新建段落：

1. 教学主题发生变化；
2. 从讲解转为提问；
3. 从提问转为学生回答；
4. 从全班教学转为小组或个人活动；
5. 教师开始总结、反馈或纠错；
6. 活动开始、结束或转换；
7. 明显长时间等待后进入下一环节；
8. 课堂管理事件打断原有教学流程；
9. 视频或音频中出现显著场景变化。

### 8.3 问答段落处理

连续问答可以形成一个完整的小段：

```text
教师：为什么这个角是九十度？

学生A：因为两条直线互相垂直。

教师：对。那我们可以使用哪一个定理？
```

每句话仍保留自己的时间轴，前端只是在视觉上将其组织进同一个段落。

### 8.4 前端交互建议

前端应支持：

- 点击句子跳转视频；
- 视频播放时高亮当前句；
- 按句编辑，而不是整段覆盖；
- 显示低置信度提示；
- 修改说话人身份；
- 合并或拆分句子；
- 查看原始识别文本；
- 可选显示停顿、重叠或听不清标记；
- 任何人工修改都形成修订记录。

### 8.5 前端不默认展示的内容

普通阅读模式不显示：

- 填充词计数；
- 重复次数；
- 等待时长指标；
- 语速；
- ASR 内部 speaker ID；
- 噪声详情；
- 所有分析标签。

但可以在“详细模式”或“校对模式”中提供。

------

## 9. 后续分析版设计

分析版保留完整的句子、事件、信号和置信度。

```ts
interface AnalysisTranscript {
  lessonId: string;

  speakers: CanonicalSpeaker[];
  sentences: AnalysisSentence[];
  events: TranscriptEvent[];

  globalMetrics: TranscriptGlobalMetrics;
  quality: TranscriptQuality;
}
```

分析版不应只提供纯文本大段，而应主要提供结构化数据。

### 9.1 分析句子

```ts
interface AnalysisSentence {
  id: string;
  order: number;

  startMs: number;
  endMs: number;

  speakerId: string;
  speakerRole: string;

  rawText: string;
  normalizedText: string;
  displayText: string;

  flags: TranscriptFlag[];
  signals: SentenceAnalysisSignals;

  transcriptionConfidence?: number;
  speakerConfidence?: number;

  previousSentenceId?: string;
  nextSentenceId?: string;
}
```

### 9.2 句级分析信号

```ts
interface SentenceAnalysisSignals {
  pauseBeforeMs?: number;
  pauseAfterMs?: number;

  speechRateCharsPerMinute?: number;

  fillerWords?: {
    word: string;
    count: number;
  }[];

  repetitions?: RepetitionSignal[];
  selfCorrections?: SelfCorrectionSignal[];

  incompleteUtterance?: boolean;
  interrupted?: boolean;
  overlap?: boolean;

  unclearAudio?: boolean;
  backgroundNoise?: boolean;

  possibleQuestion?: boolean;
  possibleInstruction?: boolean;
  possibleAnswer?: boolean;
}
```

Transcript Agent 只识别语言和声学事实，不直接判断教学质量。

例如可以输出：

```text
possibleQuestion = true
pauseAfterMs = 4200
```

但不应直接输出：

```text
教师给予了充分等待时间。
```

后者应由后续 Teaching Evidence Agent 根据上下文和评价标准判断。

------

## 10. 事件数据

部分信息不属于任何一句文本，应单独保存为时间轴事件。

```ts
interface TranscriptEvent {
  id: string;
  type: TranscriptEventType;

  startMs: number;
  endMs: number;

  speakerIds?: string[];
  relatedSentenceIds?: string[];

  confidence: number;
  metadata?: Record<string, unknown>;
}
```

建议支持以下事件类型：

```text
SILENCE
LONG_PAUSE
OVERLAPPING_SPEECH
INTERRUPTION
BACKGROUND_NOISE
LAUGHTER
APPLAUSE
GROUP_RESPONSE
INAUDIBLE
MEDIA_PLAYBACK
OFF_TOPIC_AUDIO
```

### 10.1 长时间等待

长时间等待不能简单删除。

建议区分：

- `pauseBeforeMs`：一句话开始前的停顿；
- `pauseAfterMs`：一句话结束后的停顿；
- `SILENCE`：没有明确依附于某句话的静默事件。

例如：

```text
教师：谁能解释一下为什么？ 00:10–00:13
静默：00:13–00:19
学生A：因为这两个角相等。 00:19–00:23
```

后续 Agent 可以据此识别：

- 教师提问后的等待时间；
- 学生回答前思考时间；
- 无回应；
- 活动切换；
- 设备或课堂异常。

但 Transcript Agent 不直接将静默解释为“有效等待”或“课堂冷场”。

------

## 11. 重复、自我修正与错漏表达

### 11.1 重复

需要区分：

1. 无意识口吃或填充性重复；
2. 教师为了强调而重复；
3. 课堂管理指令重复；
4. 学生回答内容重复；
5. ASR 自身产生的假重复。

前端可隐藏第一类无意义重复，但分析版必须保留类型、位置和次数。

```ts
interface RepetitionSignal {
  text: string;
  count: number;
  type:
    | "hesitation"
    | "emphasis"
    | "instruction"
    | "answer"
    | "possible_asr_error";
}
```

### 11.2 自我修正

例如：

```text
这个角是六十度，不对，是九十度。
```

前端不应只显示“这个角是九十度”，因为自我纠正可能具有教学分析价值。

建议显示：

```text
这个角是六十度——不对，是九十度。
```

并记录：

```ts
interface SelfCorrectionSignal {
  originalText: string;
  correctedText: string;
  startOffset?: number;
  endOffset?: number;
}
```

### 11.3 错漏表达

Transcript Agent 只能修复高置信度的 ASR 错误。

以下情况必须保留原表达或标记为不确定：

- 学生回答事实错误；
- 教师口误后未明确修正；
- 句子语法不完整但原音频确实如此；
- 专有名词无法确定；
- 数学符号存在多个可能解释；
- 音频听不清。

不得为了让文本“看起来正确”而改变课堂事实。

------

## 12. Transcript Flag

建议至少支持：

```ts
type TranscriptFlag =
  | "LOW_TRANSCRIPTION_CONFIDENCE"
  | "LOW_SPEAKER_CONFIDENCE"
  | "TIMING_ESTIMATED"
  | "FILLER_PRESENT"
  | "FILLER_REMOVED_FROM_DISPLAY"
  | "REPETITION"
  | "SELF_CORRECTION"
  | "INCOMPLETE_UTTERANCE"
  | "LONG_PAUSE_BEFORE"
  | "LONG_PAUSE_AFTER"
  | "INTERRUPTED"
  | "OVERLAPPING_SPEECH"
  | "GROUP_RESPONSE"
  | "INAUDIBLE"
  | "BACKGROUND_NOISE"
  | "POSSIBLE_ASR_ERROR"
  | "MANUALLY_EDITED";
```

Flag 应用于检索和快速筛选，详细信息放在 `signals` 中。

------

## 13. 人工编辑与版本控制

逐字稿必须支持人工校正，因为：

- ASR 可能识别错误；
- 说话人分离可能错误；
- 专有名词可能需要教师修正；
- 后续分析的可信度取决于逐字稿质量。

```ts
interface TranscriptRevision {
  revisionId: string;
  editedAt: string;
  editedBy: string;

  changedFields: string[];
  previousValues: Record<string, unknown>;
  reason?: string;
}
```

人工编辑原则：

- 修改展示文本时，不能直接覆盖原始 ASR；
- 修改说话人后，应同步更新分析版；
- 合并或拆分句子时，应保留旧句子 ID 的映射关系；
- 后续分析结果应记录基于哪个 Transcript 版本生成；
- 逐字稿发生重要修改后，相关分析应被标记为需要重新运行。

------

## 14. 质量评估

Transcript Agent 应输出整体质量信息。

```ts
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

建议触发人工校对的情况：

- 大量句子识别置信度低；
- 教师身份无法可靠确定；
- Unknown 说话人占比过高；
- 大量音频听不清；
- 时间轴只能粗略估计；
- 多人重叠讲话比例过高；
- 数学、科学等专业术语错误较多。

------

## 15. Agent 处理流程

### 步骤一：输入校验

检查：

- 时间轴是否合法；
- ASR 片段是否重叠；
- speaker ID 是否存在；
- 是否有缺失音频区间；
- 文本是否为空；
- 词级时间轴是否可用。

### 步骤二：ASR 片段标准化

完成：

- 标点恢复；
- 片段拼接；
- 明显错别字修复；
- 数字和单位规范化；
- 原始 speaker 信息保留。

### 步骤三：句子重建

根据语义、标点、停顿和说话人变化形成句子，并为每句话计算时间轴。

### 步骤四：说话人角色推断

结合：

- ASR speaker；
- 全课语言行为；
- 说话比例；
- 问答关系；
- 指令和反馈模式；
- 可用的声纹或视频信息。

输出 Teacher、Student A/B/C、Students 或 Unknown。

### 步骤五：分析信号提取

识别：

- 长停顿；
- 填充词；
- 重复；
- 自我修正；
- 打断；
- 重叠讲话；
- 不完整句；
- 低置信度；
- 音频异常。

### 步骤六：生成展示文本

在不改变事实的情况下生成 `displayText`。

### 步骤七：语义分段

将句子组织为前端展示段落：

- 按教学内容和互动结构切分；
- 推荐150～350字；
- 最大500字；
- 不切断句子；
- 保留每句话自己的时间轴。

### 步骤八：质量检查

验证：

- 是否存在无时间轴句子；
- 是否有超过500字的展示段；
- 是否存在未映射的源片段；
- 文本是否出现事实性改写；
- 句子顺序和时间顺序是否一致；
- 每个分析信号是否能追溯到句子或事件。

------

## 16. 后续 Agent 使用规范

### Section Builder

使用：

- normalizedText；
- 句子时间轴；
- 说话人角色；
- 静默和活动转换事件。

不得直接使用未经处理的 ASR。

### Teaching Evidence Agent

使用：

- 句子 ID；
- normalizedText；
- 说话人；
- 问答轮次；
- 等待时间；
- 重复追问；
- 自我修正；
- 置信度。

输出证据时必须关联原句 ID 和时间范围。

### Report Agent

主要使用已经确认的 Evidence，不应重新解释所有逐字稿。

需要引用课堂原话时，引用 Transcript Sentence。

### 统计分析

可以使用：

- 教师与学生讲话时长；
- 问题数量；
- 回答数量；
- 等待时间分布；
- 单个学生参与情况；
- 打断和重叠情况；
- 课堂活动转换频率。

统计时必须考虑说话人和文本置信度。

------

## 17. API 返回建议

不建议默认一次返回完整分析版，因为分析版字段较多。

### 获取前端逐字稿

```http
GET /lessons/{lessonId}/transcript/display
```

返回：

- 语义段；
- 展示句子；
- 时间轴；
- 前端必要的置信度；
- 当前版本号。

### 获取句子详情

```http
GET /lessons/{lessonId}/transcript/sentences/{sentenceId}
```

返回：

- rawText；
- normalizedText；
- displayText；
- flags；
- 信号；
- 说话人映射；
- 修订记录。

### 获取分析版

```http
GET /internal/lessons/{lessonId}/transcript/analysis
```

主要供后续 Agent 和内部任务使用，不一定直接开放给浏览器。

### 修改句子

```http
PATCH /lessons/{lessonId}/transcript/sentences/{sentenceId}
```

允许修改：

- displayText；
- normalizedText；
- speakerId；
- 句子边界；
- 人工确认状态。

------

## 18. 示例

### 原始 ASR

```json
[
  {
    "startMs": 10000,
    "endMs": 13700,
    "speakerId": "speaker_1",
    "text": "嗯那个谁能告诉我这个角为什么是九十度"
  },
  {
    "startMs": 18800,
    "endMs": 21400,
    "speakerId": "speaker_3",
    "text": "因为因为这两条直线垂直"
  },
  {
    "startMs": 21500,
    "endMs": 24100,
    "speakerId": "speaker_1",
    "text": "对所以垂直的两条直线形成直角"
  }
]
```

### 标准化句子

```json
[
  {
    "id": "sentence_001",
    "startMs": 10000,
    "endMs": 13700,
    "speakerRole": "teacher",
    "rawText": "嗯那个谁能告诉我这个角为什么是九十度",
    "normalizedText": "嗯，那个，谁能告诉我这个角为什么是九十度？",
    "displayText": "谁能告诉我这个角为什么是九十度？",
    "flags": ["FILLER_PRESENT", "FILLER_REMOVED_FROM_DISPLAY"],
    "signals": {
      "pauseAfterMs": 5100,
      "fillerWords": [
        {"word": "嗯", "count": 1},
        {"word": "那个", "count": 1}
      ],
      "possibleQuestion": true
    }
  },
  {
    "id": "sentence_002",
    "startMs": 18800,
    "endMs": 21400,
    "speakerRole": "student",
    "rawText": "因为因为这两条直线垂直",
    "normalizedText": "因为、因为这两条直线垂直。",
    "displayText": "因为这两条直线垂直。",
    "flags": ["REPETITION"],
    "signals": {
      "repetitions": [
        {
          "text": "因为",
          "count": 2,
          "type": "hesitation"
        }
      ],
      "possibleAnswer": true
    }
  }
]
```

### 前端展示

```text
00:10  教师
谁能告诉我这个角为什么是九十度？

00:18  学生A
因为这两条直线垂直。

00:21  教师
对，所以垂直的两条直线形成直角。
```

### 后续分析可读取的信息

- 教师提出问题；
- 提问后等待5.1秒；
- Student A 回答；
- 学生存在轻微起句重复；
- 教师确认答案并解释；
- 每项结论都能对应具体句子和视频时间。

------

## 19. 最终验收标准

Transcript Agent 的结果必须满足：

1. 所有可识别语言均有原始文本记录；
2. 每句话都有唯一 ID；
3. 每句话都有开始和结束时间；
4. 每句话有标准化说话人及其置信度；
5. 教师和学生身份不会只依赖 ASR speaker 标签；
6. 前端展示段按语义切分；
7. 单个前端展示段不超过500个中文字符；
8. 每个展示段由完整句子组成；
9. 前端清洗不会销毁停顿、重复和修正信息；
10. 长静默、重叠和听不清内容可独立记录；
11. 学生错误回答不会被自动纠正；
12. 人工修改有版本记录；
13. 后续 Agent 能通过句子 ID 引用证据；
14. 所有分析结果可以回到原始音频；
15. 低质量或高不确定性内容会被明确标记。

------

## 20. 最终架构结论

逐字稿不应真正维护两套独立文本，而应维护：

```text
一份标准化底层逐字稿
    ├─ 展示投影：简洁、分段、可编辑、句级时间轴
    └─ 分析投影：完整、结构化、保留隐藏信号
```

前端展示版解决“教师如何方便阅读和校对”。

后续分析版解决“AI 如何准确理解课堂事实”。

二者共享句子 ID、时间轴、说话人和版本号，确保整个课堂分析 Pipeline 始终基于同一份可追溯事实。
