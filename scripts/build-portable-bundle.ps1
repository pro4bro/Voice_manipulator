[CmdletBinding()]
param(
    [string]$OutputRoot,
    [ValidateSet("HardLink", "Copy")]
    [string]$Mode = "HardLink",
    [ValidateSet("All", "NoVibeVoice")]
    [string]$Profile = "All",
    [switch]$DeferBaseLayer,
    [switch]$SkipWebBuild
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

if (-not $SkipWebBuild) {
    Push-Location (Join-Path $root 'apps\web')
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "Web build failed; no bundle was created." }
    } finally { Pop-Location }
}

$sourceAudit = & (Join-Path $root "scripts\test-portable-runtime.ps1") -Profile $Profile -Json | ConvertFrom-Json
if (-not $sourceAudit.portable -or $sourceAudit.failed -ne 0) { throw "Source tree failed the portable gate." }

$components = [System.Collections.Generic.List[object]]::new()
$fileCount = 0L
$byteCount = 0L
$logicalFileCount = 0L
$logicalByteCount = 0L
$pendingBaseComponents = [System.Collections.Generic.List[string]]::new()
$baseCopyComponents = [System.Collections.Generic.List[object]]::new()

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

function Add-BundleFile([string]$Source, [string]$RelativeDestination, [switch]$BaseLayer, [switch]$ForceCopy) {
    $target = Join-Path $destination $RelativeDestination
    [System.IO.Directory]::CreateDirectory((ConvertTo-ExtendedPath (Split-Path -Parent $target))) | Out-Null
    if ($Mode -eq "HardLink" -and $BaseLayer -and -not $ForceCopy) {
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
    $script:logicalFileCount++
    $script:logicalByteCount += $item.Length
}

function Add-BundleTree {
    param(
        [string]$SourceRelative,
        [string]$DestinationRelative = $SourceRelative,
        [string[]]$Exclude = @(),
        [switch]$BaseLayer
    )
    $source = Join-Path $root $SourceRelative
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Required bundle tree is missing: $source"
    }
    $portableExcludes = @(
        ".git", ".git\*", "**\.git", "**\.git\*",
        ".venv", ".venv\*", "**\.venv", "**\.venv\*",
        "venv", "venv\*", "**\venv", "**\venv\*",
        "logs\*", "**\logs\*", "*.log", "**\*.log",
        "__pycache__\*", "**\__pycache__\*", ".pytest_cache\*", "**\.pytest_cache\*",
        "tests\*", "**\tests\*", ".env", ".env.*", "**\.env", "**\.env.*"
    )
    $treeExcludes = @($portableExcludes + $Exclude | Select-Object -Unique)
    $treeFiles = 0L
    $treeBytes = 0L
    foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -File -Force) {
        $relative = $file.FullName.Substring($source.Length).TrimStart('\')
        $normalizedRelative = $relative.Replace('/', '\')
        $excluded = $false
        foreach ($pattern in $treeExcludes) {
            $matchesPattern = $normalizedRelative -like $pattern
            if (-not $matchesPattern -and $pattern.StartsWith('**\', [StringComparison]::Ordinal)) {
                $matchesPattern = $normalizedRelative -like $pattern.Substring(3)
            }
            if ($matchesPattern) { $excluded = $true; break }
        }
        if ($excluded) { continue }
        $treeFiles++
        $treeBytes += $file.Length
        if (-not ($BaseLayer -and $DeferBaseLayer)) {
            Add-BundleFile $file.FullName (Join-Path $DestinationRelative $relative) -BaseLayer:$BaseLayer
        }
    }
    if ($BaseLayer -and $DeferBaseLayer) {
        $script:logicalFileCount += $treeFiles
        $script:logicalByteCount += $treeBytes
    }
    if ($BaseLayer) {
        $destinationPath = $DestinationRelative.Replace('\', '/')
        $script:baseCopyComponents.Add([ordered]@{
            source = $source
            destination = $destinationPath
            files = $treeFiles
            bytes = $treeBytes
            excludes = $treeExcludes
        })
        if ($DeferBaseLayer) { $script:pendingBaseComponents.Add($destinationPath) }
    }
    $components.Add([ordered]@{
        path = $DestinationRelative.Replace('\', '/')
        files = $treeFiles
        bytes = $treeBytes
    })
}

function Add-SingleFile([string]$RelativePath, [string]$DestinationRelative = $RelativePath) {
    $source = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required bundle file is missing: $source" }
    Add-BundleFile $source $DestinationRelative -ForceCopy
}

New-Item -ItemType Directory -Path $destination | Out-Null
Set-Content -LiteralPath (Join-Path $destination ".bundle-incomplete") -Value "Bundle creation is in progress." -Encoding utf8

Add-BundleTree ".runtime\python\core" -BaseLayer
Add-BundleTree ".runtime\python\stt" -BaseLayer
Add-BundleTree ".runtime\python\omnivoice-training" -BaseLayer
if ($Profile -eq "All") { Add-BundleTree ".runtime\python\vibevoice-training" -BaseLayer }
Add-BundleTree ".runtime\python\rvc" -BaseLayer
Add-BundleTree ".runtime\python\voice-changer" -BaseLayer
Add-SingleFile ".runtime\python\runtime-manifest.json"
if ($Profile -eq "All") {
    Add-BundleTree -SourceRelative ".runtime\engines" -DestinationRelative ".runtime\engines" -Exclude @("research\Applio\logs\*", "research\Applio\*\__pycache__\*") -BaseLayer
} else {
    Add-BundleTree -SourceRelative ".runtime\engines\research" -DestinationRelative ".runtime\engines\research" -Exclude @("Applio\logs\*", "Applio\*\__pycache__\*") -BaseLayer
}
Add-BundleTree ".runtime\omnivoice-studio\models" -BaseLayer
Add-BundleTree ".runtime\omnivoice-studio\nltk_data" -BaseLayer
Add-BundleTree ".cache\huggingface" -BaseLayer
Add-BundleTree ".cache\torch" -BaseLayer
Add-BundleTree ".tools\ffmpeg" -BaseLayer
Add-BundleTree -SourceRelative "engines\OmniVoice" -DestinationRelative "engines\OmniVoice" -Exclude @(".git", ".git\*", "**\.git", "**\.git\*", "**\__pycache__\*", ".venv\*") -BaseLayer
Add-BundleTree -SourceRelative "services\api" -DestinationRelative "services\api" -Exclude @("tests\*", "**\__pycache__\*", ".pytest_cache\*")
Add-BundleTree "apps\web\dist"
Add-BundleTree "services\stt_studio\studio_app" ".runtime\omnivoice-studio\studio_app" @("__pycache__\*")
& (Join-Path $PSScriptRoot 'package-obs-plugin.ps1') | Out-Null
Add-BundleTree "build\obs-plugin-package" "obs-plugin-package"
Add-SingleFile "build\obs-plugin\RelWithDebInfo\pro4bro-obs-bridge.dll"
Add-SingleFile "plugins\obs-pro4bro-bridge\config.example.json"
foreach ($scriptName in @("pro4bro-console.ps1", "pro4bro-process-tree.ps1", "pro4bro-readiness.ps1", "pro4bro-workloads.ps1", "test-portable-runtime.ps1", "install-obs-plugin.ps1", "update-portable.ps1")) {
    Add-SingleFile "scripts\$scriptName"
}
foreach ($entrypoint in @("open-pro4bro-console.bat", "VERIFY-PORTABLE.bat", "INSTALL-OBS-PLUGIN.bat", "UPDATE-PORTABLE.bat")) {
    Add-SingleFile $entrypoint
}
if ($Profile -eq "NoVibeVoice") {
    Add-SingleFile "docs\PORTABLE-NO-VIBEVOICE.md" "PORTABLE-README.md"
} else {
    Add-SingleFile "docs\PORTABLE-QUICKSTART.md" "PORTABLE-README.md"
}
New-Item -ItemType Directory -Force -Path (Join-Path $destination "data") | Out-Null

if ($DeferBaseLayer) {
    $copyPlan = [ordered]@{
        schemaVersion = 1
        kind = 'Pro4BroBaseCopyPlan'
        profile = $Profile
        sourceRoot = $root
        components = @($baseCopyComponents)
    }
    $copyPlan | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $destination '.portable-base-copy.json') -Encoding utf8

    function Format-PortableSize([long]$Bytes) {
        if ($Bytes -ge 1GB) { return ("{0:N2} GiB" -f ($Bytes / 1GB)) }
        if ($Bytes -ge 1MB) { return ("{0:N2} MiB" -f ($Bytes / 1MB)) }
        if ($Bytes -ge 1KB) { return ("{0:N2} KiB" -f ($Bytes / 1KB)) }
        return ("{0} B" -f $Bytes)
    }
    $expectedBaseFiles = 0L
    $expectedBaseBytes = 0L
    foreach ($component in $baseCopyComponents) {
        $expectedBaseFiles += [long]$component.files
        $expectedBaseBytes += [long]$component.bytes
    }
    $profileCopyInstructions = if ($Profile -eq 'NoVibeVoice') {
        "Bản NoVibeVoice cần sao chép đủ 12 thành phần trong bảng. Không sao chép ``.runtime/python/vibevoice-training`` hoặc ``.runtime/engines/vibevoice``."
    } else {
        "Bản All cần sao chép mọi thành phần trong bảng, bao gồm runtime và mã nguồn VibeVoice."
    }
    $copyRows = foreach ($component in $baseCopyComponents) {
        $exclusions = if (@($component.excludes).Count) { ($component.excludes -join ', ') } else { 'None' }
        $size = Format-PortableSize ([long]$component.bytes)
        "| ``$($component.source)`` | ``$($component.destination)`` | $($component.files) | $size | $($component.bytes) | $exclusions |"
    }
    $copyGuide = @"
# Pro4Bro Portable $($release.channel) $($release.version) — Sao chép runtime và model

Bản portable đã có đầy đủ ứng dụng. Các runtime và model nền đang chờ được chép vào.
$profileCopyInstructions

Tổng cần chép: $(@($baseCopyComponents).Count) thành phần, $expectedBaseFiles tệp, $(Format-PortableSize $expectedBaseBytes) ($expectedBaseBytes byte).
Chép nguyên từng thư mục nguồn bên dưới vào đúng thư mục đích trong bản portable. Giữ nguyên cấu trúc con
và áp dụng danh sách loại trừ ở mỗi dòng. Đường dẫn nguồn chỉ là gợi ý trên máy tạo bản; ứng dụng dùng
đường dẫn tương đối trong thư mục portable. Không chép Git, virtualenv, log, bytecode, tests, project,
recording hoặc secret.

| Thư mục nguồn trên máy tạo bản | Đích trong portable | Tệp | Dung lượng | Byte | Loại trừ |
| --- | --- | ---: | ---: | ---: | --- |
$($copyRows -join "`r`n")

## Hoàn tất

1. Chép đủ tất cả thành phần theo bảng và giữ nguyên đường dẫn.
2. Bấm ``VERIFY-PORTABLE.bat`` ở thư mục gốc. Chỉ khi báo cáo có **0 lỗi**, trình xác minh mới tự đánh dấu bản portable sẵn sàng.
3. Mở ứng dụng bằng ``open-pro4bro-console.bat``.
4. Để cài OBS bridge, đóng OBS rồi bấm ``INSTALL-OBS-PLUGIN.bat``.
"@
    [IO.File]::WriteAllText((Join-Path $destination 'COPY-CORE-MODELS.md'), $copyGuide, [Text.UTF8Encoding]::new($false))
}

$criticalFiles = @(
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
    $modelRef = Join-Path $root ".cache\huggingface\hub\models--k2-fsa--OmniVoice\refs\main"
    $modelRevision = (Get-Content -Raw -LiteralPath $modelRef).Trim()
    $criticalFiles += ".cache/huggingface/hub/models--k2-fsa--OmniVoice/snapshots/$modelRevision/model.safetensors"
}
$criticalHashes = foreach ($relative in $criticalFiles) {
    $path = Join-Path $destination $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $path = Join-Path $root $relative }
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
    logicalFiles = $logicalFileCount
    logicalBytes = $logicalByteCount
    deferredBaseLayer = [bool]$DeferBaseLayer
    baseLayerReady = -not [bool]$DeferBaseLayer
    components = $components
    criticalFiles = $criticalHashes
    layers = [ordered]@{ app = '.portable-app-layer.json'; baseRuntimeAndModels = '.portable-model-layer.json' }
    excluded = @("Git metadata", "developer virtual environments", "Node modules", "build caches", "logs", "tests", "user projects and recordings") + $(if ($Profile -eq "NoVibeVoice") { @("VibeVoice source, runtime and weights") } else { @() })
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $destination ".portable-bundle.json") -Encoding utf8
$appTrees = @('services/api', 'apps/web/dist', '.runtime/omnivoice-studio/studio_app', 'obs-plugin-package', 'scripts')
$appFiles = @('build/obs-plugin/RelWithDebInfo/pro4bro-obs-bridge.dll', 'plugins/obs-pro4bro-bridge/config.example.json', 'open-pro4bro-console.bat', 'VERIFY-PORTABLE.bat', 'INSTALL-OBS-PLUGIN.bat', 'UPDATE-PORTABLE.bat', 'PORTABLE-README.md')
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
if (-not $DeferBaseLayer) { Remove-Item -LiteralPath (Join-Path $destination ".bundle-incomplete") -Force }

[ordered]@{
    ready = -not [bool]$DeferBaseLayer
    appLayerReady = $true
    pendingBaseComponents = @($pendingBaseComponents)
    path = $destination
    mode = $Mode
    profile = $Profile
    release = "{0} {1}" -f $release.channel, $release.version
    files = $fileCount
    bytes = $byteCount
    gibibytes = [math]::Round($byteCount / 1GB, 2)
    manifest = Join-Path $destination ".portable-bundle.json"
} | ConvertTo-Json -Depth 4
