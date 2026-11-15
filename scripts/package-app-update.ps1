param(
    [Parameter(Mandatory=$true)][string]$ApplicationRoot,
    [Parameter(Mandatory=$true)][string]$OutputZip
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem, System.IO.Compression
$app = (Resolve-Path -LiteralPath $ApplicationRoot).Path
$sections = @{
    'apps/api/dist' = 'apps/api/dist'
    'apps/desktop/out' = 'client/resources/app/out'
}
foreach ($entry in @('apps/api/dist/main.js', 'apps/desktop/out/renderer/index.html', 'apps/desktop/out/main/index.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $app $entry) -PathType Leaf)) { throw "Missing build: $entry" }
}
$zip = [IO.Compression.ZipFile]::Open([IO.Path]::GetFullPath($OutputZip), [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($section in $sections.GetEnumerator()) {
        $dir = (Resolve-Path -LiteralPath (Join-Path $app $section.Key)).Path
        foreach ($file in Get-ChildItem -LiteralPath $dir -Recurse -File) {
            $name = $section.Value + '/' + $file.FullName.Substring($dir.Length + 1).Replace('\','/')
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$name)
        }
    }
} finally { $zip.Dispose() }
