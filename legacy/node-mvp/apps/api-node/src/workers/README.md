# workers

放后台任务入口，例如 Cloud Run Jobs、队列消费者或批处理脚本。

API 服务适合短请求；长视频处理、批量分析、报告批量导出应逐步迁到 workers。
