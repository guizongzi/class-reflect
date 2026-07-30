已按你的补充内容修订。以下内容用于替换或新增到原《教学证据生成 Agent 基本设计文档》，**未列出的章节保持不变**。

# 教学证据生成 Agent 文档

**适用版本：** v0.1.1
**修订范围：** 课型字段、课堂回应分类、评价闭环分级、考试与复习场景、课堂管理语言过滤、未来规划
**其余内容：** 保持 v0.1.0 不变

## 一、全局字段名称调整

原文中的：

```
deliveryMode
```

统一替换为：

```
lesson_format
```

原有三个值：

```
offline
live
recorded
```

统一替换为：

```
offline_classroom_recording
live_online_class
recorded_online_class
```

新的类型定义：

```
export type LessonFormat =
  | "offline_classroom_recording"
  | "live_online_class"
  | "recorded_online_class";
```

数据库、API、Agent 输入、Agent 输出和日志中统一使用：

```
lesson_format
```

不再同时保留 `deliveryMode`，避免出现两套字段。

## 二、课型定义

### 2.1 字段定义

字段名称：

```
lesson_format
```

三个可选值：

| 页面显示     | 数据库/接口字段值             | 适合场景                                                     |
| ------------ | ----------------------------- | ------------------------------------------------------------ |
| 线下课堂录像 | `offline_classroom_recording` | 教室实录，分析提问、等待、学生回答、齐答、反馈、讲练节奏     |
| 直播网课     | `live_online_class`           | 实时线上课，分析连麦互动、技术停顿、可听见回应、线上节奏     |
| 录播网课     | `recorded_online_class`       | 预先录制课程，分析结构、语速、表达清晰度、信息密度、示例和总结 |

### 2.2 前端展示

创建课堂时显示：

```
课程形式

○ 线下课堂录像
○ 直播网课
○ 录播网课
```

前端提交示例：

```
{
  "lesson_format": "offline_classroom_recording"
}
```

### 2.3 数据库定义

```
lesson_format varchar(40) not null
```

建议增加约束：

```
check (
  lesson_format in (
    'offline_classroom_recording',
    'live_online_class',
    'recorded_online_class'
  )
)
```

### 2.4 Agent输入类型

```
export interface TeachingEvidenceInput {
  lessonId: string;

  lesson_format: LessonFormat;

  capabilityMatrix: CapabilityMatrix;

  transcriptSegments: TranscriptSegment[];

  metrics: ClassroomMetric[];

  classroomEvents?: ClassroomEvent[];

  generationConfig: {
    enabledCategories: EvidenceCategory[];
    maxEvidenceCards: number;
    minimumConfidence:
      | "low"
      | "medium"
      | "high";
    language: "zh-CN";
  };
}
```

### 2.5 Agent输出类型

```
export interface TeachingEvidenceOutput {
  lessonId: string;

  lesson_format: LessonFormat;

  evidenceCards: TeachingEvidenceCard[];

  skippedCategories: Array<{
    category: EvidenceCategory;
    reason:
      | "capability_not_supported"
      | "insufficient_evidence"
      | "category_disabled"
      | "not_applicable_to_lesson_format";
  }>;

  generationSummary: {
    analyzedTranscriptSegmentCount: number;
    analyzedMetricCount: number;
    generatedEvidenceCount: number;
  };
}
```

## 三、三种课型的分析边界

### 3.1 线下课堂录像

字段值：

```
offline_classroom_recording
```

重点分析：

- 教师提问；
- 提问后等待时间；
- 学生个别回答；
- 学生齐答；
- 教师代答；
- 教师反馈；
- 教师追问；
- 讲授与练习节奏；
- 课堂管理语言；
- 课堂总结。

线下课堂的限制：

- 教室麦克风可能无法完整收录学生声音；
- 多名学生同时发言可能无法准确分离；
- 未识别到学生声音，不等于学生没有参与；
- 齐答不能等同于每名学生都掌握；
- 个别学生正确回答不能代表全班掌握。

### 3.2 直播网课

字段值：

```
live_online_class
```

重点分析：

- 教师连续讲授；
- 连麦互动；
- 可听见的学生回应；
- 教师对连麦回答的反馈；
- 直播等待；
- 技术停顿；
- 网络或设备中断；
- 线上课堂节奏；
- 直播总结。

当系统没有聊天区、举手、投票和在线人数数据时，不得判断：

- 聊天区是否活跃；
- 学生是否举手；
- 学生是否完成投票；
- 学生是否在线；
- 学生是否观看完整课程。

系统只能描述：

```
在当前音视频和逐字稿中，未识别到清晰的学生语音回应。
```

不得写成：

```
学生没有参与直播互动。
```

### 3.3 录播网课

字段值：

```
recorded_online_class
```

重点分析：

- 课程结构；
- 语速；
- 表达清晰度；
- 信息密度；
- 示例与概念的衔接；
- 自测提示；
- 停顿与思考时间；
- 章节过渡；
- 阶段总结；
- 课程总结。

录播网课不得生成：

- 学生回答次数不足；
- 学生参与度不足；
- 等待学生回答时间不足；
- 师生互动不足；
- 学生没有回应。

录播课程中的教师自问自答，可能属于：

- 引导性讲解；
- 自测提示；
- 修辞性问题；
- 内容转折；
- 教师示范思考过程。

不能直接按“教师没有等待学生回答”处理。

## 四、区分齐答、个别回答和教师代答

### 4.1 回应类型定义

增加课堂回应类型：

```
export type ResponsePattern =
  | "individual_student_response"
  | "choral_response"
  | "teacher_self_answer"
  | "multiple_student_overlap"
  | "no_audible_response"
  | "unknown_response";
```

对应含义：

| 类型                          | 含义                                   |
| ----------------------------- | -------------------------------------- |
| `individual_student_response` | 一名可识别学生进行相对完整的回答       |
| `choral_response`             | 多名学生同时进行短促、集体式回应       |
| `teacher_self_answer`         | 教师提出问题后，由教师自己给出答案     |
| `multiple_student_overlap`    | 多名学生同时发言，但无法识别为统一齐答 |
| `no_audible_response`         | 当前音频中没有识别到清晰回答           |
| `unknown_response`            | 无法可靠判断回应类型                   |

### 4.2 齐答识别

国内线下课堂常见：

```
教师：是不是？
学生集体：是！

教师：对不对？
学生集体：对！

教师：明白了吗？
学生集体：明白了。
```

这类回应应标记为：

```
choral_response
```

齐答的证据强度通常较低，因为它只能证明：

- 课堂中出现了集体口头回应；
- 学生对教师口头确认作出了声音反馈。

它不能证明：

- 每名学生都理解；
- 学生能够独立复述；
- 学生能够解释原因；
- 学生能够迁移应用。

### 4.3 个别回答识别

个别回答应满足至少一项：

- 可识别为单个学生持续发言；
- 回答包含具体知识内容；
- 回答能够关联教师提出的问题；
- 说话人角色被确认或具有较高置信度。

示例：

```
教师：为什么这里要先通分？

学生：因为两个分数的分母不同，
不能直接比较分子的大小。
```

该回应可以标记为：

```
individual_student_response
```

### 4.4 教师代答识别

教师提出问题后，在没有学生有效回答的情况下立即自行回答：

```
教师：这个公式为什么成立？
因为这里使用了相似三角形。
```

标记为：

```
teacher_self_answer
```

教师代答不一定是负面现象。

Agent需要结合上下文区分：

- 教师故意示范思路；
- 录播课程自问自答；
- 学生没有回应后教师直接给出答案；
- 教师等待时间过短，学生尚未来得及回答；
- 教师使用修辞性问题组织讲解。

证据表述应谨慎。

推荐表述：

```
教师提出问题后约1.2秒开始自行解释，
当前音频中未识别到学生回答。
```

不得直接写：

```
教师剥夺了学生思考机会。
```

## 五、课堂检查方式分级

### 5.1 分级目标

“明白了吗”“会了吗”“没问题吧”等口头确认，不能视为完整或有效的评价闭环。

Agent应将课堂检查方式划分为五级。

```
export type LearningCheckLevel =
  | 1
  | 2
  | 3
  | 4
  | 5;
```

### 5.2 五级定义

#### 一级：口头确认

典型形式：

```
听懂了吗？
会了吗？
明白了吗？
没问题吧？
清楚了吗？
```

学生可能回应：

```
懂了。
会了。
明白。
没问题。
```

该层级只能说明出现了口头确认，不足以证明理解。

输出示例：

```
教师通过“听懂了吗”进行口头确认，
学生出现集体肯定回应。
该方式提供的理解证据较弱。
```

#### 二级：复述概念

典型形式：

```
谁能用自己的话说一下这个概念？
请把刚才的方法再说一遍。
```

学生需要复述：

- 定义；
- 步骤；
- 条件；
- 核心结论。

该层级能够提供基础理解证据，但不一定证明学生能够应用。

#### 三级：回答具体问题

典型形式：

```
这个数是多少？
这一步使用了哪个公式？
这个人物为什么做出这个选择？
```

学生需要针对具体问题给出答案。

该层级比口头确认和简单复述具有更强的检查价值。

#### 四级：解释理由

典型形式：

```
为什么？
你是怎么判断的？
请说明这一步的依据。
还有其他方法吗？
```

学生需要：

- 解释原因；
- 说明依据；
- 展示推理过程；
- 比较不同方法。

该层级可以提供较强的理解证据。

#### 五级：迁移应用或完成任务

典型形式：

```
请用这个方法解决一道新题。
如果条件变化，结论会怎样？
请完成这个任务并说明过程。
请把这个规律用于新的情境。
```

学生需要：

- 解决新问题；
- 完成任务；
- 进行迁移；
- 应用知识；
- 调整方法。

该层级能够提供最强的课堂学习检查证据。

### 5.3 输出字段

在证据卡中增加：

```
export interface TeachingEvidenceCard {
  // 原字段保持不变

  learningCheck?: {
    level: LearningCheckLevel;

    checkType:
      | "oral_confirmation"
      | "concept_restatement"
      | "specific_question"
      | "reason_explanation"
      | "transfer_or_task";

    responsePattern:
      | "individual_student_response"
      | "choral_response"
      | "teacher_self_answer"
      | "multiple_student_overlap"
      | "no_audible_response"
      | "unknown_response";

    evidenceStrength:
      | "very_weak"
      | "weak"
      | "medium"
      | "strong"
      | "very_strong";

    limitationNote: string | null;
  };
}
```

### 5.4 证据强度建议

| 检查等级                 | 默认证据强度       |
| ------------------------ | ------------------ |
| 一级：口头确认           | `very_weak`        |
| 二级：复述概念           | `weak` 或 `medium` |
| 三级：回答具体问题       | `medium`           |
| 四级：解释理由           | `strong`           |
| 五级：迁移应用或完成任务 | `very_strong`      |

实际强度还应考虑：

- 是个别回答还是齐答；
- 回答是否完整；
- 是否出现教师提示；
- 是否由教师代答；
- 是否能够听清；
- 说话人角色是否确认。

例如：

```
三级问题 + 教师代答
```

不能视为学生理解证据。

```
一级口头确认 + 全班齐答“懂了”
```

只能视为很弱的检查证据。

### 5.5 Prompt补充规则

加入 System Prompt：

```
课堂理解检查必须分级：

一级：口头确认；
二级：复述概念；
三级：回答具体问题；
四级：解释理由；
五级：迁移应用或完成任务。

“听懂了吗”“会了吗”“明白了吗”“没问题吧”等，
即使学生集体回答“懂了”或“会了”，
也只能视为一级口头确认。

一级口头确认不能被描述为有效证明学生掌握，
也不能被描述为完整评价闭环。

生成证据时应区分：
个别学生回答、学生齐答、教师代答、
多人重叠回答、未识别到清晰回答和无法判断。

齐答不能等同于每名学生理解。
个别学生正确回答不能等同于全班掌握。
教师代答不能作为学生理解证据。
```

## 六、适配考试课、复习课和试卷讲评课

### 6.1 当前版本处理方式

M1暂不新增正式的课程子类型数据库字段。

Agent可根据逐字稿中的明显内容线索，识别当前分析片段可能属于：

```
export type InstructionalContext =
  | "new_instruction"
  | "exam_practice"
  | "review_lesson"
  | "test_paper_review"
  | "mixed"
  | "unknown";
```

该字段属于分析辅助结果，不覆盖 `lesson_format`。

两个维度含义不同：

```
lesson_format
= 课程通过什么形式发生

instructionalContext
= 当前课堂在进行哪类教学任务
```

例如：

```
{
  "lesson_format": "offline_classroom_recording",
  "instructionalContext": "test_paper_review"
}
```

### 6.2 试卷讲评课重点

试卷讲评课不能完全套用新授课规则。

Agent重点分析：

- 是否分析错误原因；
- 是否归纳题型；
- 是否提炼解题方法；
- 是否区分个别错误与共性错误；
- 是否展示典型错误；
- 是否提供变式练习；
- 是否要求学生解释错误思路；
- 是否让学生修正原有答案；
- 是否检查学生能否处理相似问题。

弱证据示例：

```
教师给出正确答案并继续讲解，
当前片段中未发现对错误原因的进一步分析。
```

较强证据示例：

```
教师先展示典型错误答案，
随后要求学生说明错误发生在哪一步，
并通过一道变式题检查方法迁移。
```

试卷讲评课不应只用：

- 教师讲授时长；
- 普通提问数量；
- 学生回答数量；

来判断教学质量。

### 6.3 复习课重点

复习课重点分析：

- 是否建立知识点之间的联系；
- 是否形成结构化整理；
- 是否使用图表、框架或知识网络；
- 是否通过任务检测薄弱点；
- 是否根据学生错误调整讲解；
- 是否区分已掌握内容和需要补强内容；
- 是否包含综合练习；
- 是否出现迁移应用。

弱证据示例：

```
该复习片段主要重复陈述知识点，
当前逐字稿中未发现知识联系或结构化整理。
```

较强证据示例：

```
教师将三个知识点放入同一解题框架中进行比较，
随后通过综合任务检查学生能否选择合适方法。
```

### 6.4 考试与考前训练重点

考试训练或考前训练可以重点分析：

- 答题策略；
- 时间分配；
- 审题方法；
- 易错点；
- 题型归纳；
- 解题步骤；
- 错因分析；
- 迁移练习；
- 检查方法。

不能因为教师连续讲题时间较长，就直接判断互动不足。

在考试训练场景中，长时间讲解可能是：

- 完整展示解题过程；
- 分析评分标准；
- 比较多种方法；
- 集中讲解共性错误。

Agent需要结合上下文解释。

### 6.5 Prompt补充规则

加入 System Prompt：

```
中国基础教育中常见试卷讲评课、专题复习课和考前训练课。

当逐字稿明显属于上述教学场景时，
不得机械套用新授课评价规则。

试卷讲评课重点关注：
错误原因、题型归纳、方法提炼、
个别错误与共性错误的区分、
变式练习和学生对错误思路的解释。

复习课重点关注：
知识联系、结构化整理、薄弱点检测、
根据错误调整讲解和综合任务。

考前训练重点关注：
审题、策略、步骤、时间分配、
易错点、评分要求和迁移练习。

如果无法可靠判断教学场景，
将 instructionalContext 标记为 unknown，
不要强制分类。
```

## 七、区分课堂管理语言和教学提问

### 7.1 课堂管理语言定义

国内大班课堂中常见：

```
坐好。
安静。
看黑板。
翻到第几页。
书拿出来。
小组开始。
时间到了。
停下来。
举手回答。
不要讲话。
往前看。
```

这些语言主要用于：

- 组织课堂；
- 调整秩序；
- 分配任务；
- 切换环节；
- 管理时间；
- 控制发言方式。

不能统计为：

- 学科提问；
- 理解检查；
- 教学互动；
- 认知性问题。

### 7.2 语言行为类型

增加：

```
export type TeacherUtteranceType =
  | "instructional_question"
  | "learning_check"
  | "classroom_management"
  | "task_instruction"
  | "content_explanation"
  | "feedback"
  | "transition"
  | "unknown";
```

### 7.3 区分规则

#### 教学提问

具有明确学科或认知目标，例如：

```
为什么这里要使用过去时？
这一步的依据是什么？
这个人物的选择说明了什么？
怎样验证这个结论？
```

标记为：

```
instructional_question
```

#### 理解检查

用于检查学生理解程度，例如：

```
谁能复述一下？
为什么这样计算？
请完成下一题。
```

标记为：

```
learning_check
```

#### 课堂管理

用于维持秩序或安排课堂，例如：

```
安静。
看黑板。
坐好。
举手回答。
```

标记为：

```
classroom_management
```

#### 任务指令

用于布置行动，但不一定包含学科提问：

```
请完成第三题。
两人一组讨论。
把答案写在练习本上。
```

标记为：

```
task_instruction
```

任务指令可以构成教学活动，但不能自动计为学科问题。

### 7.4 指标规则

以下内容不得进入 `question_count`：

- 坐好；
- 安静；
- 看黑板；
- 翻到第几页；
- 举手回答；
- 小组开始；
- 时间到了；
- 准备好了吗；
- 可以开始了吗。

以下内容不得仅凭句末问号统计为教学问题：

```
都坐好了吗？
书翻到了吗？
能听见吗？
画面看得见吗？
准备好了吗？
```

这些通常属于：

- 课堂管理；
- 设备确认；
- 技术确认；
- 流程确认。

### 7.5 Prompt补充规则

加入 System Prompt：

```
必须区分课堂管理语言、任务指令和学科教学提问。

“坐好、安静、看黑板、翻到第几页、小组开始、
时间到了、举手回答”等属于课堂管理或任务组织语言，
不得统计为学科提问或有效教学互动。

不能仅根据句末存在问号判断为教学问题。

“都坐好了吗、书翻到了吗、能听见吗、
画面看得见吗、准备好了吗”等，
通常属于管理或技术确认。

只有具有明确知识、理解、推理、解释、
应用或任务检查目标的问题，
才能归为教学提问或学习检查。
```

## 八、Capability Matrix修订

```
export interface CapabilityMatrix {
  canObserveTeacherSpeech: boolean;
  canObserveStudentSpeech: boolean;

  canDistinguishIndividualResponse: boolean;
  canDistinguishChoralResponse: boolean;
  canDetectTeacherSelfAnswer: boolean;

  canMeasureWaitTime: boolean;
  canAnalyzeClassroomManagementLanguage: boolean;
  canAnalyzeLearningCheckLevel: boolean;

  canAnalyzeLiveAudioInteraction: boolean;
  canAnalyzeChatInteraction: boolean;
  canAnalyzePlatformInteraction: boolean;

  canAnalyzeSpeechRate: boolean;
  canAnalyzeInformationDensity: boolean;
  canAnalyzeSelfCheckPrompt: boolean;
}
```

建议配置：

```
export const capabilityMatrixByLessonFormat = {
  offline_classroom_recording: {
    canObserveTeacherSpeech: true,
    canObserveStudentSpeech: true,

    canDistinguishIndividualResponse: true,
    canDistinguishChoralResponse: true,
    canDetectTeacherSelfAnswer: true,

    canMeasureWaitTime: true,
    canAnalyzeClassroomManagementLanguage: true,
    canAnalyzeLearningCheckLevel: true,

    canAnalyzeLiveAudioInteraction: false,
    canAnalyzeChatInteraction: false,
    canAnalyzePlatformInteraction: false,

    canAnalyzeSpeechRate: true,
    canAnalyzeInformationDensity: true,
    canAnalyzeSelfCheckPrompt: true,
  },

  live_online_class: {
    canObserveTeacherSpeech: true,
    canObserveStudentSpeech: true,

    canDistinguishIndividualResponse: true,
    canDistinguishChoralResponse: false,
    canDetectTeacherSelfAnswer: true,

    canMeasureWaitTime: true,
    canAnalyzeClassroomManagementLanguage: true,
    canAnalyzeLearningCheckLevel: true,

    canAnalyzeLiveAudioInteraction: true,
    canAnalyzeChatInteraction: false,
    canAnalyzePlatformInteraction: false,

    canAnalyzeSpeechRate: true,
    canAnalyzeInformationDensity: true,
    canAnalyzeSelfCheckPrompt: true,
  },

  recorded_online_class: {
    canObserveTeacherSpeech: true,
    canObserveStudentSpeech: false,

    canDistinguishIndividualResponse: false,
    canDistinguishChoralResponse: false,
    canDetectTeacherSelfAnswer: true,

    canMeasureWaitTime: false,
    canAnalyzeClassroomManagementLanguage: false,
    canAnalyzeLearningCheckLevel: true,

    canAnalyzeLiveAudioInteraction: false,
    canAnalyzeChatInteraction: false,
    canAnalyzePlatformInteraction: false,

    canAnalyzeSpeechRate: true,
    canAnalyzeInformationDensity: true,
    canAnalyzeSelfCheckPrompt: true,
  },
} satisfies Record<
  LessonFormat,
  CapabilityMatrix
>;
```

## 九、证据类别修订

在原有证据类别基础上新增：

```
export type EvidenceCategory =
  | "lecture_duration"
  | "question_quality"
  | "wait_time"
  | "student_response"
  | "feedback_quality"
  | "follow_up"
  | "lesson_structure"
  | "practice_check"
  | "self_check"
  | "information_density"
  | "technical_issue"
  | "lesson_summary"

  | "response_pattern"
  | "learning_check_level"
  | "classroom_management"
  | "error_analysis"
  | "method_generalization"
  | "variation_practice"
  | "knowledge_connection"
  | "structured_review"
  | "weakness_detection";
```

新增类别含义：

| 类别                    | 含义                                   |
| ----------------------- | -------------------------------------- |
| `response_pattern`      | 区分齐答、个别回答、教师代答等回应类型 |
| `learning_check_level`  | 对课堂检查方式进行一至五级分类         |
| `classroom_management`  | 描述课堂管理语言占比或对节奏的影响     |
| `error_analysis`        | 是否分析错误发生的原因                 |
| `method_generalization` | 是否归纳题型、方法和策略               |
| `variation_practice`    | 是否提供变式题或迁移任务               |
| `knowledge_connection`  | 是否建立知识点之间的联系               |
| `structured_review`     | 是否进行结构化整理                     |
| `weakness_detection`    | 是否通过任务定位薄弱点                 |

## 十、System Prompt整合替换版

将原 System Prompt 中的“课型规则”部分替换为以下内容，并在学生相关边界后追加“课堂回应”和“教学场景”规则。

```
你是课堂复盘系统中的教学证据生成助手。

你的任务是根据输入的课堂逐字稿、说话人角色、
确定性指标、可选课堂事件和课程形式，
生成供教师人工复核的候选教学证据卡。

一、证据原则

1. 只使用输入中真实存在的信息。
2. 每张证据卡必须绑定开始时间、结束时间和逐字稿片段ID。
3. 每张证据卡必须包含原文引用。
4. 不得创造逐字稿中不存在的语言、行为或课堂情境。
5. 如果证据不足，应不生成该证据，
   或将置信度标记为 needs_review。
6. 不要为了达到数量要求生成重复或薄弱证据。

二、表达原则

1. fact只描述可观察事实。
2. interpretation只能给出谨慎解释。
3. suggestion必须具体、可执行，并与事实直接对应。
4. 不评价教师人格、态度、能力或教学水平。
5. 不给教师或课堂打分。
6. 不使用“教师能力差、课堂失败、学生不认真”等结论。

三、学生相关边界

1. 不得判断学生已经掌握或没有掌握。
2. 不得判断学生是否专注、感兴趣、积极或消极。
3. 没有识别到学生声音，不等于学生没有参与。
4. 个别学生正确回答，不代表全班掌握。
5. 学生齐答“懂了”或“会了”，
   不代表每名学生已经理解。
6. 只能描述音视频和逐字稿中可观察到的证据。

四、课程形式规则

必须读取 lesson_format。

lesson_format有三个可选值：

1. offline_classroom_recording：
   线下课堂录像。
   重点分析提问、等待、个别回答、齐答、
   教师代答、反馈、追问和讲练节奏。

2. live_online_class：
   直播网课。
   重点分析连麦互动、技术停顿、
   可听见回应和线上节奏。
   没有聊天区或平台数据时，
   不得判断聊天区、投票、举手和在线参与情况。

3. recorded_online_class：
   录播网课。
   重点分析课程结构、语速、表达清晰度、
   信息密度、示例、自测和总结。
   不得生成学生回答不足、等待学生回答不足
   或师生互动不足的证据。

必须遵守 capabilityMatrix。
不支持的分析维度不得生成确定性证据。

五、课堂回应规则

必须区分：

1. individual_student_response：
   个别学生回答。

2. choral_response：
   学生齐答。

3. teacher_self_answer：
   教师提出问题后自行回答。

4. multiple_student_overlap：
   多名学生同时发言，但无法确定为统一齐答。

5. no_audible_response：
   当前音频中未识别到清晰回答。

6. unknown_response：
   无法可靠判断。

齐答不能等同于每名学生理解。
教师代答不能作为学生理解证据。
未识别到声音不能写成学生没有参与。

六、课堂检查分级

课堂检查方式必须分为五级：

一级：口头确认；
二级：复述概念；
三级：回答具体问题；
四级：解释理由；
五级：迁移应用或完成任务。

“听懂了吗、会了吗、明白了吗、没问题吧”等，
即使学生集体回答“懂了”或“会了”，
也只能视为一级口头确认。

一级口头确认提供的理解证据较弱，
不得描述为完整评价闭环。

七、教学场景规则

中国基础教育中常见：
试卷讲评课、专题复习课、考试训练课和新授课。

当逐字稿明显属于试卷讲评课时，重点关注：

- 是否分析错误原因；
- 是否归纳题型和方法；
- 是否区分个别错误与共性错误；
- 是否提供变式练习；
- 是否让学生解释错误思路。

当逐字稿明显属于复习课时，重点关注：

- 是否建立知识联系；
- 是否进行结构化整理；
- 是否通过任务检测薄弱点；
- 是否根据错误调整讲解。

当逐字稿明显属于考试或考前训练时，重点关注：

- 审题策略；
- 解题步骤；
- 时间分配；
- 易错点；
- 评分要求；
- 迁移练习。

不得机械套用新授课规则。
无法可靠判断教学场景时，
将 instructionalContext 标记为 unknown。

八、课堂管理语言规则

必须区分课堂管理语言、任务指令和学科提问。

“坐好、安静、看黑板、翻到第几页、
小组开始、时间到了、举手回答”等，
属于课堂管理或任务组织语言，
不得统计为学科提问或有效理解检查。

不能仅根据句末存在问号判断为教学问题。

“都坐好了吗、书翻到了吗、能听见吗、
画面看得见吗、准备好了吗”等，
通常属于管理或技术确认。

只有具有明确知识、理解、解释、
推理、应用或任务检查目标的问题，
才能归为教学提问或学习检查。

九、指标原则

1. metrics中的数值为确定性计算结果。
2. 不要自行重新计算指标。
3. 引用指标时必须填写对应metricIds。
4. 指标与逐字稿冲突时，
   标记needs_review，不要自行选择其中一方。
5. 课堂管理问题不得进入学科question_count。

十、输出原则

1. 只输出符合指定JSON Schema的JSON。
2. 不输出Markdown。
3. 不输出额外解释。
4. 所有证据初始reviewStatus必须为pending_review。
```

## 十一、Task Prompt字段修订

原：

```
课堂类型：
{{deliveryMode}}
```

替换为：

```
课程形式：
{{lesson_format}}
```

增加：

```
可能的教学场景：
{{instructionalContext}}

注意：

1. 必须区分课堂管理语言和学科教学提问。
2. 必须区分个别学生回答、学生齐答和教师代答。
3. 如果出现理解检查，需要按一至五级分类。
4. 试卷讲评、专题复习和考试训练不得机械套用新授课规则。
```

完整调用上下文建议：

```
请分析以下课堂数据并生成候选教学证据卡。

课程形式：
{{lesson_format}}

当前可分析能力：
{{capabilityMatrix}}

可能的教学场景：
{{instructionalContext}}

启用的证据类别：
{{enabledCategories}}

逐字稿：
{{transcriptSegments}}

确定性指标：
{{metrics}}

课堂事件：
{{classroomEvents}}

生成要求：

1. 最多生成{{maxEvidenceCards}}张证据卡。
2. 优先生成依据明确、时间定位准确、
   对教师有实际帮助的证据。
3. 相同问题不要拆成多张重复证据卡。
4. 无法满足证据要求的类别写入skippedCategories。
5. 区分课堂管理语言、任务指令和教学提问。
6. 区分齐答、个别回答和教师代答。
7. 对学习检查按一级至五级分类。
8. 不将“听懂了吗”及集体回答“懂了”
   视为完整评价闭环。
9. 对试卷讲评、复习和考试训练使用相应分析重点。
10. 输出严格符合JSON Schema。
```

## 十二、输出示例：口头确认和齐答

```
{
  "id": "evidence_021",
  "category": "learning_check_level",
  "title": "课堂检查主要采用口头确认",
  "fact": "教师在18:21询问“这个地方都明白了吗”，随后可听见多名学生集体回答“明白了”。",
  "interpretation": "该检查属于一级口头确认，能够说明课堂中出现了集体回应，但提供的理解证据较弱，不能据此判断每名学生都能独立解释或应用该知识点。",
  "suggestion": "可在口头确认后增加一个具体问题，邀请一名学生说明解题依据，或设置一道相近任务检查能否独立应用。",
  "startMs": 1101000,
  "endMs": 1110000,
  "quote": "这个地方都明白了吗？明白了。",
  "transcriptSegmentIds": [
    "segment_201",
    "segment_202"
  ],
  "metricIds": [],
  "classroomEventIds": [],
  "applicableLessonFormats": [
    "offline_classroom_recording",
    "live_online_class"
  ],
  "confidence": "medium",
  "uncertaintyNote": "集体回应中无法确认每名学生的实际理解情况。",
  "reviewStatus": "pending_review",
  "learningCheck": {
    "level": 1,
    "checkType": "oral_confirmation",
    "responsePattern": "choral_response",
    "evidenceStrength": "very_weak",
    "limitationNote": "齐答只能证明出现了口头回应，不能证明个体理解。"
  }
}
```

## 十三、输出示例：教师代答

```
{
  "id": "evidence_022",
  "category": "response_pattern",
  "title": "提问后由教师直接给出解释",
  "fact": "教师在25:14提出“为什么这里要先约分”，约1.3秒后开始自行解释，当前音频中未识别到学生回答。",
  "interpretation": "该片段属于教师提问后自行回答。较短的间隔可能不足以形成清晰的学生思考和作答窗口，但也可能是教师用于组织讲解的修辞性问题。",
  "suggestion": "如果该问题用于检查理解，可明确邀请学生回答并适当延长等待时间；如果用于讲解组织，可使用“这里需要先约分，因为……”直接衔接解释。",
  "startMs": 1514000,
  "endMs": 1528000,
  "quote": "为什么这里要先约分？因为分子分母有公因数。",
  "transcriptSegmentIds": [
    "segment_310",
    "segment_311"
  ],
  "metricIds": [
    "metric_wait_031"
  ],
  "classroomEventIds": [],
  "applicableLessonFormats": [
    "offline_classroom_recording",
    "live_online_class",
    "recorded_online_class"
  ],
  "confidence": "medium",
  "uncertaintyNote": "仅根据逐字稿无法完全确定该问题是理解检查还是修辞性问题。",
  "reviewStatus": "pending_review",
  "learningCheck": {
    "level": 3,
    "checkType": "specific_question",
    "responsePattern": "teacher_self_answer",
    "evidenceStrength": "very_weak",
    "limitationNote": "问题由教师自行回答，不能作为学生理解证据。"
  }
}
```

## 十四、输出示例：试卷讲评课

```
{
  "id": "evidence_036",
  "category": "error_analysis",
  "title": "讲评中包含错误原因分析",
  "fact": "教师展示学生在第12题中将一次函数斜率与截距混淆的错误，并说明错误来自没有区分两个参数的含义。",
  "interpretation": "该片段不仅给出正确答案，还指出了错误产生的概念原因，有助于学生识别同类错误。",
  "suggestion": "可进一步提供一道改变参数位置的变式题，并请学生解释两个参数分别表示什么，以检查是否能够迁移。",
  "startMs": 2030000,
  "endMs": 2095000,
  "quote": "很多同学把这个数当成斜率了，实际上它表示的是截距。",
  "transcriptSegmentIds": [
    "segment_412",
    "segment_413",
    "segment_414"
  ],
  "metricIds": [],
  "classroomEventIds": [],
  "applicableLessonFormats": [
    "offline_classroom_recording",
    "live_online_class",
    "recorded_online_class"
  ],
  "confidence": "high",
  "uncertaintyNote": null,
  "reviewStatus": "pending_review"
}
```

## 十五、Guardrail新增规则

### 15.1 课型字段校验

```
const lessonFormatValues = [
  "offline_classroom_recording",
  "live_online_class",
  "recorded_online_class",
] as const;
```

拒绝旧值：

```
offline
live
recorded
```

### 15.2 录播课规则

```
if (
  input.lesson_format ===
    "recorded_online_class" &&
  [
    "wait_time",
    "student_response",
  ].includes(card.category)
) {
  rejectCard(
    "not_applicable_to_lesson_format",
  );
}
```

### 15.3 齐答证据校验

当：

```
responsePattern = choral_response
```

不得出现：

```
学生已经掌握
全班都理解
所有学生都会
学生掌握情况良好
```

### 15.4 教师代答校验

当：

```
responsePattern = teacher_self_answer
```

不得将其标记为：

```
学生回答成功
学生理解证据
有效学生反馈
```

### 15.5 一级口头确认校验

当：

```
learningCheck.level = 1
```

`evidenceStrength`只能为：

```
very_weak
weak
```

不得为：

```
strong
very_strong
```

### 15.6 课堂管理问题校验

命中下列模式时，不得直接计入学科问题：

```
坐好
安静
看黑板
翻到
举手
准备好了吗
能听见吗
看得见吗
时间到了
小组开始
```

如上下文存在学科内容，需由事件分类结果进一步判断，不能仅依靠关键词。

## 十六、新增测试用例

### 用例六：线下课堂齐答

输入：

```
教师：这个结论对不对？
全班：对。
```

预期：

- 标记为 `choral_response`；
- 不标记为个别学生回答；
- 不判断全班已经理解；
- 如果属于理解检查，默认为一级口头确认。

### 用例七：教师代答

输入：

```
教师：这里为什么使用乘法？
因为每组数量相同。
```

预期：

- 标记为 `teacher_self_answer`；
- 不作为学生理解证据；
- 根据上下文判断是修辞性讲解还是等待过短；
- 证据不足时标记 `needs_review`。

### 用例八：无效评价闭环

输入：

```
教师：都会了吗？
学生集体：会了。
```

预期：

- 检查等级为一级；
- 证据强度为 `very_weak`；
- 不生成“学生掌握情况良好”；
- 可建议增加具体问题或应用任务。

### 用例九：课堂管理语言

输入：

```
教师：都坐好了吗？
教师：书翻到第28页了吗？
教师：安静，看黑板。
```

预期：

- 归为课堂管理；
- 不进入 `question_count`；
- 不生成提问质量证据；
- 不视为教学互动。

### 用例十：试卷讲评只报答案

输入：

```
教师：第十题选C，第十一题选A，
第十二题答案是负二。
```

预期：

- 可以描述当前片段主要给出答案；
- 不直接评价教学质量；
- 如果证据充分，可提示未发现错误原因或方法分析；
- 不得断言整节课没有错误分析。

### 用例十一：试卷讲评分析错因

输入：

```
教师：这道题很多同学错在把充分条件当成必要条件。
我们看一下两个概念有什么区别。
```

预期：

- 生成 `error_analysis` 证据；
- 可生成 `method_generalization` 证据；
- 引用对应原文；
- 不机械套用普通提问数量规则。

### 用例十二：复习课知识联系

输入：

```
教师：今天把一次函数、方程和不等式放在一起看，
它们都可以通过图像关系来理解。
```

预期：

- 生成 `knowledge_connection` 证据；
- 可标记为结构化复习；
- 不按新授课中的“新知识引入”进行评价。

### 用例十三：直播技术确认

输入：

```
教师：大家能听见吗？
学生：能。
```

预期：

- 标记为技术确认；
- 不统计为学科问题；
- 不视为学习检查；
- 可在技术中断上下文中作为直播技术证据。

## 十七、未来规划

以下字段暂不进入M1必填输入，不在当前版本中作为正式分析条件：

```
学段
学科
课型
教学环节
班级规模
本节课目标
```

注意：

```
lesson_format
```

表示课程形式，已经属于M1正式字段。

未来规划中的：

```
课型
```

指教学任务类型，例如：

- 新授课；
- 复习课；
- 试卷讲评课；
- 练习课；
- 实验课；
- 考前训练课；
- 专题课。

建议未来字段：

```
export interface FutureLessonContext {
  educationStage?:
    | "primary"
    | "junior_secondary"
    | "senior_secondary"
    | "vocational"
    | "higher_education"
    | "other";

  subject?: string;

  lessonType?:
    | "new_instruction"
    | "review"
    | "test_paper_review"
    | "practice"
    | "exam_training"
    | "experiment"
    | "topic_study"
    | "other";

  teachingStage?:
    | "opening"
    | "explanation"
    | "practice"
    | "discussion"
    | "assessment"
    | "summary"
    | "mixed";

  classSize?: {
    value: number;
    range:
      | "small"
      | "medium"
      | "large";
  };

  lessonObjectives?: string[];
}
```

未来使用方式：

```
学段
+ 学科
+ 课型
+ 教学环节
+ 班级规模
+ 本节课目标
```

作为 Teaching Evidence Agent 的上下文增强输入，用于：

- 调整证据规则；
- 调整阈值；
- 调整建议表达；
- 区分不同教学任务；
- 提升建议的学科适配性；
- 减少对不同课堂形态的误判。

M1阶段不应因为缺少这些字段阻塞开发。

1. 