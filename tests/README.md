# 测试指引

## 日常检查

在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test` 运行 API、桌面和共享包的业务测试，当前分别为 256、238、6 项，共 500 项。测试覆盖身份与项目隔离、需求任务、迭代、会议验收、统计导出、表单和异步状态等场景。过去 4 项 AI 日志目录格式测试随本地流程资料退出公开检查，不计入业务回归。

CI 在 Windows 上安装锁定依赖，执行 Prisma 客户端生成、测试、类型、规范和生产构建检查。CI 不依赖本地结项文档、截图或 AI 日志。

依赖安装状态与当前配置不一致时，先核对目录、Node、pnpm 和锁文件，再执行 `pnpm install --frozen-lockfile --prod=false` 后重跑普通检查，不关闭依赖核对来代替修复。

## 测试代码

| 位置                               | 用途                                      |
| ---------------------------------- | ----------------------------------------- |
| `apps/api/src/**/*.spec.ts`        | API 单元、业务集成、权限与并发回归        |
| `apps/desktop/src/**/*.test.ts(x)` | 桌面页面、表单、请求状态、导航及显示逻辑  |
| `packages/shared/src/**/*.test.ts` | 共享契约、状态和输入边界                  |
| `tests/p0`                         | 环境采集、健康与统一响应冒烟              |
| `tests/p3`、`tests/p4`、`tests/p7` | 跨模块、真实 Electron、容量和故障恢复检查 |
| `tests/standalone`                 | 安装、便携运行包与五身份桌面验证          |

既有测试脚本保留原阶段名称，便于复现对应场景；历史结果文件、浏览器配置、数据库和截图不再随源码提交。

## 可选集成与桌面检查

`pnpm test:p0-env` 检查环境，`pnpm test:p0-smoke` 检查正在运行的 API，默认地址为 `http://127.0.0.1:3000/api/v1`，可用 `P0_API_BASE_URL` 调整。

真实桌面检查还需要已有的 Playwright 和 Electron 环境；便携包检查需要先完成构建与打包。脚本入口的参数以代码开头说明为准，示例：

```text
node tests/standalone/desktop-roles.mjs <client/SCPC.exe> <playwright/package.json> <新证据目录> directory <完整便携目录>
node tests/p7/closeout-delivery.mjs <便携ZIP> <playwright/package.json> --unicode-path
node tests/p7/final-full-extra.mjs <源码目录> <playwright/package.json> <electron.exe>
```

截图、结果和测试数据库放在本机的 `tmp` 目录。使用独立账号、数据目录与客户端配置，记录实际命令及失败复测；不以测试结果推定第二台物理设备、混合 DPI 或长期运行已经验证。
