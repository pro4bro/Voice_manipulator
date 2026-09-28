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
try {
    $env:PYTHONPATH = Join-Path $root 'services\api'
    & $python -m app.adapters.obs_plugin_installation --cli $root (Join-Path $root 'data') $Action $ObsRoot ([string][bool]$RemovePairing).ToLowerInvariant()
    if ($LASTEXITCODE -ne 0) { throw "OBS plugin $Action failed." }
} finally {
    $env:PYTHONPATH = $previousPythonPath
}
