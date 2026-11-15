# 学生课程项目协作与进度管理系统

面向学生课程项目团队的协作与进度管理系统，覆盖项目、成员、需求、任务、迭代、会议、阶段验收和进度统计。

- 仓库：<https://github.com/Xiang-Xiao-Yu/Student-Course-Project-Collaboration-and-Progress-Management-System>
- Issues：<https://github.com/Xiang-Xiao-Yu/Student-Course-Project-Collaboration-and-Progress-Management-System/issues>
- Pull Requests：<https://github.com/Xiang-Xiao-Yu/Student-Course-Project-Collaboration-and-Progress-Management-System/pulls>

## 1. 当前状态

本仓库包含 Windows 0.1.10 的 MVP 业务源码。结项范围为 FR-01～FR-11、AC-01～AC-11，依据[需求规格 0.1.6](docs/需求规格说明书.md)。检查结果、安装包校验值及尚待人工确认的事项见[结项检查](docs/结项文档/0.1.10-结项检查.md)。

已取得课程安装包的用户可运行 `SCPC-0.1.10-x64.msi`，从安装目录的 `SCPC.exe` 或开始菜单启动。便携版请放在可写目录运行。发行包与测试数据不纳入 Git。空库调试管理员的首次登录信息由交付人单独提供，已有库沿用自己的密码。

| 工作区                 | 路径               | 技术栈                  | 负责方 |
| ---------------------- | ------------------ | ----------------------- | ------ |
| API 服务               | `apps/api/`        | NestJS + Prisma         | T-01   |
| 桌面客户端             | `apps/desktop/`    | Electron + React + Vite | T-02   |
| 共享类型与 DTO         | `packages/shared/` | TypeScript              | T-01   |
| 数据库 Schema 与迁移   | `prisma/`          | Prisma + SQLite         | T-01   |
| 跨模块测试与质量记录   | `tests/`           | Vitest 等               | T-03   |
| 需求、契约、任务与文档 | `docs/`            | Markdown                | `root` |

## 2. 环境要求

- Windows 10/11（当前交付目标为局域网内的桌面应用）
- Node.js `>= 24.18.0`（见根 `package.json` 的 `engines`）
- pnpm `11.21.0`（已由根 `package.json` 的 `packageManager` 锁定）
- Git 2.40 及以上

## 3. 快速开始

```powershell
git clone https://github.com/Xiang-Xiao-Yu/Student-Course-Project-Collaboration-and-Progress-Management-System.git
cd Student-Course-Project-Collaboration-and-Progress-Management-System

pnpm install --frozen-lockfile
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
powershell -ExecutionPolicy Bypass -File scripts/set-agent-file-attributes.ps1

pnpm db:generate
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
```

说明：

- `.env` 只保存在本地，禁止提交；`.env.example` 中的值都是占位值，不要替换成真实凭据后再提交。
- `scripts/set-agent-file-attributes.ps1` 把受保护文件设置为 Windows 只读 + 隐藏，与 `AGENTS.md` 的文件权限约定保持一致；使用 `-Status` 查看当前属性。
- 首次执行 `pnpm db:migrate` 时，`scripts/ensure-database-file.mjs` 会自动补齐 `data/` 目录和空的 SQLite 文件；Prisma 不会自动创建缺失的数据库文件，缺少时只会抛出无进一步提示的 `Schema engine error`。

## 4. 启动命令

P0 约定的启动命令（与 `docs/P0-工程与契约约定.md` 第 4 节一致）：

| 命令                             | 用途                                            |
| -------------------------------- | ----------------------------------------------- |
| `pnpm install --frozen-lockfile` | 安装锁定的依赖                                  |
| `pnpm dev`                       | 同时启动 API 与桌面客户端                       |
| `pnpm dev:api`                   | 启动 NestJS API（默认 `http://127.0.0.1:3000`） |
| `pnpm dev:desktop`               | 启动 Electron + React 客户端                    |
| `pnpm db:migrate`                | 执行 Prisma Migration                           |
| `pnpm db:seed`                   | 写入最小开发种子数据                            |
| `pnpm build`                     | 构建 API 与桌面客户端                           |
| `pnpm test`                      | 执行当前阶段测试                                |
| `pnpm lint`                      | 执行 ESLint 与 Prettier 检查                    |
| `pnpm typecheck`                 | 执行 TypeScript 严格类型检查                    |

首次启动前在本地配置中设置随机的 `JWT_SECRET`。开发库需要示例数据时才运行 `pnpm db:seed`。

## 5. 数据库与目录约定

- SQLite 数据库文件为 `data/app.db`，`DATABASE_URL=file:../data/app.db` 相对于 `prisma/schema.prisma` 解析。
- `data/` 只保存本地数据，`.db`、`.sqlite` 文件不进入 Git。
- 数据库结构变化必须通过 Prisma Migration，禁止手工修改运行中的数据库结构。
- API 端口、API 前缀、响应格式、错误码和环境变量以 `docs/P0-工程与契约约定.md` 为准。

## 6. 其他智能体接入流程

1. `git clone` 本仓库并停留在 `main`；不要假设远程地址，也不要直接向 `main` 提交。
2. 执行 `pnpm install --frozen-lockfile` 和 `scripts/set-agent-file-attributes.ps1`。
3. 按顺序阅读：`AGENTS.md` → `docs/ai-agents/AGENTS.md` → `docs/README.md` → `docs/需求规格说明书.md` → `docs/P0-工程与契约约定.md` → 拟认领的 `docs/tasks/` 任务文档 → 相关源码与测试。
4. 长期负责人选择未被认领的任务，向 `root` 申请并等待明确确认后取得修改权限；临时评审、测试与辅助智能体只按 root 已委派的范围工作，不占用正式任务或变更负责人。
5. 建立独立分支与 worktree，目录命名遵循 `docs/ai-agents/智能体初始化提示词.md` 第 5 节。
6. 在自己的 worktree 中配置署名身份，并在提交信息末尾附加署名尾注：

   ```text
   git config user.name "<智能体名称>@<任务标记>"
   git config user.email "<agent-id>@local"

   feat(task): add task status transition

   Agent: DeepSeek@backend
   Task: T-01
   ```

7. 主要智能体只在 `docs/ai-logs/root/`、`docs/ai-logs/codex-backend/`、`docs/ai-logs/deepseek-frontend/` 对应固定目录的当日日志中记录计划、实际改动、验证命令和风险；临时评审、测试与辅助智能体仅向 root 交接，由 root 汇总，不创建独立日志目录或文件。
8. 所有交付通过 Pull Request 提交给 `root` 评审，禁止直接推送受保护分支或自行合并 PR。
9. 阶段推进遵循门禁：T-01、T-02 完成当前阶段 → 全员冻结 → T-03 统一检查 → `root` 明确解锁下一阶段。检查未通过前不得开始下一阶段。

## 7. 受保护文件

以下文件由 `root` 管理，其他智能体严格只读；需要调整时通过 GitHub Issue 提交建议：

- `AGENTS.md`
- `docs/ai-agents/AGENTS.md`
- `docs/需求规格说明书.md`
- `docs/P0-工程与契约约定.md`
- `docs/ai-logs/README.md`
- `docs/tasks/T-03-test-quality.md`

其他智能体即使具备本地文件系统权限，也不得解除这些文件的只读和隐藏属性。

## 8. 文档索引

| 文档                        | 内容                                          |
| --------------------------- | --------------------------------------------- |
| `docs/README.md`            | `docs/` 交付物索引与维护规则                  |
| `docs/需求规格说明书.md`    | 需求基线：FR-01～FR-15、AC-01～AC-11          |
| `docs/P0-工程与契约约定.md` | P0 目录、命令、环境变量、响应格式与数据库约定 |
| `docs/design/ui-demo.html`  | P0 前端风格演示（纯静态页面）                 |
| `docs/ai-logs/README.md`    | 智能体日志规范与模板                          |
| `docs/tasks/`               | T-01、T-02、T-03 任务范围与阶段安排           |

## 9. 常见问题

| 现象                                               | 处理方式                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm db:migrate` 报 `Error: Schema engine error:` | 确认 `data/` 目录与 `data/app.db` 是否存在；直接重新执行 `pnpm db:migrate`，脚本会补齐后再迁移 |
| PowerShell 拒绝执行脚本                            | 使用 `powershell -ExecutionPolicy Bypass -File <脚本路径>`                                     |
| `pnpm install` 提示 Node 版本不符                  | 升级到 Node.js 24.18.0 及以上，或按团队约定统一版本                                            |

接口、权限、数据和安全边界的完整约定见 `AGENTS.md` 与 `docs/P0-工程与契约约定.md`；两者冲突时先向 `root` 报告，不要自行选择。
