# PR #34 审查修复执行计划

> 执行方式：由 ChatGPT@root 在当前会话逐项完成；用户已授权修复并合并。

**Goal:** 修复已报告的九项 P3 问题，验证并合并 PR #34。

**Architecture:** 保留 NestJS Service/Repository 分层，在 Repository 事务内再次验证写权限、项目状态及当前对象状态。审核拒绝使用现有 ActivityLog，独立返回 rejectionReason；不修改数据库或依赖。

**需求:** FR-03/04/05/07，AC-03/04/08/10；需求基线 0.1.4。

## 文件与行为

- tasks/dto/create-task.dto.ts、update-task.dto.ts：拒绝 null 标签、空白关联 ID、非法日历日期。
- tasks/dto/update-task-status.dto.ts、tasks.service.ts、interfaces/task-response.ts：审核拒绝原因、负责人权限、完成说明隔离。
- projects/project-write-access.ts：事务内用户、成员权限、项目状态复核，创建额外拒绝 PAUSED。
- requirements/repositories/requirements.repository.ts：所有写事务复核权限；数字编号；状态条件更新；完整审计快照。
- tasks/repositories/tasks.repository.ts：所有写事务复核权限；真实前后快照和标签；状态幂等；审核拒绝与原因查询。
- DTO 和 SQLite 回归测试：复现九项问题，并覆盖正常、边界、越权与回滚。
- docs/ai-logs/root/2026-10-27.md：计划、验证、复核、推送与合并结果。

## 执行步骤

- [x] 运行 API 基线，确认生成的 Prisma Client 和测试环境。
- [x] 添加 DTO 边界及真实 SQLite/HTTP 回归，确认原代码失败。
- [x] 修复 DTO 和日期边界，确认对应测试通过。
- [x] 在所有需求/任务写事务内复核权限、项目状态和相关业务约束。
- [x] 为需求状态添加旧状态条件，冲突拒绝而非覆盖终态。
- [x] 按数字后缀分配需求编号，验证 REQ-999/1000 及唯一性。
- [x] 保存修改前后完整业务快照，包括标签和混合状态/字段更新。
- [x] 审核拒绝限定 OWNER/管理员、必填原因、保持待审核；读响应返回原因，审核通过或重新打开后清除当前拒绝提示。
- [x] 同状态请求不刷新 completedAt，不生成虚假状态变更日志。
- [x] 运行全仓测试、typecheck、lint/build 和差异检查，复核所有写路径。
- [ ] 逻辑提交，更新现有 PR，确认远程 head 和检查，再合并；同步本地主线并保留用户原始改动。

## 重点回归

- 旧权限请求遇到成员移除/降级、负责人转移、用户禁用、归档/暂停后不得写入。
- 数据变更和日志同事务回滚；冲突不会遗留标签或状态日志。
- 审核拒绝不能改变完成说明；普通成员不得伪造审核结果。
- 重复完成请求保留首次完成时间；正常重新打开必须原因且清空完成时间。
- 输入错误返回稳定业务错误，正式数据库与历史日志不受影响。
