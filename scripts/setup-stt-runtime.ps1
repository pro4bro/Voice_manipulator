[CmdletBinding()]
param(
    [string]$Model = "large-v3",
    [switch]$SkipModelPreload
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$root = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $root ".runtime\omnivoice-studio"
$sourceRoot = Join-Path $root "services\stt_studio"
$python = Join-Path $runtimeRoot ".venv\Scripts\python.exe"
$requirements = Join-Path $sourceRoot "requirements-runtime.txt"
$studioSource = Join-Path $sourceRoot "studio_app"
$studioDestination = Join-Path $runtimeRoot "studio_app"
$modelRoot = Join-Path $runtimeRoot "models"

if (-not (Test-Path -LiteralPath $studioSource)) { throw "Không tìm thấy source Studio tại $studioSource" }
New-Item -ItemType Directory -Force -Path $runtimeRoot, $modelRoot, $studioDestination | Out-Null
Copy-Item -Path (Join-Path $studioSource "*") -Destination $studioDestination -Recurse -Force
if (-not (Test-Path -LiteralPath $python)) {
    $bootstrap = Get-Command py -ErrorAction SilentlyContinue
    if (-not $bootstrap) { throw "Không tìm thấy Python launcher (py) để tạo runtime STT." }
    & $bootstrap.Source -3.11 -m venv "$runtimeRoot\.venv"
}
function Invoke-RuntimePython([string[]]$Arguments) {
    & $python @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime Python dừng với code ${LASTEXITCODE}: $($Arguments -join ' ')"
    }
}

Invoke-RuntimePython @("-m", "ensurepip", "--upgrade")
Invoke-RuntimePython @("-m", "pip", "install", "--disable-pip-version-check", "--progress-bar", "off", "-r", $requirements)
$env:HF_HOME = Join-Path $root ".cache\huggingface"
$env:HUGGINGFACE_HUB_CACHE = Join-Path $env:HF_HOME "hub"
$env:PRO4BRO_STUDIO_ROOT = $runtimeRoot
$env:PRO4BRO_STT_MODEL_ROOT = $modelRoot
$env:PRO4BRO_STT_MODEL = $Model
if (-not $SkipModelPreload) {
    Write-Host "Tải và kiểm tra model WhisperX $Model..." -ForegroundColor Cyan
    Invoke-RuntimePython @("-c", "from studio_app import server; model, device = server._model(); print(f'READY model={server.MODEL_NAME} device={device}')")
}
Write-Host "Runtime WhisperX Studio sẵn sàng tại $runtimeRoot" -ForegroundColor Green