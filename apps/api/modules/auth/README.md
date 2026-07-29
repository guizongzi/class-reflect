# auth module

负责教师账号、登录态、权限和数据隔离。

第一版可以继续使用默认教师身份；真正用户系统接入后，所有 lesson、video、transcript、review 和 report 查询都必须按 teacher_id 隔离。
