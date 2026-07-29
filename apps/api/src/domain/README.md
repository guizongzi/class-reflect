# domain layer

放系统最稳定的业务概念和规则，例如：

- Lesson / ClassroomVideo / TranscriptSegment / EvidenceCard / Report
- 教师是否拥有某节课
- 一条证据是否可以进入报告
- 逐字稿时间轴是否合法

domain 层必须尽量纯净，不依赖 Express、PostgreSQL、R2、阿里云或模型服务。
