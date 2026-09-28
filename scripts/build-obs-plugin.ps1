[CmdletBinding()]
param(
    [string]$ObsInstall = "C:\Program Files\obs-studio",
    [string]$ObsSource,
    [string]$BuildRoot
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $ObsSource) { $ObsSource = Join-Path $repo ".cache\obs-studio-32.2.2" }
if (-not $BuildRoot) { $BuildRoot = Join-Path $repo "build\obs-plugin" }
$BuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)
$plugin = Join-Path $repo "plugins\obs-pro4bro-bridge"
$obsSourcePath = (Resolve-Path $ObsSource).Path
$obsBin = Join-Path $ObsInstall "bin\64bit"
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcTools = Get-ChildItem (Join-Path $vs "VC\Tools\MSVC") -Directory | Sort-Object Name -Descending | Select-Object -First 1
$hostTools = Join-Path $vcTools.FullName "bin\Hostx64\x64"
$dumpbin = Join-Path $hostTools "dumpbin.exe"
$libTool = Join-Path $hostTools "lib.exe"
$cmake = Join-Path $vs "Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
$imports = Join-Path $BuildRoot "imports"
$generated = Join-Path $BuildRoot "generated"
New-Item -ItemType Directory -Force $imports, $generated | Out-Null

function New-ImportLibrary([string]$DllName, [string]$LibraryName) {
    $dll = Join-Path $obsBin $DllName
    $def = Join-Path $generated "$LibraryName.def"
    $lines = @("LIBRARY `"$DllName`"", "EXPORTS")
    $exports = & $dumpbin /nologo /exports $dll
    foreach ($line in $exports) {
        if ($line -match '^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(\S+)') { $lines += "    $($Matches[1])" }
    }
    Set-Content -LiteralPath $def -Value $lines -Encoding ascii
    $library = Join-Path $imports "$LibraryName.lib"
    & $libTool /nologo "/def:$def" /machine:x64 "/out:$library"
    if ($LASTEXITCODE) { throw "lib.exe failed for $DllName" }
}

New-ImportLibrary "obs.dll" "obs"
New-ImportLibrary "obs-frontend-api.dll" "obs-frontend-api"

& $cmake -S $plugin -B $BuildRoot -G "Visual Studio 17 2022" -A x64 `
    "-DOBS_SOURCE_DIR=$obsSourcePath" "-DOBS_IMPORT_LIB_DIR=$imports"
if ($LASTEXITCODE) { throw "CMake configure failed" }
& $cmake --build $BuildRoot --config RelWithDebInfo
if ($LASTEXITCODE) { throw "Plugin build failed" }

$output = Join-Path $BuildRoot "RelWithDebInfo\pro4bro-obs-bridge.dll"
& (Join-Path $PSScriptRoot 'package-obs-plugin.ps1') | Out-Null
Write-Output $output
