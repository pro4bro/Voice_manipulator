[CmdletBinding()]
param(
    [ValidateSet('install', 'repair', 'remove')][string]$Action = 'install',
    [string]$ObsRoot = '',
    [switch]$RemovePairing
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $root '.runtime\python\core\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    $python = Join-Path $root '.venv\Scripts\python.exe'
}
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'Pro4Bro Python runtime is missing. Run setup-pro4bro.ps1 first.'
}
$previousPythonPath = $env:PYTHONPATH
$previousPythonIoEncoding = $env:PYTHONIOENCODING
try {
    $env:PYTHONPATH = Join-Path $root 'services\api'
    $env:PYTHONIOENCODING = 'utf-8'
    $obsRootArgument = if ($ObsRoot) { $ObsRoot } else { '__PRO4BRO_AUTO_OBS_ROOT__' }
    $output = & $python -m app.adapters.obs_plugin_installation --cli $root (Join-Path $root 'data') $Action $obsRootArgument ([string][bool]$RemovePairing).ToLowerInvariant() 2>&1
    $pythonExitCode = $LASTEXITCODE
    if ($pythonExitCode -ne 0) {
        $details = ($output | Out-String).Trim()
        if ($details) { throw "OBS plugin $Action failed (exit $pythonExitCode): $details" }
        throw "OBS plugin $Action failed (exit $pythonExitCode)."
    }
    $output
} finally {
    $env:PYTHONPATH = $previousPythonPath
    $env:PYTHONIOENCODING = $previousPythonIoEncoding
}
