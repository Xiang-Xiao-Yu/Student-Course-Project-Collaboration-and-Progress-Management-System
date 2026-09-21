# 文档索引与交付物清单

本文件是 `docs/` 的入口索引。根目录 `AGENTS.md` 要求 `docs/` 保存需求规格、用例图、ER 图、接口说明、测试计划、迭代记录和验收报告；本文件列出这些交付物的目标路径、负责人和当前状态，避免出现漏拆或无人负责的文档。

## 1. 已建立的文档

| 文件 | 内容 | 维护者 |
|---|---|---|
| `AGENTS.md`（仓库根目录） | 根级 AI 协作与交付规范 | `root` |
| `docs/ai-agents/AGENTS.md` | 其他智能体工作规范 | `root` |
| `docs/ai-agents/智能体初始化提示词.md` | 其他智能体初始化提示词 | `root` |
| `docs/需求规格说明书.md` | 需求基线 `0.1.1`，FR-01～FR-15、AC-01～AC-10 | `root` |
| `docs/P0-工程与契约约定.md` | P0 工程入口与跨任务契约 | `root` |
| `docs/ai-logs/README.md` | 智能体日志规范 | `root` |
| `docs/ai-logs/root/YYYY-MM-DD.md` | root 工作日志 | `root` |
| `docs/tasks/T-01-backend-core.md` | T-01 后端核心与共享契约任务 | T-01 负责人 |
| `docs/tasks/T-02-frontend-client.md` | T-02 前端客户端与交互流程任务 | T-02 负责人 |
| `docs/tasks/T-03-test-quality.md` | T-03 测试、质量门禁与验收任务 | `root` |
| `docs/design/ui-demo.html` | P0 前端风格演示（纯静态页面，不含后端实现） | `root` 维护，T-02 参照实现 |

## 2. 待建立的交付物

| 交付物 | 目标路径 | 负责人 | 计划阶段 | 状态 |
|---|---|---|---|---|
| 用例图 | `docs/design/use-case-diagram.md` | T-01 | P1 | 待创建 |
| ER 图 | `docs/design/er-diagram.md` | T-01 | P1 | 待创建 |
| 接口说明 | `docs/design/api-spec.md` | T-01 | P1 | 待创建 |
| 测试计划与用例 | `docs/test/test-plan.md` | T-03 | P0 | 待创建 |
| 迭代记录 | `docs/iteration/log.md` | `root` | 每阶段结束时 | 待创建 |
| 验收报告 | `docs/acceptance/report.md` | T-03 | 每轮门禁 | 待创建 |

以上路径为约定位置；确需调整时先创建 GitHub Issue，由 `root` 批准后同步更新本文件与相关任务文档。

## 3. 维护规则

- 本清单与 `AGENTS.md` 的 `docs/` 交付物要求保持一致；新增、移动或删除交付物时，必须在同一个 PR 内更新本文件。
- 任务负责人只能修改自己任务允许的交付物和任务文档中的“进度记录”“验证记录”“交接记录”，不得修改他人交付物。
- 受保护文件与其他智能体严格只读的完整清单见 `docs/ai-agents/AGENTS.md` 第 3 节。
