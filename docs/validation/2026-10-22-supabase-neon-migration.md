# Supabase → Neon 迁移验收（2026-10-22，新加坡时间）

## 结果

Neon 正式业务库已完成数据复制，本地开发连接已切换。GCP 线上连接尚未切换，未执行线上端到端验收。保留原 Supabase 项目及旧配置；没有暂停或删除源项目。

- 源：Supabase class-reflect，eavnhqqzkizvrzckgifo，PostgreSQL 17.6。
- 目标：Neon class-reflect，cool-snow-67349609，AWS Singapore，PostgreSQL 17.11，数据库 class_reflect。创建时账户为 free_v3，未升级计划。
- 默认分支 production；另建 migration-validation 分支。由于当前插件不提供目标分支连接串，本次实际恢复演练使用同一项目的独立数据库 class_reflect_migration_validation；该库仍保留。
- 数据快照时间：2026-10-22 02:36:39（UTC+8）。

## 方法

源库启动期间最初查询无业务表；待状态变为 ACTIVE_HEALTHY 后重新盘点，恢复为 12 张业务表。启动期间的空库判断已作废。

本机 Supabase direct 主机解析失败，但 Supabase 插件 SQL 可用。源数据通过一条只读 SQL 的一致性语句快照导出，行以 PostgreSQL JSONB 文本保存，避免客户端 JSON 数字转换损失精度；另外读取列、默认值、约束、索引、注释与 RLS 元数据。源 public schema 已核查无序列、视图、分区表、自定义类型、自定义函数、用户触发器或策略，列无 identity/generated。

先在独立验证数据库恢复，再用 pg_dump 生成可恢复归档，正式空库通过 pg_restore 单事务导入。首次恢复因目标已存在 public schema 回滚；过滤归档中该 schema 的创建和注释条目后重试成功，没有忽略业务表恢复错误。

## 数据核验

逐表将所有行转为 JSONB，与源快照做双向 EXCEPT ALL 比较；全部 0 差异。迁移后再次查询源库全部表摘要，与快照逐表匹配，确认核验时源数据没有漂移。

| 表 | 行数 | 差异 |
| --- | ---: | ---: |
| lessons | 5 | 0 |
| reports | 5 | 0 |
| lesson_videos | 8 | 0 |
| workflow_runs | 5 | 0 |
| analysis_tasks | 6 | 0 |
| evidence_cards | 15 | 0 |
| lesson_sections | 123 | 0 |
| classroom_events | 262 | 0 |
| classroom_metrics | 73 | 0 |
| workflow_step_runs | 80 | 0 |
| transcript_segments | 553 | 0 |
| transcript_speaker_identities | 6 | 0 |

共 1,141 行。正式库另核验 180 列的类型、默认值、非空属性及注释，43 个约束、17 个独立索引、12 张表的 RLS 状态，定义一致。使用事务更新并回滚通过，测试写入未保留。本地 DATABASE_URL、DIRECT_URL 已核对指向 Neon；工作树 .env 受 Git 忽略。

## 备份与回退

持久私密备份目录：`/Users/ninette/Documents/DevWorkspace/class-reflect-migration-backups/2026-10-22`，目录 0700、文件 0600。

包含一致性数据快照、恢复 SQL、验证结果、源摘要、已验证 pg_dump 归档、旧开发环境配置 before-neon.env。密钥和课程正文不提交 Git。

归档 SHA256：`1acfdadd361cfbc3a31b8451b52a98f66d60183e4e97a60556ef2dc7f92861c2`。

若仅回退本地配置，恢复私密目录中的 before-neon.env；若切换后已向 Neon 写入新业务数据，不可直接回退数据库地址，应先对账增量。

## 未完成

- GCP 运行配置尚未读取与更改；需要可用的 GCP 登录/凭据，才能更新数据库连接、重新发布并验证完整应用链路。现有运行服务仍可能写入源库；正式切换前必须暂停业务写入并重新检查增量，当前快照不可无限期作为切换基准。
- 本次复制原线上表结构，没有将本地新增工作流底座迁移混入数据搬迁；新底座仍需在独立验证环境应用迁移并执行集成验收。
- Supabase auth.users 与 storage.objects 均为 0，当前代码未发现 Supabase SDK 数据访问或 auth.users 外键；视频仍走现有 R2。没有迁移 Supabase 平台内置服务表。
- 非 PostgreSQL 文件、R2 视频内容和 GCP 计算部署未迁移。

参考：[Neon 官方迁移指南](https://neon.com/docs/import/migrate-from-supabase)。
