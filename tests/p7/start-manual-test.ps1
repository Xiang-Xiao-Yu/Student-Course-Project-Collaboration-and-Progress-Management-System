# 人工测试专用入口：只创建独立合成测试库，不修改现有业务库。
param(
  [string]$SourceRoot = 'C:\Users\Lenovo\.codex\worktrees\p7-full-repro-20261112'
)
$ErrorActionPreference = 'Stop'
$runnerPath = Join-Path $PSScriptRoot 'manual-test-session.mjs'
if (-not (Test-Path -LiteralPath $SourceRoot)) { throw '找不到已安装构建的独立测试源码目录。' }
if (-not (Test-Path -LiteralPath $runnerPath)) { throw '找不到人工测试启动入口。' }
$secret = Read-Host '请设置本轮测试账号密码（至少8位，仅用于合成账号）' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:P7_MANUAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($env:P7_MANUAL_PASSWORD.Length -lt 8) { throw '测试密码至少需要8位。' }
  & node $runnerPath $SourceRoot
  if ($LASTEXITCODE -ne 0) { throw '人工测试环境未能启动，详见上方提示。' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:P7_MANUAL_PASSWORD -ErrorAction SilentlyContinue
  $secret.Dispose()
}
