[CmdletBinding()]
param(
    [ValidateSet("start", "stop", "status")]
    [string]$Command = "start"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$apiRoot = Join-Path $projectRoot "services\api"
$webDist = Join-Path $projectRoot "apps\web\dist\index.html"
$controllerUrl = "http://127.0.0.1:18119"
$workloadScript = Join-Path $PSScriptRoot "pro4bro-workloads.ps1"
$logRoot = Join-Path $projectRoot "data\logs"

function Get-Listener([int]$Port) {
    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-ListenerProcess($Listener) {
    Get-CimInstance Win32_Process -Filter "ProcessId = $($Listener.OwningProcess)" -ErrorAction SilentlyContinue
}

function Test-ControllerProcess($ProcessInfo) {
    $ProcessInfo -and $ProcessInfo.Name -match "^python(\.exe)?$" -and $ProcessInfo.CommandLine -match '(?i)-m\s+app\.runtime_controller(\s|$)'
}

function Stop-Controller {
    foreach ($listener in (Get-Listener 18119)) {
        $processInfo = Get-ListenerProcess $listener
        if (-not (Test-ControllerProcess $processInfo)) {
            throw "Port 18119 is not owned by the verified Pro4Bro controller; it was not stopped."
        }
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
    }
}

function Wait-Controller {
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri "$controllerUrl/api/runtime/health" -TimeoutSec 1
            if ($health.status -eq "ok") { return $true }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    return $false
}

if ($Command -eq "status") {
    $listener = Get-Listener 18119 | Select-Object -First 1
    if ($listener) {
        $processInfo = Get-ListenerProcess $listener
        $state = if (Test-ControllerProcess $processInfo) { "RUNNING" } else { "IN USE (not managed)" }
        Write-Host "Pro4Bro Controller $state - PID $($listener.OwningProcess)"
    } else {
        Write-Host "Pro4Bro Controller STOPPED"
    }
    & $workloadScript -Action status
    exit $LASTEXITCODE
}

if ($Command -eq "stop") {
    & $workloadScript -Action stop
    Stop-Controller
    Write-Host "Pro4Bro controller and all workloads are stopped." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $webDist)) {
    & (Join-Path $PSScriptRoot "setup-pro4bro.ps1")
}
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

$existing = Get-Listener 18119 | Select-Object -First 1
if ($existing) {
    $processInfo = Get-ListenerProcess $existing
    if (-not (Test-ControllerProcess $processInfo)) {
        throw "Port 18119 is occupied by a process that is not managed by Pro4Bro."
    }
    & $workloadScript -Action start
    Start-Process $controllerUrl
    Write-Host "Pro4Bro is available at $controllerUrl" -ForegroundColor Green
    exit 0
}

$controllerOut = Join-Path $logRoot "pro4bro-controller.out.log"
$controllerErr = Join-Path $logRoot "pro4bro-controller.err.log"
$controllerProcess = Start-Process -FilePath $python -ArgumentList "-m", "app.runtime_controller", "--host", "127.0.0.1", "--port", "18119" -WorkingDirectory $apiRoot -RedirectStandardOutput $controllerOut -RedirectStandardError $controllerErr -PassThru -WindowStyle Hidden
try {
    if (-not (Wait-Controller)) {
        throw "Pro4Bro controller did not become ready within 30 seconds."
    }
    & $workloadScript -Action start
    Start-Process $controllerUrl
    $Host.UI.RawUI.WindowTitle = "Pro4Bro Runtime Controller - RUNNING"
    Write-Host ""
    Write-Host "Pro4Bro is available at $controllerUrl" -ForegroundColor Green
    Write-Host "Windows menu controls API, STT and background workloads." -ForegroundColor Cyan
    Write-Host "Keep this controller window open. Ctrl+C stops the full stack." -ForegroundColor Cyan
    while (Get-Listener 18119) { Start-Sleep -Seconds 1 }
} finally {
    & $workloadScript -Action stop 2>$null
    Stop-Controller
}
