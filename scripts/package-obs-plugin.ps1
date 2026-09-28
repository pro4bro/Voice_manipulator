[CmdletBinding()]
param([string]$OutputRoot)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputRoot) { $OutputRoot = Join-Path $root 'build\obs-plugin-package' }
$dll = Join-Path $root 'build\obs-plugin\RelWithDebInfo\pro4bro-obs-bridge.dll'
$locale = Join-Path $root 'plugins\obs-pro4bro-bridge\data\pro4bro-obs-bridge\locale\en-US.ini'
$brand = Join-Path $root 'plugins\obs-pro4bro-bridge\data\pro4bro-obs-bridge\brand\pro4bro-livelink.svg'
$cmake = Get-Content -LiteralPath (Join-Path $root 'plugins\obs-pro4bro-bridge\CMakeLists.txt') -Raw
if ($cmake -notmatch 'project\(pro4bro_obs_bridge VERSION (\d+\.\d+\.\d+)') {
    throw 'Cannot read OBS plugin version from CMakeLists.txt.'
}
$pluginVersion = $Matches[1]
foreach ($source in @($dll, $locale, $brand)) {
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "OBS package source missing: $source" }
}
$files = @(
    @{ source = $dll; relative = 'bin/64bit/pro4bro-obs-bridge.dll'; standard = 'bin/64bit/pro4bro-obs-bridge.dll'; portable = 'obs-plugins/64bit/pro4bro-obs-bridge.dll' },
    @{ source = $locale; relative = 'data/locale/en-US.ini'; standard = 'data/locale/en-US.ini'; portable = 'data/obs-plugins/pro4bro-obs-bridge/locale/en-US.ini' },
    @{ source = $brand; relative = 'data/brand/pro4bro-livelink.svg'; standard = 'data/brand/pro4bro-livelink.svg'; portable = 'data/obs-plugins/pro4bro-obs-bridge/brand/pro4bro-livelink.svg' }
)
$entries = foreach ($file in $files) {
    $target = Join-Path $OutputRoot ($file.relative -replace '/', '\')
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $file.source -Destination $target -Force
    [ordered]@{
        source = $file.relative
        standard = $file.standard
        portable = $file.portable
        sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
[ordered]@{ schemaVersion = 1; pluginId = 'pro4bro-obs-bridge'; pluginVersion = $pluginVersion; obsBuildVersion = '32.2.2'; architecture = 'x64'; files = @($entries) } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputRoot 'manifest.json') -Encoding utf8
Write-Output $OutputRoot
