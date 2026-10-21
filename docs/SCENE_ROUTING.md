# 场景评价隔离

目标：基于现有lesson_format标签和可观察语音角色特征，分离真实双向互动评价与录播/模拟教学呈现分析。保留教师终审，不新增自动教资总分。

- 场景标签显式透传至生成、校验、存储、API、UI和报告。
- 线下课堂录像不等于单人录播讲解：有真实师生材料的录像仍可进入真实互动范围。
- 没有学生侧标签不是“没有学生”的事实证明；特征缺失或冲突只触发人工复核和互动指标关闭，不自动改写课堂标签。
- 录播/模拟路径禁用双向互动指标；保留教学结构、解释、支架、例子、教学语言与总结等。无画面时不评板书/课件，无可靠计时或题本要求时不评超时。
- 结果携带版本化场景快照，按场景隔离保存与读取；场景变更后旧结果不得继续进入审核/报告。
- 人工场景纠正保留前后标签和特征快照，作为后续标注样本；当前没有训练好的前置分流模型，不能声称已经完成模型训练回流。
- 测试包括：真实互动、无学生音轨、标签与学生角色冲突、模拟学生台词、未知标签、旧别名、陈旧结果隔离、报告口径隔离和纠正记录。
- 场景错分率X%→Y%需要独立人工标注集与相同采样规则。当前只能报告自动化回归结果，不能编造真实错分率。

范围不包含此前暂停的输出规范化、JSON Schema切换或LLM judge修复。

## 统一指标策略与动态变更

配置入口：`packages/config/src/workflow/default.json（sceneProfiles）`，按 `sceneType:evaluationScope` 绑定 `allowed_metric_ids` 与 `allowed_category_ids`。未知指标默认拒绝；历史中文指标通过配置映射为稳定 ID，缺场景快照的旧结果需要重新生成。

统一过滤函数 `filterSceneMetrics` 用于数据库读取、保存、Evidence 输入和报告；单条计算经 `checkSceneMetric` 执行前检查。生产 Worker 使用 `calculateScopedClassroomMetrics`，每项重新读取场景版本；不保存内存白名单缓存。场景或有效角色变化后递增 scene_revision，下一轮重算策略；自动角色变更尊重人工角色覆盖。替换转录同样递增版本。执行期间变化则拒绝旧任务保存，不能给旧结果补贴新版本。

日志事件：`scene_context_changed`、`scene_metric_execution_skipped`、`scene_metric_blocked`。按 sceneType/sceneRevision/workflowRunId 汇总 `blockedCount` 和 `postChangeViolationHitCount`；后者代表发现旧快照的拦截次数，不代表违规输出数。外部告警尚未接入。

数据库迁移尚需在目标环境执行；本地数据库隔离测试使用事务模拟，不等于真实数据库集成验证。
