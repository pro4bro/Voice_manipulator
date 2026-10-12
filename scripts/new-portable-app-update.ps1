[CmdletBinding()]
param(
    [string]$OutputRoot,
    [ValidateSet("All", "NoVibeVoice")]
    [string]$Profile = "NoVibeVoice",
    [switch]$SkipWebBuild
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd('\')
if ((& git -C $root rev-parse --show-toplevel 2>$null).Replace('/', '\').TrimEnd('\') -ne $root) {
    throw "Run from the Pro4Bro source checkout."
}
if (-not $SkipWebBuild) {
    Push-Location (Join-Path $root 'apps\web')
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "Web build failed; no update was created." }
    } finally { Pop-Location }
}
$pluginDll = Join-Path $root 'build\obs-plugin\RelWithDebInfo\pro4bro-obs-bridge.dll'
$newestPluginSource = Get-ChildItem -LiteralPath (Join-Path $root 'plugins\obs-pro4bro-bridge\src') -Recurse -File |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if ($newestPluginSource -and $newestPluginSource.LastWriteTimeUtc -gt (Get-Item -LiteralPath $pluginDll).LastWriteTimeUtc) {
    throw 'OBS plugin source changed after its DLL build. Rebuild the plugin before creating an app update.'
}
$captureAudit = & (Join-Path $root 'scripts\test-portable-runtime.ps1') -Profile Capture -Json | ConvertFrom-Json
if (-not $captureAudit.portable -or $captureAudit.failed -ne 0) { throw "OBS plugin package gate failed: $(@($captureAudit.checks | Where-Object { $_.status -eq 'FAIL' } | ForEach-Object { $_.id + ': ' + $_.message }) -join '; ')" }
if (-not $OutputRoot) {
    $OutputRoot = Join-Path $root ('.scratch\portable-updates\App-{0}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
} elseif (-not [IO.Path]::IsPathRooted($OutputRoot)) {
    $OutputRoot = Join-Path $root $OutputRoot
}
$output = [IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
if ($output -eq $root -or $root.StartsWith("$output\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputRoot cannot be the source root or a parent.'
}
if (Test-Path -LiteralPath $output) { throw "Update folder already exists: $output" }

$trees = @(
    @{ source = 'services\api'; target = 'services/api' },
    @{ source = 'apps\web\dist'; target = 'apps/web/dist' },
    @{ source = 'services\stt_studio\studio_app'; target = '.runtime/omnivoice-studio/studio_app' },
    @{ source = 'build\obs-plugin-package'; target = 'obs-plugin-package' }
)
$files = @(
    @{ source = 'build\obs-plugin\RelWithDebInfo\pro4bro-obs-bridge.dll'; target = 'build/obs-plugin/RelWithDebInfo/pro4bro-obs-bridge.dll' },
    @{ source = 'plugins\obs-pro4bro-bridge\config.example.json'; target = 'plugins/obs-pro4bro-bridge/config.example.json' }
)
$scriptNames = @('pro4bro-console.ps1', 'pro4bro-process-tree.ps1', 'pro4bro-readiness.ps1', 'pro4bro-workloads.ps1', 'test-portable-runtime.ps1', 'install-obs-plugin.ps1', 'update-portable.ps1')
foreach ($name in $scriptNames) { $files += @{ source = "scripts\$name"; target = "scripts/$name" } }
$launchers = @('start-pro4bro.bat', 'open-pro4bro-console.bat', 'restart-pro4bro.bat', 'VERIFY-PORTABLE.bat', 'INSTALL-OBS-PLUGIN.bat', 'UPDATE-PORTABLE.bat')
foreach ($name in $launchers) { $files += @{ source = $name; target = $name } }
$guide = if ($Profile -eq 'NoVibeVoice') { 'docs\PORTABLE-NO-VIBEVOICE.md' } else { 'docs\PORTABLE-QUICKSTART.md' }
$files += @{ source = $guide; target = 'PORTABLE-README.md' }
$trees += @{ source = 'scripts'; target = 'scripts'; names = $scriptNames }

$payload = Join-Path $output 'payload'
[IO.Directory]::CreateDirectory($payload) | Out-Null
$entries = [Collections.Generic.List[object]]::new()
function Add-UpdateFile([string]$Source, [string]$Target) {
    $sourcePath = if ([IO.Path]::IsPathRooted($Source)) { $Source } else { Join-Path $root $Source }
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Missing app file: $Source" }
    if ((Get-Item -LiteralPath $sourcePath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "App source file is a link: $Source" }
    $targetPath = Join-Path $payload ($Target.Replace('/', '\'))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $targetPath)) | Out-Null
    [IO.File]::Copy($sourcePath, $targetPath, $false)
    $entry = Get-Item -LiteralPath $targetPath
    $entries.Add([ordered]@{ path = $Target; bytes = $entry.Length; sha256 = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash })
}
foreach ($tree in $trees | Where-Object { $_.target -ne 'scripts' }) {
    $sourcePath = Join-Path $root $tree.source
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) { throw "Missing app tree: $sourcePath" }
    foreach ($item in Get-ChildItem -LiteralPath $sourcePath -Recurse -File -Force) {
        $relative = $item.FullName.Substring($sourcePath.Length).TrimStart('\')
        if ($relative -match '(^|\\)(tests|__pycache__|\.pytest_cache)(\\|$)' -or $relative -match '\.pyc$') { continue }
        Add-UpdateFile $item.FullName ($tree.target + '/' + $relative.Replace('\', '/'))
    }
}
foreach ($item in $files) { Add-UpdateFile $item.source $item.target }
$runtimeManifest = Join-Path $root '.runtime\python\runtime-manifest.json'
if (-not (Test-Path -LiteralPath $runtimeManifest -PathType Leaf)) { throw 'Portable runtime manifest is missing.' }
$manifest = [ordered]@{
    schemaVersion = 1
    kind = 'Pro4BroAppUpdate'
    profile = $Profile
    createdAt = [DateTimeOffset]::Now.ToString('o')
    sourceRevision = (& git -C $root rev-parse HEAD)
    sourceWorkingTreeDirty = [bool](& git -C $root status --porcelain)
    runtimeManifestSha256 = (Get-FileHash -LiteralPath $runtimeManifest -Algorithm SHA256).Hash
    apiRequirementsSha256 = (Get-FileHash -LiteralPath (Join-Path $root 'services\api\requirements.txt') -Algorithm SHA256).Hash
    trees = @('services/api', 'apps/web/dist', '.runtime/omnivoice-studio/studio_app', 'obs-plugin-package', 'scripts')
    files = @($files | ForEach-Object { $_.target })
    entries = $entries
}
$manifest | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $output 'app-update.json') -Encoding utf8
Write-Output ([ordered]@{
    kind = $manifest.kind
    profile = $manifest.profile
    createdAt = $manifest.createdAt
    sourceRevision = $manifest.sourceRevision
    sourceWorkingTreeDirty = $manifest.sourceWorkingTreeDirty
    files = $entries.Count
    path = $output
} | ConvertTo-Json)
