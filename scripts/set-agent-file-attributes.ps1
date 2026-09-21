<#
.SYNOPSIS
    为 root 管理的受保护文件设置或清除 Windows 只读 + 隐藏属性。

.DESCRIPTION
    本脚本与 AGENTS.md、docs/ai-agents/AGENTS.md 的文件权限约定保持一致：
    root 管理的受保护文件对其他智能体严格只读，并在 Windows 上设置为只读和隐藏。
    其他智能体 clone 仓库后可以执行本脚本，使本地文件属性与仓库规则一致。

    只有 ChatGPT@root 在项目组长明确要求或批准的监督范围内，才能使用 -Clear 临时解除属性；
    修改完成后必须重新执行本脚本（不带参数）恢复属性，并在 root 日志中记录。

.PARAMETER Clear
    清除受保护文件的只读和隐藏属性。仅限 root 在批准范围内使用。

.PARAMETER Status
    只显示当前属性，不做任何修改。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/set-agent-file-attributes.ps1
    设置只读和隐藏属性。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/set-agent-file-attributes.ps1 -Status
    查看受保护文件当前属性。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/set-agent-file-attributes.ps1 -Clear
    清除只读和隐藏属性（仅限 root 在批准范围内使用）。
#>
#Requires -Version 5.1
[CmdletBinding(DefaultParameterSetName = 'Apply')]
param(
    [Parameter(ParameterSetName = 'Clear')]
    [switch]$Clear,

    [Parameter(ParameterSetName = 'Status')]
    [switch]$Status
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

# 与 AGENTS.md「智能体层级与协作权限」和 docs/ai-agents/AGENTS.md 第 3 节保持一致；
# 两份文件同时更新时，本清单必须一起更新。
$protectedPaths = @(
    'AGENTS.md'
    'docs/ai-agents/AGENTS.md'
    'docs/需求规格说明书.md'
    'docs/P0-工程与契约约定.md'
    'docs/tasks/T-03-test-quality.md'
)

$readOnlyFlag = [int][System.IO.FileAttributes]::ReadOnly
$hiddenFlag = [int][System.IO.FileAttributes]::Hidden
$flagMask = $readOnlyFlag -bor $hiddenFlag

$missing = New-Object System.Collections.Generic.List[string]
$rows = New-Object System.Collections.Generic.List[object]

foreach ($relativePath in $protectedPaths) {
    $fullPath = Join-Path $repoRoot ($relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar)

    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        $missing.Add($relativePath)
        continue
    }

    $item = Get-Item -LiteralPath $fullPath -Force
    $before = [int]$item.Attributes
    $after = $before

    if (-not $Status) {
        if ($Clear) {
            $after = $before -band (-bnot $flagMask)
        }
        else {
            $after = $before -bor $flagMask
        }

        if ($after -ne $before) {
            $item.Attributes = [System.IO.FileAttributes]$after
        }
    }

    $effective = if ($Status) { $before } else { $after }

    $rows.Add([pscustomobject]@{
            Path     = $relativePath
            ReadOnly = [bool]($effective -band $readOnlyFlag)
            Hidden   = [bool]($effective -band $hiddenFlag)
            Changed  = [bool](($after -ne $before) -and -not $Status)
        })
}

Write-Host "仓库根目录：$repoRoot"

if ($Status) {
    Write-Host '当前受保护文件属性：'
}
elseif ($Clear) {
    Write-Host '已清除受保护文件的只读和隐藏属性（仅限 root 在批准范围内使用）。'
}
else {
    Write-Host '已设置受保护文件为只读 + 隐藏。'
}

$rows | Format-Table -AutoSize | Out-String -Width 200 | Write-Host

if ($missing.Count -gt 0) {
    Write-Warning ('以下受保护文件缺失，无法设置属性：' + ($missing -join '、'))
    Write-Warning '文件缺失时先检查 clone 是否完整或分支是否正确，不要通过新建同名文件绕过。'
    exit 1
}

exit 0
