[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$UpdatesRoot,
    [string]$MinimumVersion,
    [ValidateSet("All", "NoVibeVoice")]
    [string]$Profile = "NoVibeVoice",
    [switch]$SkipWebBuild
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd('\')
if ((& git -C $root rev-parse --show-toplevel 2>$null).Replace('/', '\').TrimEnd('\') -ne $root) {
    throw 'Run from the Pro4Bro source checkout.'
}
$lockRoot = Join-Path $root '.scratch'
[IO.Directory]::CreateDirectory($lockRoot) | Out-Null
try { $releaseLock = [IO.File]::Open((Join-Path $lockRoot 'portable-release.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
catch { throw 'Another app update is being created. Wait for that build to finish.' }
$stage = $null
try {
$releasePath = Join-Path $root 'APP-VERSION.json'
$release = Get-Content -Raw -LiteralPath $releasePath | ConvertFrom-Json
if ($release.schemaVersion -ne 1 -or $release.channel -notin @('alpha', 'stable') -or
    [string]$release.version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
    ($release.channel -eq 'stable' -and [version]$release.version -lt [version]'1.0.0')) {
    throw 'APP-VERSION.json has an invalid release version/channel.'
}
if ($release.lastIssuedVersion -and [string]$release.lastIssuedVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    throw 'APP-VERSION.json has an invalid lastIssuedVersion.'
}
$baseline = [version]$release.version
$issued = if ($release.lastIssuedVersion) { [version]$release.lastIssuedVersion } else { $baseline }
if ($MinimumVersion) {
    if ($MinimumVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { throw 'Invalid installed MinimumVersion.' }
    if ([version]$MinimumVersion -gt $issued) { $issued = [version]$MinimumVersion }
}
$nextVersion = if ($baseline -gt $issued) { $baseline.ToString() } else { '{0}.{1}.{2}' -f $issued.Major, $issued.Minor, ($issued.Build + 1) }
$release.version = $nextVersion
if (-not $UpdatesRoot) { $UpdatesRoot = Join-Path $root '.scratch\portable-updates' }
elseif (-not [IO.Path]::IsPathRooted($UpdatesRoot)) { $UpdatesRoot = Join-Path $root $UpdatesRoot }
if (-not $OutputRoot) { $OutputRoot = Join-Path $UpdatesRoot ("App-{0}-{1}-{2}" -f $release.channel, $nextVersion, $Profile) }
elseif (-not [IO.Path]::IsPathRooted($OutputRoot)) { $OutputRoot = Join-Path $root $OutputRoot }
$output = [IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
if ($output -eq $root -or $root.StartsWith("$output\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputRoot cannot be the source root or a parent.'
}
if (Test-Path -LiteralPath $output) { throw "Update folder already exists: $output" }
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
$launchers = @('open-pro4bro-console.bat', 'VERIFY-PORTABLE.bat', 'INSTALL-OBS-PLUGIN.bat', 'UPDATE-PORTABLE.bat')
foreach ($name in $launchers) { $files += @{ source = $name; target = $name } }
$guide = if ($Profile -eq 'NoVibeVoice') { 'docs\PORTABLE-NO-VIBEVOICE.md' } else { 'docs\PORTABLE-QUICKSTART.md' }
$files += @{ source = $guide; target = 'PORTABLE-README.md' }
$trees += @{ source = 'scripts'; target = 'scripts'; names = $scriptNames }

$stage = Join-Path (Split-Path -Parent $output) ('.creating-{0}' -f [guid]::NewGuid().ToString('N'))
$payload = Join-Path $stage 'payload'
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
    releaseVersion = [string]$release.version
    releaseChannel = [string]$release.channel
    createdAt = [DateTimeOffset]::Now.ToString('o')
    sourceRevision = (& git -C $root rev-parse HEAD)
    sourceMachine = [Environment]::MachineName
    sourceWorkingTreeDirty = [bool](& git -C $root status --porcelain)
    runtimeManifestSha256 = (Get-FileHash -LiteralPath $runtimeManifest -Algorithm SHA256).Hash
    apiRequirementsSha256 = (Get-FileHash -LiteralPath (Join-Path $root 'services\api\requirements.txt') -Algorithm SHA256).Hash
    trees = @('services/api', 'apps/web/dist', '.runtime/omnivoice-studio/studio_app', 'obs-plugin-package', 'scripts')
    files = @($files | ForEach-Object { $_.target })
    entries = $entries
}
$manifest | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $stage 'app-update.json') -Encoding utf8
Set-Content -LiteralPath (Join-Path $stage 'VERSION.txt') -Value ("{0} {1}" -f $release.channel, $release.version) -Encoding utf8
[IO.File]::Copy((Join-Path $PSScriptRoot 'templates\APPLY-UPDATE.bat'), (Join-Path $stage 'APPLY-UPDATE.bat'))
@"
Pro4Bro app update: $($release.channel) $($release.version)

Copy this WHOLE numbered folder into the full portable's updates folder.
Keep its original name; do not rename it to app-current.
Click APPLY-UPDATE.bat here, or UPDATE-PORTABLE.bat beside open-pro4bro-console.bat.
The updater selects the highest compatible version inside updates.
Start/verify the app from the full portable folder after the update succeeds.
The full portable (about 36 GiB) is required; this small pack contains app files.
"@ | Set-Content -LiteralPath (Join-Path $stage 'README-UPDATE.txt') -Encoding utf8
$release | Add-Member -NotePropertyName lastIssuedVersion -NotePropertyValue $nextVersion -Force
$versionTemp = Join-Path $lockRoot ('app-version-{0}.tmp' -f [guid]::NewGuid().ToString('N'))
$versionBackup = "$versionTemp.previous"
try {
    [IO.File]::WriteAllText($versionTemp, (($release | ConvertTo-Json) + "`r`n"), [Text.UTF8Encoding]::new($false))
    [IO.File]::Replace($versionTemp, $releasePath, $versionBackup)
    try {
        Move-Item -LiteralPath $stage -Destination $output
        $stage = $null
    } catch {
        [IO.File]::Replace($versionBackup, $releasePath, $versionTemp)
        throw
    }
} finally {
    foreach ($temporary in @($versionTemp, $versionBackup)) {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}
Write-Output ([ordered]@{
    kind = $manifest.kind
    profile = $manifest.profile
    release = "{0} {1}" -f $release.channel, $release.version
    createdAt = $manifest.createdAt
    sourceRevision = $manifest.sourceRevision
    sourceWorkingTreeDirty = $manifest.sourceWorkingTreeDirty
    files = $entries.Count
    path = $output
} | ConvertTo-Json)
} finally {
    $releaseLock.Dispose()
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        $stageFull = [IO.Path]::GetFullPath($stage)
        $outputParent = [IO.Path]::GetFullPath((Split-Path -Parent $output)).TrimEnd('\')
        if ($stageFull.StartsWith("$outputParent\", [StringComparison]::OrdinalIgnoreCase) -and
            (Split-Path -Leaf $stageFull) -like '.creating-*') { Remove-Item -LiteralPath $stageFull -Recurse -Force }
    }
}
