param(
    [string]$PortableZip = (Join-Path $PSScriptRoot '..\deliverables\final-20261114\SCPC-Windows-Portable.zip'),
    [string]$OutputExe = (Join-Path $PSScriptRoot '..\deliverables\final-20261115\SCPC.exe'),
    [string]$AppUpdate = (Join-Path $PSScriptRoot '..\deliverables\final-20261115\project-app.zip')
)

$ErrorActionPreference = 'Stop'
$zipPath = (Resolve-Path -LiteralPath $PortableZip).Path
$updatePath = (Resolve-Path -LiteralPath $AppUpdate).Path
$exePath = [IO.Path]::GetFullPath($OutputExe)
if (Test-Path -LiteralPath $exePath) { throw 'Choose a new output path; the target already exists.' }
$sums = Join-Path (Split-Path -Parent $zipPath) 'SHA256SUMS.txt'
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
$entry = '^{0}\s+{1}$' -f $hash, [regex]::Escape([IO.Path]::GetFileName($zipPath))
if (-not (Get-Content -LiteralPath $sums | Where-Object { $_ -match $entry })) {
    throw 'The input ZIP does not match the delivery checksum.'
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework x64 compiler is required.' }
$source = Join-Path $PSScriptRoot 'standalone\Launcher.cs'
$bootstrap = Join-Path $PSScriptRoot 'portable\bootstrap.mjs'
$credential = $env:SCPC_DEBUG_ADMIN_PASSWORD
if (!$credential -or $credential.Length -lt 8 -or $credential.Length -gt 128) { throw 'Set SCPC_DEBUG_ADMIN_PASSWORD for this course debug package (8-128 characters).' }
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('scpc-build-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($scratch)
$hashPath = Join-Path $scratch 'payload.sha256'
[IO.File]::WriteAllText($hashPath, $hash)
$built = Join-Path $scratch 'SCPC.exe'
$credentialInput = Join-Path $scratch 'debug-admin-password'
try {
    [IO.File]::WriteAllText($credentialInput, $credential)
    & $compiler /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 "/out:$built" "/resource:$zipPath,payload.zip" "/resource:$hashPath,payload.sha256" "/resource:$updatePath,project-app.zip" "/resource:$bootstrap,bootstrap.mjs" "/resource:$credentialInput,debug-admin-password" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll $source
    if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
} finally {
    [IO.File]::Delete($credentialInput)
}
[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($exePath))
[IO.File]::Move($built, $exePath)
Get-FileHash -LiteralPath $exePath -Algorithm SHA256
