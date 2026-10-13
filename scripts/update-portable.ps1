[CmdletBinding()]
param(
    [string]$BundleRoot,
    [string]$PackagePath,
    [switch]$ApplyOnly,
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
if (-not $BundleRoot) { $BundleRoot = Split-Path -Parent $PSScriptRoot }
$bundle = [IO.Path]::GetFullPath($BundleRoot).TrimEnd('\')
$bundleManifestPath = Join-Path $bundle '.portable-bundle.json'
if (-not (Test-Path -LiteralPath $bundleManifestPath -PathType Leaf)) {
    $clickedPack = Split-Path -Parent $bundle
    $updatesFolder = Split-Path -Parent $clickedPack
    $candidateBundle = Split-Path -Parent $updatesFolder
    if ((Split-Path -Leaf $bundle) -eq 'payload' -and
        (Test-Path -LiteralPath (Join-Path $clickedPack 'app-update.json') -PathType Leaf) -and
        (Split-Path -Leaf $updatesFolder) -eq 'updates' -and
        (Test-Path -LiteralPath (Join-Path $candidateBundle '.portable-bundle.json') -PathType Leaf)) {
        $bundle = $candidateBundle
        $bundleManifestPath = Join-Path $bundle '.portable-bundle.json'
        $ApplyOnly = $true
    } else {
        throw "Copy the complete portable folder first, then put the whole numbered update folder inside its updates folder. Run UPDATE-PORTABLE.bat beside open-pro4bro-console.bat, or APPLY-UPDATE.bat in the update pack. No portable manifest was found for: $bundle"
    }
}
$oldManifestBytes = [IO.File]::ReadAllBytes($bundleManifestPath)
$oldManifestText = Get-Content -Raw -LiteralPath $bundleManifestPath
$bundleManifest = $oldManifestText | ConvertFrom-Json
if ($bundleManifest.schemaVersion -ne 1 -or $bundleManifest.profile -notin @('All', 'NoVibeVoice')) {
    throw 'Unsupported portable bundle manifest/profile.'
}

function Assert-BundleChild([string]$Relative) {
    $path = [IO.Path]::GetFullPath((Join-Path $bundle ($Relative.Replace('/', '\'))))
    if (-not $path.StartsWith("$bundle\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe portable path: $Relative"
    }
    return $path
}

function Find-LatestUpdate {
    $updatesRoot = Assert-BundleChild 'updates'
    $candidates = @(foreach ($directory in Get-ChildItem -LiteralPath $updatesRoot -Directory -ErrorAction SilentlyContinue) {
        if ($directory.Name -like '.creating-*') { continue }
        $manifestPath = Join-Path $directory.FullName 'app-update.json'
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { continue }
        try { $candidate = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json }
        catch { throw "Update manifest could not be read: $manifestPath" }
        if ($candidate.schemaVersion -ne 1 -or $candidate.kind -ne 'Pro4BroAppUpdate' -or
            $candidate.profile -ne $bundleManifest.profile) { continue }
        if (-not $candidate.releaseVersion) { continue } # Earlier, unversioned packs.
        if ([string]$candidate.releaseVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
            $candidate.releaseChannel -notin @('alpha', 'stable')) { throw "Invalid update release: $manifestPath" }
        [pscustomobject]@{ path = $directory.FullName; version = [version]$candidate.releaseVersion; channelRank = [int]($candidate.releaseChannel -eq 'stable'); manifest = $candidate }
    })
    $ranked = @($candidates | Sort-Object -Property @{ Expression = 'version'; Descending = $true }, @{ Expression = 'channelRank'; Descending = $true }, path)
    if (-not $ranked.Count) { return $null }
    $latest = $ranked[0]
    $sameRelease = @($ranked | Where-Object { $_.version -eq $latest.version -and $_.channelRank -eq $latest.channelRank })
    $latestHashes = @($latest.manifest.entries | ForEach-Object { '{0}|{1}' -f $_.path, $_.sha256 } | Sort-Object) -join "`n"
    foreach ($candidate in $sameRelease) {
        $hashes = @($candidate.manifest.entries | ForEach-Object { '{0}|{1}' -f $_.path, $_.sha256 } | Sort-Object) -join "`n"
        if ($hashes -cne $latestHashes) { throw "Different update packs share release $($latest.version). Create a fresh numbered pack from source." }
    }
    return $latest.path
}

$createdFromSource = $false
if (-not $PackagePath) {
    $PackagePath = Find-LatestUpdate
    $latestVersion = if ($PackagePath) {
        $latestManifest = Get-Content -Raw -LiteralPath (Join-Path $PackagePath 'app-update.json') | ConvertFrom-Json
        [version]$latestManifest.releaseVersion
    } else { $null }
    $hasNewerPack = $latestVersion -and (-not $bundleManifest.releaseVersion -or $latestVersion -gt [version]$bundleManifest.releaseVersion)
    # A copied source tree on another machine must not replace a received pack.
    $canCreate = -not $ApplyOnly -and -not $hasNewerPack -and
        $bundleManifest.sourceMachine -eq [Environment]::MachineName
    $cursor = Split-Path -Parent $bundle
    while ($canCreate -and $cursor) {
        $creator = Join-Path $cursor 'scripts\new-portable-app-update.ps1'
        if ((Test-Path -LiteralPath $creator -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $cursor 'apps\web\package.json') -PathType Leaf)) {
            & $creator -UpdatesRoot (Assert-BundleChild 'updates') -MinimumVersion $bundleManifest.releaseVersion -Profile $bundleManifest.profile | Out-Host
            $PackagePath = Find-LatestUpdate
            $createdFromSource = $true
            break
        }
        $parent = Split-Path -Parent $cursor
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    if (-not $PackagePath) { throw 'No numbered app update found. Copy the whole update folder into the portable updates folder, then click UPDATE-PORTABLE.bat.' }
}
if (-not [IO.Path]::IsPathRooted($PackagePath)) { $PackagePath = Join-Path $bundle $PackagePath }
$package = [IO.Path]::GetFullPath($PackagePath).TrimEnd('\')
$updateManifestPath = Join-Path $package 'app-update.json'
if (-not (Test-Path -LiteralPath $updateManifestPath -PathType Leaf)) {
    throw "No app update found at $package. Copy the whole numbered update folder into updates, then click UPDATE-PORTABLE.bat."
}
$update = Get-Content -Raw -LiteralPath $updateManifestPath | ConvertFrom-Json
if ($update.schemaVersion -ne 1 -or $update.kind -ne 'Pro4BroAppUpdate' -or
    $update.profile -ne $bundleManifest.profile) { throw 'App update profile or schema does not match this bundle.' }
Write-Host ("Selected update: {0} {1}" -f $update.releaseChannel, $update.releaseVersion)
Write-Host "Portable folder: $bundle"
Write-Host "Update folder: $package"
if ([string]$update.releaseVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
    $update.releaseChannel -notin @('alpha', 'stable') -or
    ($update.releaseChannel -eq 'stable' -and [version]$update.releaseVersion -lt [version]'1.0.0')) {
    throw 'App update has no valid release version/channel. Create a new versioned update pack.'
}
if ($bundleManifest.releaseVersion) {
    if ([string]$bundleManifest.releaseVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
        $bundleManifest.releaseChannel -notin @('alpha', 'stable')) {
        throw 'Installed portable has an invalid release version/channel.'
    }
    $versionOrder = ([version]$update.releaseVersion).CompareTo([version]$bundleManifest.releaseVersion)
    if ($versionOrder -lt 0 -or ($versionOrder -eq 0 -and $bundleManifest.releaseChannel -eq 'stable' -and $update.releaseChannel -ne 'stable')) {
        throw "Cannot install $($update.releaseChannel) $($update.releaseVersion) over $($bundleManifest.releaseChannel) $($bundleManifest.releaseVersion)."
    }
}
$runtimeManifest = Assert-BundleChild '.runtime/python/runtime-manifest.json'
if ((Get-FileHash -LiteralPath $runtimeManifest -Algorithm SHA256).Hash -ne $update.runtimeManifestSha256) {
    throw 'Python runtime dependencies changed. Rebuild the portable runtime before applying this app update.'
}
$apiRequirements = Assert-BundleChild 'services/api/requirements.txt'
if ((Get-FileHash -LiteralPath $apiRequirements -Algorithm SHA256).Hash -ne $update.apiRequirementsSha256) {
    throw 'API Python requirements changed. Rebuild the portable runtime before applying this app update.'
}

$allowedTrees = @('services/api', 'apps/web/dist', '.runtime/omnivoice-studio/studio_app', 'obs-plugin-package', 'scripts')
$allowedFiles = @(
    'build/obs-plugin/RelWithDebInfo/pro4bro-obs-bridge.dll',
    'plugins/obs-pro4bro-bridge/config.example.json',
    'open-pro4bro-console.bat', 'VERIFY-PORTABLE.bat', 'INSTALL-OBS-PLUGIN.bat',
    'UPDATE-PORTABLE.bat', 'PORTABLE-README.md'
)
$legacyLauncherFiles = @('start-pro4bro.bat', 'restart-pro4bro.bat')
$allowedScripts = @('pro4bro-console.ps1', 'pro4bro-process-tree.ps1', 'pro4bro-readiness.ps1', 'pro4bro-workloads.ps1', 'test-portable-runtime.ps1', 'install-obs-plugin.ps1', 'update-portable.ps1')
if ((@($update.trees) -join '|') -ne ($allowedTrees -join '|')) { throw 'App update has an unexpected tree list.' }
$listedFiles = @($update.files | Where-Object { $_ -notlike 'scripts/*' })
if ((@($listedFiles | Sort-Object) -join '|') -ne (@($allowedFiles | Sort-Object) -join '|') -and
    (@($listedFiles | Sort-Object) -join '|') -ne (@(($allowedFiles + $legacyLauncherFiles) | Sort-Object) -join '|')) {
    throw 'App update has an unexpected file list.'
}
$listedScripts = @($update.files | Where-Object { $_ -like 'scripts/*' } | ForEach-Object { $_.Substring(8) })
if ((@($listedScripts | Sort-Object) -join '|') -ne (@($allowedScripts | Sort-Object) -join '|')) {
    throw 'App update has an unexpected script list.'
}
$entries = @($update.entries)
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($entry in $entries) {
    $relative = [string]$entry.path
    if (-not $relative -or $relative.Contains('\') -or $relative.Contains(':') -or
        $relative.StartsWith('/') -or $relative.Contains('//') -or
        @($relative.Split('/') | Where-Object { $_ -in @('.', '..') }).Count) {
        throw "Unsafe update path: $relative"
    }
    if (-not $seen.Add($relative)) { throw "Duplicate update path: $relative" }
    $insideTree = @($allowedTrees | Where-Object { $relative.StartsWith("$_/", [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
    if (-not $insideTree -and $relative -notin ($allowedFiles + $legacyLauncherFiles)) { throw "Update path is outside the app layer: $relative" }
    if ($relative.StartsWith('scripts/', [StringComparison]::OrdinalIgnoreCase) -and $relative.Substring(8) -notin $allowedScripts) {
        throw "Unknown updater script: $relative"
    }
    $payloadPath = [IO.Path]::GetFullPath((Join-Path $package ("payload\" + $relative.Replace('/', '\'))))
    if (-not $payloadPath.StartsWith("$package\payload\", [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $payloadPath -PathType Leaf)) { throw "Unsafe or missing update file: $relative" }
    $item = Get-Item -LiteralPath $payloadPath
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -ne [long]$entry.bytes -or
        (Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash -ne $entry.sha256) {
        throw "Update file failed hash/size check: $relative"
    }
}
foreach ($tree in $allowedTrees) {
    if (-not @($entries | Where-Object { ([string]$_.path).StartsWith("$tree/", [StringComparison]::OrdinalIgnoreCase) }).Count) {
        throw "App update tree is empty: $tree"
    }
}
foreach ($file in $allowedFiles) { if (-not $seen.Contains($file)) { throw "Update file is missing: $file" } }
$removedLauncherFiles = [Collections.Generic.List[string]]::new()
$installedAppLayerPath = Assert-BundleChild '.portable-app-layer.json'
if (Test-Path -LiteralPath $installedAppLayerPath -PathType Leaf) {
    $installedAppLayerForCleanup = Get-Content -Raw -LiteralPath $installedAppLayerPath | ConvertFrom-Json
    foreach ($legacyFile in $legacyLauncherFiles) {
        $legacyPath = Assert-BundleChild $legacyFile
        if (-not (Test-Path -LiteralPath $legacyPath -PathType Leaf)) { continue }
        $ownedEntry = @($installedAppLayerForCleanup.entries | Where-Object { $_.path -eq $legacyFile }) | Select-Object -First 1
        if (-not $ownedEntry) { continue }
        $legacyItem = Get-Item -LiteralPath $legacyPath
        if (($legacyItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            $legacyItem.Length -ne [long]$ownedEntry.bytes -or
            (Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash -cne [string]$ownedEntry.sha256) {
            continue
        }
        $removedLauncherFiles.Add($legacyFile)
    }
}
if ($bundleManifest.releaseVersion -and [version]$update.releaseVersion -eq [version]$bundleManifest.releaseVersion -and
    $update.releaseChannel -eq $bundleManifest.releaseChannel) {
    $installedAppLayerPath = Assert-BundleChild '.portable-app-layer.json'
    if (-not (Test-Path -LiteralPath $installedAppLayerPath -PathType Leaf)) { throw 'Installed app layer manifest is missing.' }
    $installedAppLayer = Get-Content -Raw -LiteralPath $installedAppLayerPath | ConvertFrom-Json
    $installedHashes = @($installedAppLayer.entries | ForEach-Object { '{0}|{1}' -f $_.path, $_.sha256 } | Sort-Object)
    $incomingHashes = @($entries | ForEach-Object { '{0}|{1}' -f $_.path, $_.sha256 } | Sort-Object)
    if (($installedHashes -join "`n") -cne ($incomingHashes -join "`n")) {
        throw "Different app files use $($update.releaseChannel) $($update.releaseVersion). Create a fresh numbered update from source."
    }
}

$ports = @(18081, 18120)
$listeners = @(Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue)
$ownedListeners = 0
$foreignListeners = 0
foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    if ($process -and ([string]$process.ExecutablePath).StartsWith("$bundle\.runtime\python\", [StringComparison]::OrdinalIgnoreCase)) { $ownedListeners++ }
    else { $foreignListeners++ }
}
if ($ownedListeners -and $foreignListeners) { throw 'Portable services are sharing ports with another program; stop them before updating.' }
$wasRunning = $ownedListeners -gt 0

$work = Assert-BundleChild ('.portable-update-work/{0}' -f [guid]::NewGuid().ToString('N'))
$stage = Join-Path $work 'stage'
$backup = Join-Path $work 'backup'
[IO.Directory]::CreateDirectory($stage) | Out-Null
[IO.Directory]::CreateDirectory($backup) | Out-Null
$moves = [Collections.Generic.List[object]]::new()
$modelLayerPath = Assert-BundleChild '.portable-model-layer.json'
$appLayerPath = Assert-BundleChild '.portable-app-layer.json'
$oldModelLayerBytes = if (Test-Path -LiteralPath $modelLayerPath) { [IO.File]::ReadAllBytes($modelLayerPath) } else { $null }
$oldAppLayerBytes = if (Test-Path -LiteralPath $appLayerPath) { [IO.File]::ReadAllBytes($appLayerPath) } else { $null }
$oldModelLayer = if (Test-Path -LiteralPath $modelLayerPath) { Get-Content -Raw -LiteralPath $modelLayerPath } else { $null }
$oldAppLayer = if (Test-Path -LiteralPath $appLayerPath) { Get-Content -Raw -LiteralPath $appLayerPath } else { $null }
$result = $null
function Measure-Target([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return @{ files = 0L; bytes = 0L } }
    $item = Get-Item -LiteralPath $Path
    $files = if ($item.PSIsContainer) { @(Get-ChildItem -LiteralPath $Path -Recurse -File -Force) } else { @($item) }
    $sum = ($files | Measure-Object Length -Sum).Sum
    return @{ files = [long]$files.Count; bytes = [long]$sum }
}
try {
    foreach ($entry in $entries) {
        $relative = [string]$entry.path
        $source = Join-Path $package ("payload\" + $relative.Replace('/', '\'))
        $dest = Join-Path $stage ($relative.Replace('/', '\'))
        [IO.Directory]::CreateDirectory((Split-Path -Parent $dest)) | Out-Null
        [IO.File]::Copy($source, $dest, $false)
        if ((Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Staged file changed: $relative" }
    }
    if ($wasRunning) {
        $stopped = & (Assert-BundleChild 'scripts/pro4bro-workloads.ps1') -Action stop -SkipWebBuild | Select-Object -Last 1 | ConvertFrom-Json
        if ($stopped.overall -ne 'stopped') { throw 'Could not stop the running portable services.' }
    }
    $targets = @($allowedTrees) + @($allowedFiles) + @($removedLauncherFiles)
    $oldCount = 0L; $oldBytes = 0L
    foreach ($relative in $targets) {
        $destination = Assert-BundleChild $relative
        if ((Test-Path -LiteralPath $destination) -and ((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "App target is a link and cannot be replaced safely: $relative"
        }
        $stagedPath = Join-Path $stage ($relative.Replace('/', '\'))
        $backupPath = Join-Path $backup ($relative.Replace('/', '\'))
        $oldSize = Measure-Target $destination
        $oldCount += $oldSize.files; $oldBytes += $oldSize.bytes
        [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
        [IO.Directory]::CreateDirectory((Split-Path -Parent $backupPath)) | Out-Null
        $hadOld = Test-Path -LiteralPath $destination
        if ($hadOld) { Move-Item -LiteralPath $destination -Destination $backupPath }
        $moves.Add(@{ target = $destination; backup = $backupPath; hadOld = $hadOld })
        if ($relative -notin $removedLauncherFiles) {
            Move-Item -LiteralPath $stagedPath -Destination $destination
        }
    }
    $newCount = 0L; $newBytes = 0L
    foreach ($relative in $targets) {
        $size = Measure-Target (Assert-BundleChild $relative)
        $newCount += $size.files; $newBytes += $size.bytes
    }
    $bundleManifest.files = [long]$bundleManifest.files - $oldCount + $newCount
    $bundleManifest.bytes = [long]$bundleManifest.bytes - $oldBytes + $newBytes
    foreach ($tree in $allowedTrees) {
        $size = Measure-Target (Assert-BundleChild $tree)
        $component = @($bundleManifest.components | Where-Object { $_.path -eq $tree }) | Select-Object -First 1
        if ($component) { $component.files = $size.files; $component.bytes = $size.bytes }
        else { $bundleManifest.components += [pscustomobject]@{ path = $tree; files = $size.files; bytes = $size.bytes } }
    }
    if ($removedLauncherFiles.Count) {
        $bundleManifest.criticalFiles = @($bundleManifest.criticalFiles | Where-Object { $_.path -notin $removedLauncherFiles })
    }
    foreach ($critical in @($bundleManifest.criticalFiles)) {
        $path = Assert-BundleChild ([string]$critical.path)
        if (Test-Path -LiteralPath $path -PathType Leaf) { $critical.sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
    }
    foreach ($relative in @('UPDATE-PORTABLE.bat', 'scripts/update-portable.ps1')) {
        if (-not @($bundleManifest.criticalFiles | Where-Object { $_.path -eq $relative }).Count) {
            $bundleManifest.criticalFiles += [pscustomobject]@{ path = $relative; sha256 = (Get-FileHash -LiteralPath (Assert-BundleChild $relative) -Algorithm SHA256).Hash }
        }
    }
    $bundleManifest.sourceRevision = $update.sourceRevision
    $bundleManifest.sourceWorkingTreeDirty = $update.sourceWorkingTreeDirty
    $bundleManifest | Add-Member -NotePropertyName releaseVersion -NotePropertyValue ([string]$update.releaseVersion) -Force
    $bundleManifest | Add-Member -NotePropertyName releaseChannel -NotePropertyValue ([string]$update.releaseChannel) -Force
    if ($update.sourceMachine) { $bundleManifest | Add-Member -NotePropertyName sourceMachine -NotePropertyValue ([string]$update.sourceMachine) -Force }
    $bundleManifest | Add-Member -NotePropertyName updatedAt -NotePropertyValue ([DateTimeOffset]::Now.ToString('o')) -Force
    $bundleManifest | Add-Member -NotePropertyName appUpdateCount -NotePropertyValue ([int]$bundleManifest.appUpdateCount + 1) -Force
    $bundleManifest | Add-Member -NotePropertyName layers -NotePropertyValue ([ordered]@{ app = '.portable-app-layer.json'; baseRuntimeAndModels = '.portable-model-layer.json' }) -Force
    $bundleManifest | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath $bundleManifestPath -Encoding utf8
    $installedEntries = @($entries | Where-Object { $_.path -notin $removedLauncherFiles })
    [ordered]@{ schemaVersion = 1; kind = 'app'; releaseVersion = [string]$update.releaseVersion; releaseChannel = [string]$update.releaseChannel; sourceRevision = $update.sourceRevision; sourceWorkingTreeDirty = $update.sourceWorkingTreeDirty; updatedAt = $bundleManifest.updatedAt; entries = $installedEntries } |
        ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $appLayerPath -Encoding utf8
    $appOwnedComponents = @($targets) + @($allowedScripts | ForEach-Object { "scripts/$_" })
    $baseComponents = @($bundleManifest.components | Where-Object { $_.path -notin $appOwnedComponents })
    $modelLayerCreatedAt = if ($oldModelLayer) { ($oldModelLayer | ConvertFrom-Json).createdAt } else { [DateTimeOffset]::Now.ToString('o') }
    [ordered]@{ schemaVersion = 1; kind = 'base-runtime-and-models'; profile = $bundleManifest.profile; components = $baseComponents; omnivoiceModelRevision = $bundleManifest.omnivoiceModelRevision; createdAt = $modelLayerCreatedAt } |
        ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $modelLayerPath -Encoding utf8
    $auditJson = & (Assert-BundleChild 'scripts/test-portable-runtime.ps1') -Profile Auto -Json
    $audit = $auditJson | ConvertFrom-Json
    if (-not $audit.portable -or $audit.failed -ne 0) { throw 'Portable verification failed after app update.' }
    $result = [ordered]@{ updated = $true; profile = $bundleManifest.profile; release = ("{0} {1}" -f $update.releaseChannel, $update.releaseVersion); sourceRevision = $update.sourceRevision; sourceWorkingTreeDirty = $update.sourceWorkingTreeDirty; createdFromSource = $createdFromSource; appFiles = $entries.Count; modelLayerChanged = $false; gatePassed = $audit.passed; gateFailed = $audit.failed; transferPack = $package }
} catch {
    $failure = $_
    if ($moves.Count -gt 0) {
        for ($i = $moves.Count - 1; $i -ge 0; $i--) {
            $move = $moves[$i]
            if (Test-Path -LiteralPath $move.target) { Remove-Item -LiteralPath $move.target -Recurse -Force }
            if ($move.hadOld -and (Test-Path -LiteralPath $move.backup)) { Move-Item -LiteralPath $move.backup -Destination $move.target }
        }
    }
    [IO.File]::WriteAllBytes($bundleManifestPath, $oldManifestBytes)
    if ($null -ne $oldAppLayerBytes) { [IO.File]::WriteAllBytes($appLayerPath, $oldAppLayerBytes) }
    elseif (Test-Path -LiteralPath $appLayerPath) { Remove-Item -LiteralPath $appLayerPath -Force }
    if ($null -ne $oldModelLayerBytes) { [IO.File]::WriteAllBytes($modelLayerPath, $oldModelLayerBytes) }
    elseif (Test-Path -LiteralPath $modelLayerPath) { Remove-Item -LiteralPath $modelLayerPath -Force }
    if ($wasRunning -and -not $NoRestart) {
        try { & (Assert-BundleChild 'scripts/pro4bro-workloads.ps1') -Action start -SkipWebBuild | Out-Host } catch { }
    }
    throw $failure
} finally {
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
if ($wasRunning -and -not $NoRestart) {
    & (Assert-BundleChild 'scripts/pro4bro-workloads.ps1') -Action start -SkipWebBuild | Out-Host
}
Write-Output ($result | ConvertTo-Json)
