[CmdletBinding()]
param(
    [string]$OutputRoot,
    [ValidateSet("HardLink", "Copy")]
    [string]$Mode = "HardLink",
    [ValidateSet("All", "NoVibeVoice")]
    [string]$Profile = "All"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd("\")
$release = Get-Content -Raw -LiteralPath (Join-Path $root 'APP-VERSION.json') | ConvertFrom-Json
if ($release.schemaVersion -ne 1 -or $release.channel -notin @('alpha', 'stable') -or
    [string]$release.version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
    ($release.channel -eq 'stable' -and [version]$release.version -lt [version]'1.0.0')) {
    throw 'APP-VERSION.json has an invalid release version/channel.'
}
$releaseName = "Pro4Bro-Portable-{0}{1}" -f (Get-Date -Format "yyyyMMdd"), $(if ($Profile -eq "NoVibeVoice") { "-NoVibeVoice" } else { "" })
if (-not $OutputRoot) {
    $OutputRoot = Join-Path $root ".scratch\portable-release\$releaseName"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputRoot)) {
    $OutputRoot = Join-Path $root $OutputRoot
}
$destination = [System.IO.Path]::GetFullPath($OutputRoot).TrimEnd("\")
if ($destination -eq $root -or $root.StartsWith("$destination\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputRoot cannot be the repository root or one of its parents."
}
if (Test-Path -LiteralPath $destination) {
    throw "OutputRoot already exists. Choose a new empty destination: $destination"
}

$sourceAudit = & (Join-Path $root "scripts\test-portable-runtime.ps1") -Profile $Profile -Json | ConvertFrom-Json
if (-not $sourceAudit.portable -or $sourceAudit.failed -ne 0) { throw "Source tree failed the portable gate." }

$components = [System.Collections.Generic.List[object]]::new()
$fileCount = 0L
$byteCount = 0L

if (-not ("Pro4Bro.NativeFile" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace Pro4Bro {
    public static class NativeFile {
        [DllImport("Kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CreateHardLink(string newFileName, string existingFileName, IntPtr securityAttributes);
    }
}
"@
}

function ConvertTo-ExtendedPath([string]$Path) {
    if ($Path.StartsWith("\\?\")) { return $Path }
    if ($Path.StartsWith("\\")) { return "\\?\UNC\" + $Path.Substring(2) }
    return "\\?\$Path"
}

function Test-ExcludedRelativePath([string]$RelativePath, [string[]]$Patterns) {
    $normalized = $RelativePath.Replace('/', '\')
    foreach ($pattern in $Patterns) {
        if ($normalized -like $pattern) { return $true }
    }
    return $false
}

function Add-BundleFile([string]$Source, [string]$RelativeDestination) {
    $target = Join-Path $destination $RelativeDestination
    [System.IO.Directory]::CreateDirectory((ConvertTo-ExtendedPath (Split-Path -Parent $target))) | Out-Null
    if ($Mode -eq "HardLink") {
        if ([System.IO.Path]::GetPathRoot($Source) -ne [System.IO.Path]::GetPathRoot($target)) {
            throw "HardLink mode requires source and destination on the same volume. Use -Mode Copy for another drive."
        }
        $linked = [Pro4Bro.NativeFile]::CreateHardLink(
            (ConvertTo-ExtendedPath $target),
            (ConvertTo-ExtendedPath $Source),
            [IntPtr]::Zero
        )
        if (-not $linked) {
            $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "Hardlink failed (Win32 $code). Source: $Source Target: $target"
        }
    } else {
        [System.IO.File]::Copy((ConvertTo-ExtendedPath $Source), (ConvertTo-ExtendedPath $target), $false)
    }
    $item = Get-Item -LiteralPath $Source
    $script:fileCount++
    $script:byteCount += $item.Length
}

function Add-BundleTree {
    param([string]$SourceRelative, [string]$DestinationRelative = $SourceRelative, [string[]]$Exclude = @())
    $source = Join-Path $root $SourceRelative
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Required bundle tree is missing: $source"
    }
    $beforeFiles = $script:fileCount
    $beforeBytes = $script:byteCount
    foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -File -Force) {
        $relative = $file.FullName.Substring($source.Length).TrimStart('\')
        if (Test-ExcludedRelativePath $relative $Exclude) { continue }
        Add-BundleFile $file.FullName (Join-Path $DestinationRelative $relative)
    }
    $components.Add([ordered]@{
        path = $DestinationRelative.Replace('\', '/')
        files = $script:fileCount - $beforeFiles
        bytes = $script:byteCount - $beforeBytes
    })
}

function Add-SingleFile([string]$RelativePath, [string]$DestinationRelative = $RelativePath) {
    $source = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required bundle file is missing: $source" }
    Add-BundleFile $source $DestinationRelative
}

New-Item -ItemType Directory -Path $destination | Out-Null
Set-Content -LiteralPath (Join-Path $destination ".bundle-incomplete") -Value "Bundle creation is in progress." -Encoding utf8

Add-BundleTree ".runtime\python\core"
Add-BundleTree ".runtime\python\stt"
Add-BundleTree ".runtime\python\omnivoice-training"
if ($Profile -eq "All") { Add-BundleTree ".runtime\python\vibevoice-training" }
Add-BundleTree ".runtime\python\rvc"
Add-BundleTree ".runtime\python\voice-changer"
Add-SingleFile ".runtime\python\runtime-manifest.json"
if ($Profile -eq "All") {
    Add-BundleTree ".runtime\engines" ".runtime\engines" @("research\Applio\logs\*", "research\Applio\*\__pycache__\*")
} else {
    Add-BundleTree ".runtime\engines\research" ".runtime\engines\research" @("Applio\logs\*", "Applio\*\__pycache__\*")
}
Add-BundleTree ".runtime\omnivoice-studio\models"
Add-BundleTree ".runtime\omnivoice-studio\studio_app" ".runtime\omnivoice-studio\studio_app" @("__pycache__\*")
Add-BundleTree ".runtime\omnivoice-studio\nltk_data"
Add-BundleTree ".cache\huggingface"
Add-BundleTree ".cache\torch"
Add-BundleTree ".tools\ffmpeg"
Add-BundleTree "engines\OmniVoice" "engines\OmniVoice" @(".git", ".git\*", "**\.git", "**\.git\*", "**\__pycache__\*", ".venv\*")
Add-BundleTree "services\api" "services\api" @("tests\*", "**\__pycache__\*", ".pytest_cache\*")
Add-BundleTree "apps\web\dist"
& (Join-Path $PSScriptRoot 'package-obs-plugin.ps1') | Out-Null
Add-BundleTree "build\obs-plugin-package" "obs-plugin-package"
Add-SingleFile "build\obs-plugin\RelWithDebInfo\pro4bro-obs-bridge.dll"
Add-SingleFile "plugins\obs-pro4bro-bridge\config.example.json"
foreach ($scriptName in @("pro4bro-console.ps1", "pro4bro-process-tree.ps1", "pro4bro-readiness.ps1", "pro4bro-workloads.ps1", "test-portable-runtime.ps1", "install-obs-plugin.ps1", "update-portable.ps1")) {
    Add-SingleFile "scripts\$scriptName"
}
foreach ($entrypoint in @("start-pro4bro.bat", "open-pro4bro-console.bat", "restart-pro4bro.bat", "VERIFY-PORTABLE.bat", "INSTALL-OBS-PLUGIN.bat", "UPDATE-PORTABLE.bat")) {
    Add-SingleFile $entrypoint
}
if ($Profile -eq "NoVibeVoice") {
    Add-SingleFile "docs\PORTABLE-NO-VIBEVOICE.md" "PORTABLE-README.md"
} else {
    Add-SingleFile "docs\PORTABLE-QUICKSTART.md" "PORTABLE-README.md"
}
New-Item -ItemType Directory -Force -Path (Join-Path $destination "data") | Out-Null

$criticalFiles = @(
    "start-pro4bro.bat",
    "scripts/pro4bro-workloads.ps1",
    "scripts/pro4bro-readiness.ps1",
    "scripts/test-portable-runtime.ps1",
    "scripts/update-portable.ps1",
    "UPDATE-PORTABLE.bat",
    "scripts/install-obs-plugin.ps1",
    "build/obs-plugin/RelWithDebInfo/pro4bro-obs-bridge.dll",
    "obs-plugin-package/manifest.json",
    "obs-plugin-package/bin/64bit/pro4bro-obs-bridge.dll",
    "obs-plugin-package/data/locale/en-US.ini",
    "obs-plugin-package/data/brand/pro4bro-livelink.svg",
    ".runtime/python/runtime-manifest.json"
)
if ($Profile -eq "NoVibeVoice") {
    $modelRef = Join-Path $destination ".cache\huggingface\hub\models--k2-fsa--OmniVoice\refs\main"
    $modelRevision = (Get-Content -Raw -LiteralPath $modelRef).Trim()
    $criticalFiles += ".cache/huggingface/hub/models--k2-fsa--OmniVoice/snapshots/$modelRevision/model.safetensors"
}
$criticalHashes = foreach ($relative in $criticalFiles) {
    $path = Join-Path $destination $relative
    [ordered]@{ path = $relative; sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
}
$gitCommit = (& git -C $root rev-parse HEAD 2>$null)
$gitDirty = [bool](& git -C $root status --porcelain 2>$null)
$manifest = [ordered]@{
    schemaVersion = 1
    product = "Pro4Bro Voice Manipulator"
    releaseVersion = [string]$release.version
    releaseChannel = [string]$release.channel
    bundleName = Split-Path -Leaf $destination
    createdAt = [DateTimeOffset]::Now.ToString("o")
    creationMode = $Mode
    profile = $Profile
    omnivoiceModelRevision = $(if ($Profile -eq "NoVibeVoice") { $modelRevision } else { $null })
    sourceRevision = $gitCommit
    sourceMachine = [Environment]::MachineName
    sourceWorkingTreeDirty = $gitDirty
    files = $fileCount
    bytes = $byteCount
    components = $components
    criticalFiles = $criticalHashes
    layers = [ordered]@{ app = '.portable-app-layer.json'; baseRuntimeAndModels = '.portable-model-layer.json' }
    excluded = @("Git metadata", "developer virtual environments", "Node modules", "build caches", "logs", "tests", "user projects and recordings") + $(if ($Profile -eq "NoVibeVoice") { @("VibeVoice source, runtime and weights") } else { @() })
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $destination ".portable-bundle.json") -Encoding utf8
$appTrees = @('services/api', 'apps/web/dist', '.runtime/omnivoice-studio/studio_app', 'obs-plugin-package', 'scripts')
$appFiles = @('build/obs-plugin/RelWithDebInfo/pro4bro-obs-bridge.dll', 'plugins/obs-pro4bro-bridge/config.example.json', 'start-pro4bro.bat', 'open-pro4bro-console.bat', 'restart-pro4bro.bat', 'VERIFY-PORTABLE.bat', 'INSTALL-OBS-PLUGIN.bat', 'UPDATE-PORTABLE.bat', 'PORTABLE-README.md')
$appEntries = foreach ($relative in $appTrees + $appFiles) {
    $path = Join-Path $destination ($relative.Replace('/', '\'))
    $paths = if (Test-Path -LiteralPath $path -PathType Container) { @(Get-ChildItem -LiteralPath $path -Recurse -File -Force) } else { @(Get-Item -LiteralPath $path) }
    foreach ($item in $paths) {
        [ordered]@{ path = $item.FullName.Substring($destination.Length).TrimStart('\').Replace('\', '/'); bytes = $item.Length; sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash }
    }
}
[ordered]@{ schemaVersion = 1; kind = 'app'; releaseVersion = [string]$release.version; releaseChannel = [string]$release.channel; sourceRevision = $gitCommit; sourceWorkingTreeDirty = $gitDirty; updatedAt = $manifest.createdAt; entries = @($appEntries) } |
    ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $destination '.portable-app-layer.json') -Encoding utf8
$appOwnedComponents = @($appTrees) + @($appFiles) + @('scripts/pro4bro-console.ps1', 'scripts/pro4bro-process-tree.ps1', 'scripts/pro4bro-readiness.ps1', 'scripts/pro4bro-workloads.ps1', 'scripts/test-portable-runtime.ps1', 'scripts/install-obs-plugin.ps1', 'scripts/update-portable.ps1')
[ordered]@{ schemaVersion = 1; kind = 'base-runtime-and-models'; profile = $Profile; components = @($components | Where-Object { $_.path -notin $appOwnedComponents }); omnivoiceModelRevision = $manifest.omnivoiceModelRevision; createdAt = $manifest.createdAt } |
    ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $destination '.portable-model-layer.json') -Encoding utf8
Remove-Item -LiteralPath (Join-Path $destination ".bundle-incomplete") -Force

[ordered]@{
    ready = $true
    path = $destination
    mode = $Mode
    profile = $Profile
    release = "{0} {1}" -f $release.channel, $release.version
    files = $fileCount
    bytes = $byteCount
    gibibytes = [math]::Round($byteCount / 1GB, 2)
    manifest = Join-Path $destination ".portable-bundle.json"
} | ConvertTo-Json -Depth 4
