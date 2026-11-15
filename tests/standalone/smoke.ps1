param([Parameter(Mandatory = $true)][string]$Executable, [switch]$InterruptExtraction, [string]$UpgradeFrom)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$source = (Resolve-Path -LiteralPath $Executable).Path
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ("SCPC 测试 " + [Guid]::NewGuid().ToString('N').Substring(0,8))
[void][IO.Directory]::CreateDirectory($testRoot)
$copy = Join-Path $testRoot 'SCPC.exe'
$firstBuild = if ($UpgradeFrom) { (Resolve-Path -LiteralPath $UpgradeFrom).Path } else { $source }
Copy-Item -LiteralPath $firstBuild -Destination $copy
$runtimeDir = Join-Path $testRoot 'SCPC-便携版'
$sessionPath = Join-Path $runtimeDir 'data\last-session.json'
$password = $env:SCPC_DEBUG_ADMIN_PASSWORD
if (!$password) { throw 'Set SCPC_DEBUG_ADMIN_PASSWORD for the tested debug package.' }

function Wait-For($description, [scriptblock]$probe, $seconds = 90) {
    $until = [DateTime]::UtcNow.AddSeconds($seconds)
    do {
        $value = & $probe
        if ($value) { return $value }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $until)
    throw "Timeout: $description"
}
function Get-Session {
    if (Test-Path -LiteralPath $sessionPath) {
        try { return Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json } catch { return }
    }
}
function Get-Desktop {
    Get-Process -Name SCPC -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -eq (Join-Path $runtimeDir 'client\SCPC.exe') -and $_.MainWindowHandle -ne 0
    } | Select-Object -First 1
}
function Open-System {
    Start-Process -FilePath $copy -PassThru
}
function Stop-System($launcher) {
    $desktop = Wait-For 'visible Electron window' { Get-Desktop }
    if (-not $desktop.CloseMainWindow()) { throw 'Desktop could not close normally.' }
    if (-not $launcher.WaitForExit(20000) -or $launcher.ExitCode -ne 0) { throw 'Launcher did not exit normally.' }
    if ((Get-Session).status -ne 'stopped') { throw 'API stop not recorded.' }
}
function Get-Login($base) {
    $body = @{ username = 'admin'; password = $password } | ConvertTo-Json
    $response = Invoke-RestMethod "$base/auth/login" -Method Post -Body $body -ContentType 'application/json'
    if (-not $response.data.accessToken) { throw 'Administrator login failed.' }
    return @{ Authorization = 'Bearer ' + $response.data.accessToken }
}
$originalDirectory = [Environment]::CurrentDirectory
$launcher = Open-System
try {
    # A process using the extraction directory as its current directory prevents
    # Windows from renaming it, while ordinary file writes remain possible.
    $unpack = Wait-For 'runtime extraction to begin' {
        Get-ChildItem -LiteralPath $testRoot -Directory -Filter 'SCPC-便携版*' | Select-Object -First 1
    }
    [Environment]::CurrentDirectory = $unpack.FullName
    if ($InterruptExtraction) {
        $null = Wait-For 'partial runtime files' {
            (Test-Path -LiteralPath (Join-Path $unpack.FullName '.scpc-installing')) -and
            (Test-Path -LiteralPath (Join-Path $unpack.FullName 'apps'))
        }
        $launcher.Kill()
        $launcher.WaitForExit()
        $launcher = Open-System
    }
    $tree = [Windows.Automation.AutomationElement]
    $scope = [Windows.Automation.TreeScope]
    $condition = [Windows.Automation.PropertyCondition]::new($tree::ProcessIdProperty, $launcher.Id)
    $all = [Windows.Automation.Condition]::TrueCondition
    $session = Wait-For 'automatic first startup' {
        $s = Get-Session
        if ($s.status -eq 'ready') { return $s }
        foreach ($win in $tree::RootElement.FindAll($scope::Children, $condition)) {
            foreach ($item in $win.FindAll($scope::Subtree, $all)) {
                if ($item.Current.Name -eq '首次启动 · 设置管理员密码') { throw 'First launch asked for a password.' }
            }
        }
        if ($launcher.HasExited) { throw 'Launcher exited before login.' }
    } 240
    $headers = Get-Login $session.apiBase
    $project = Invoke-RestMethod ($session.apiBase + '/projects') -Method Post -Headers $headers -ContentType 'application/json' -Body '{"name":"Standalone restart check"}'
    if (-not $project.data.id) { throw 'Project creation failed.' }
    $profile = Invoke-RestMethod ($session.apiBase + '/users/me') -Headers $headers
    if ($profile.data.username -ne 'admin' -or -not $profile.data.isPlatformAdmin) { throw 'Administrator role missing.' }
    $sqlCheck = "const db=new (require('node:sqlite').DatabaseSync)(process.argv[1],{readOnly:true});if(db.prepare('SELECT count(*) AS n FROM User WHERE isPlatformAdmin = 1').get().n!==1)process.exitCode=1;db.close()"
    & (Join-Path $runtimeDir 'runtime\node.exe') -e $sqlCheck (Join-Path $runtimeDir 'data\app.sqlite')
    if ($LASTEXITCODE -ne 0) { throw 'Expected exactly one administrator.' }
    $changed = [guid]::NewGuid().ToString('N')
    $changeBody = @{ currentPassword = $password; newPassword = $changed } | ConvertTo-Json
    $null = Invoke-RestMethod ($session.apiBase + '/users/me/password') -Method Patch -Headers $headers -ContentType 'application/json' -Body $changeBody
    $password = $changed
    Stop-System $launcher
    if (Get-Process -Id $session.pid -ErrorAction SilentlyContinue) { throw 'First API process is still running.' }
    if ($UpgradeFrom) { Copy-Item -LiteralPath $source -Destination $copy -Force }
    $launcher = Open-System
    $session = Wait-For 'second API startup' { $s = Get-Session; if ($s.status -eq 'ready') { $s } }
    $headers = Get-Login $session.apiBase
    $restored = Invoke-RestMethod ($session.apiBase + '/projects/' + $project.data.id) -Headers $headers
    $capability = Invoke-RestMethod ($session.apiBase + '/projects/creation-permission') -Headers $headers
    if ($capability.data.canCreate -ne $true) { throw 'Updated administrator permission missing.' }
    if ($restored.data.name -ne 'Standalone restart check') { throw 'Project did not survive restart.' }
    Stop-System $launcher
    if (Get-Process -Id $session.pid -ErrorAction SilentlyContinue) { throw 'Second API process is still running.' }
    'PASS: first launch without setup, README login, sole administrator, modified password and project preserved, desktop and API stop twice.'
} finally {
    [Environment]::CurrentDirectory = $originalDirectory
    if (-not $launcher.HasExited) {
        $desktop = Get-Desktop
        if ($desktop) { [void]$desktop.CloseMainWindow() }
        if (-not $launcher.WaitForExit(5000)) {
            # Terminate only the test launcher and descendants started from this isolated copy.
            & "$env:SystemRoot\System32\taskkill.exe" /PID $launcher.Id /T /F | Out-Null
        }
    }
}
