# P3 Electron 完整阶段验收计划

> **For agentic workers:** 按本计划执行验收，root 负责集成与门禁；不扩大到 P4 实现。

**Goal:** 在最新 main 上完成真实 Electron + Nest API + 隔离 SQLite 的 P3 验收，修复实际缺陷，全部通过后按项目组长明确授权解锁 P4。

**Architecture:** 复用锁定依赖及现有测试模式，运行专用本机 API 与新数据库；Electron 测试与 HTTP 权限矩阵使用独立测试账号/项目。root 保存命令、输出、截图、请求记录与门禁结论，代理独立复核覆盖。

**Tech Stack:** Node 24.18.0、pnpm 11.21.0、Electron 44.4.3、React、NestJS、Prisma 6.19.3、SQLite；复用本机 Playwright，不修改依赖。

**Spec:** `docs/需求规格说明书.md`、`docs/tasks/T-01-backend-core.md`、`docs/tasks/T-02-frontend-client.md`、`docs/tasks/T-03-test-quality.md`。

## 约束与关注点

- FR-04、FR-05、FR-07；AC-03、AC-04，关联 AC-08、AC-10。评论写入和迭代仍属于 P4。
- 不读取或修改已有业务数据库；隔离数据和 Electron profile 置于 `.cache/p3-electron-gate/` 或已有忽略的 `tmp/ui-demo/`。
- 验收工具的密码、JWT 和访问令牌仅运行时内存/子进程环境；客户端沿用隔离 profile 的 sessionStorage，凭据和 profile 不进入证据。
- 真实角色流必须由普通成员提交、负责人审核；权限不能只看隐藏按钮。
- 输入边界、失败后的数据/日志不变、100 条以上活动分页、跨任务/需求请求、草稿保护均有对应证据。
- 只有所有必要检查通过才更新 P4；用户已明确“通过后解锁 P4”，不另行要求重复批准。

## 执行清单

- [x] 核对原目录和工作区状态，基于 `7f789e0` 创建 `test/p3-electron-gate-20261103`。
- [x] 恢复锁定 Electron 二进制，确认实际运行版本；使用 Migration 创建新 SQLite，启动独立 API。
- [x] root 新增 `tests/p3/run-electron-gate.mjs`，管理隔离环境、服务生命周期和证据目录。
- [x] 新增 `tests/p3/http-acceptance.mjs`：真实 HTTP 正常/边界/权限/日志矩阵。
- [x] 新增 `apps/desktop/tests/p3-electron-acceptance.mjs`：真实 Electron 完整 AC-03/AC-04 及失败恢复。
- [x] 对实际失败先保存证据、定位根因，再按用户授权最小修复并回归；不削弱检查或伪造业务成功响应。
- [x] 运行 lint、typecheck、test、build，与 Electron/HTTP 结果一同交独立覆盖审查。
- [x] root 新增 `docs/test/p3-electron-gate-2026-11-03.md` 与证据目录，更新当天日志。
- [x] 全部通过后更新 T-01、T-02、T-03 的进度/门禁状态，保持 P5 及以后锁定，恢复受保护文件只读隐藏属性。
- [x] 完成提交前差异、证据与独立评审核对；后续提交、推送、PR 检查及合并状态由本分支 Git / GitHub 记录追踪。
