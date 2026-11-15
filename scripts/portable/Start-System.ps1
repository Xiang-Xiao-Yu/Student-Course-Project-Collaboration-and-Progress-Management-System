$ErrorActionPreference = 'Stop'
$portableRoot = $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath (Join-Path $portableRoot 'data\initialized'))) {
        Write-Host '首次运行将建立独立数据库，管理员用户名为 admin。'
        $initialPassword = Read-Host '请设置至少8位的管理员密码' -AsSecureString
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($initialPassword)
        try { $env:SCPC_INITIAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    }
    & (Join-Path $portableRoot 'runtime\node.exe') (Join-Path $portableRoot 'bootstrap.mjs')
    if ($LASTEXITCODE -ne 0) { throw '系统未能启动，请检查当前目录是否可写以及首次设置的密码长度。' }
}
catch {
    Write-Host $_.Exception.Message
    if (-not [Console]::IsInputRedirected) { Read-Host '按回车关闭' | Out-Null }
    exit 1
}
finally { $env:SCPC_INITIAL_PASSWORD = $null }
