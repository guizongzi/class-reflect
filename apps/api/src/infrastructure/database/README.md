# database infrastructure

放 PostgreSQL 连接、迁移、仓储实现和事务工具。

数据库表可以服务多个功能模块，但查询入口应收敛到仓储，避免 SQL 散落在路由和流程代码里。
