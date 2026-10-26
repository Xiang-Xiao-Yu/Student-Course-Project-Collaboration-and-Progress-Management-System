# P2 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 T-01 P2 后端缺陷、复核并修复 T-02 P2 前端阻塞问题，完成 P2 阶段验收。

**Architecture:** 维持 NestJS Service/Repository 分层和 Prisma 事务；新增独立删除审计快照表；在独立前端工作树处理 PR #30 的界面问题。先写可复现测试，再改生产代码。

**Tech Stack:** NestJS、TypeScript、Prisma、SQLite、React、Electron、Vitest；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-25-p2-remediation-design.md`、Issue #29、`docs/需求规格说明书.md`、`docs/tasks/T-01-backend-core.md`、`docs/tasks/T-02-frontend-client.md`、`docs/tasks/T-03-test-quality.md`。

## Global Constraints

- 对应 FR-02、FR-03、AC-02、AC-08、AC-10；头像响应兼容既有 FR-01、AC-11。
- 不修改需求基线、依赖、锁文件、阶段顺序或 P3；所有数据库变化通过 Migration。
- 后端权限校验不能依赖前端隐藏；项目删除、负责人移交和审计写入保持事务一致。
- T-01/T-02 完成后均标记待测试；P2 门禁需保存完整可复核证据，P3 仍锁定。

## Review Focus

1. 同一 owner 快照的并发移交、旧 owner 失权、目标成员已变化。
2. 删除前确认失败、删除审计插入失败、删除后审计可查。
3. Create/Update 字段省略、null、空字符串、非法日期和日期区间。
4. 无头像、HTTP(S)、上传头像、文件丢失及非成员访问。
5. 首次直达无权限子路由、切换 projectId、未保存编辑后归档。

---

### Task 1: 建立 PR #28 回归测试

**Files:**
- Create: `apps/api/src/modules/projects/dto/project-dtos.spec.ts`
- Modify: `apps/api/src/modules/projects/projects.service.spec.ts`
- Modify: `apps/api/src/modules/projects/project-members.service.spec.ts`
- Create: `apps/api/src/modules/projects/projects-p2.integration.spec.ts`

- [x] 为 Update/Create DTO 写 null 与省略规则测试；先见旧实现 7 项失败，再见修复后 7 项通过。
- [x] 为成员响应写 uploaded 头像响应测试；旧实现返回 `uploaded:` 原引用，修复后同一测试组通过 6/6。
- [x] 创建临时 SQLite 数据库并用真实 Repository 重现同快照并发移交及删除审计；旧实现两次移交均成功、审计表缺失；修复与 Migration 后通过 3/3。

### Task 2: 修复 PR #28 后端

**Files:**
- Modify: `apps/api/src/modules/projects/repositories/projects.repository.ts`
- Modify: `apps/api/src/modules/projects/projects.service.ts`
- Modify: `apps/api/src/modules/projects/project-members.service.ts`
- Modify: `apps/api/src/modules/projects/dto/create-project.dto.ts`
- Modify: `apps/api/src/modules/projects/dto/update-project.dto.ts`
- Modify: `apps/api/src/modules/projects/projects.module.ts`
- Modify: `apps/api/src/modules/users/users.module.ts`
- Modify: `packages/shared/src/contracts/error-codes.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261025000000_p2_project_deletion_audit/migration.sql`

- [x] 先确认新增回归测试按预期失败。
- [x] 实现事务内 owner CAS/角色检查、持久删除审计、null 拒绝和共享头像转换。
- [x] 运行新增测试与 API 全量测试、类型检查、lint/build。

### Task 3: 复核 PR #30

**Files:**
- Modify in the PR #30 worktree: `apps/desktop/src/renderer/src/layouts/AppLayout.tsx`
- Modify in the PR #30 worktree: `apps/desktop/src/renderer/src/pages/ProjectSettingsPage.tsx`
- Modify in the PR #30 worktree: `apps/desktop/tests/p2-project-ui.mjs`
- Modify in the PR #30 worktree: `apps/desktop/src/renderer/src/lib/api/errors.ts`

- [x] 复核 PR 最新 head 与后端契约。
- [x] 复核当前 head 的访问门禁、未保存归档和新 API 错误码映射；保存具体行与证据。
- [x] T-03 初审确认两个阻断后，root 指定 T-02 修复范围；修复后重新冻结并复测。

### Task 4: P2 冻结门禁

**Files:**
- Create: `apps/api/src/modules/projects/projects-p2-http.integration.spec.ts`
- Modify: `docs/tasks/T-01-backend-core.md`（进度区域）
- Modify: `docs/tasks/T-02-frontend-client.md`（进度区域）
- Modify: `docs/tasks/T-03-test-quality.md`（root 进度区域）
- Create: `docs/test/p2-r1-2026-10-25.md`
- Modify: `docs/ai-logs/root/2026-10-25.md`

- [x] T-01/T-02 冻结后按 T-03 执行 AC-02/AC-08 正常、边界、失败、角色和真实 API 联调并保存完整输出。
- [x] 初审失败后记录 root 修复范围，修复后将 T-01/T-02 重新冻结并复测。
- [x] 报告结论、风险、环境限制和当前门禁状态；P2 通过，P3 仍需项目组长授权解锁。
