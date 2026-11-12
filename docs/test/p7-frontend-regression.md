# P7 前端回归复跑说明

范围：PR #56，FR-09～FR-11、AC-07、AC-09、AC-10 的补强；保留原有主流程、迭代、会议、观察者及非成员隔离七组检查。该脚本不是完整 P7/MVP 最终验收。

## 前置条件和命令

使用独立工作区、项目要求的 Node.js 与 pnpm 版本。已安装锁文件依赖并生成 Prisma Client；准备可用的 Playwright 包与项目 Electron 可执行文件，不更换运行时版本或添加项目依赖。

在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @scpc/api build
pnpm --filter @scpc/desktop build

# 改为本机已安装的 Playwright 包入口及 Electron 可执行文件的绝对路径。
$playwrightPackage = 'C:\path\to\playwright\package.json'
$electronExe = (Resolve-Path -LiteralPath 'apps/desktop/node_modules/electron/dist/electron.exe').Path
node apps/desktop/tests/run-p7-mvp-regression.mjs $playwrightPackage $electronExe
```

运行入口新建 `tmp/p7-mvp-regression-<时间戳>-<随机值>/p7.sqlite` 并应用迁移，启动绑定 127.0.0.1 随机端口的 Nest API，再启动标准 Electron。调用者的 DATABASE_URL、JWT_SECRET 和开发页面地址被测试环境覆盖；不会使用既有数据库，不运行 seed，不禁用 Electron 沙箱。正常或失败退出后停止本次 API 与回归进程，保留全部证据。

## 断言和证据

- 验收：通过界面创建记录，进入验收中和未通过，创建关联整改任务；成员通过界面执行和提交，负责人审核，再次验收通过。验证任务关联、唯一性、服务端最终状态，以及刷新后的已通过结果和已完成整改任务。
- 仪表盘：模拟请求失败后重试，界面应显示 3 个任务、66.67% 完成率（核心任务和整改任务完成，会议转换任务未完成）。
- 导出：监听 Electron 下载，指定保存到证据目录，等待 completed；检查文件名、UTF-8 BOM，以及 CSV 中项目名、任务总数 3、已完成 2、完成率 66.67%。仅 HTTP 200 不算导出通过。
- 运行目录保存 `migration.txt`、`api.txt`、`regression.txt`、`results.json`、页面截图、`download-0.csv` 和隔离 SQLite。数据库、账号、浏览器配置和原始导出只作为本地测试证据，不提交到 Git。

退出码为 0 且 `results.json` 七组均为 passed 才算本脚本通过。失败时保留已通过项、失败标记和截图；修复后使用新目录重跑。原有活动标签映射问题仍保留，其他 FR/AC 需要 T-03 按正式清单独立验收。
