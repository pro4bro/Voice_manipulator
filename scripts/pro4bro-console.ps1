[CmdletBinding()]
param(
    [ValidateSet("start", "stop", "status")]
    [string]$Command = "start"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$apiRoot = Join-Path $root "services\api"
$webDist = Join-Path $root "apps\web\dist\index.html"
$url = "http://127.0.0.1:18120"
$studioUrl = "http://127.0.0.1:18081"
$dataRoot = Join-Path $root "data"
$runtimeRoot = Join-Path $dataRoot "runtime"
$sessionPath = Join-Path $runtimeRoot "pro4bro-services.json"
$stopRequestPath = Join-Path $runtimeRoot "pro4bro-stop.request"
$logRoot = Join-Path $dataRoot "logs"
$localLegacyRoot = Join-Path $root ".runtime\omnivoice-studio"
$legacyParent = Split-Path -Parent $root
$migrationLegacyRoots = @(
    (Join-Path $legacyParent "OmniVoice"),
    (Join-Path $legacyParent "PRO4BRO\VOICE_MANIPULATOR\OmniVoice\OmniVoice")
)

function Get-Listener([int]$Port) {
    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-ListenerProcess($Listener) {
    Get-CimInstance Win32_Process -Filter "ProcessId = $($Listener.OwningProcess)" -ErrorAction SilentlyContinue
}

function Test-ExpectedProcess($ProcessInfo, [string]$ExpectedPattern) {
    $ProcessInfo -and $ProcessInfo.Name -match "^python(\.exe)?$" -and $ProcessInfo.CommandLine -match $ExpectedPattern
}

function Show-PortStatus([int]$Port, [string]$Name, [string]$ExpectedPattern) {
    $listeners = Get-Listener $Port
    if (-not $listeners) {
        Write-Host ("{0,-18} STOPPED" -f $Name) -ForegroundColor DarkGray
        return
    }
    $info = Get-ListenerProcess $listeners[0]
    $verified = Test-ExpectedProcess $info $ExpectedPattern
    $state = if ($verified) { "RUNNING" } else { "IN USE (not managed)" }
    $color = if ($verified) { "Green" } else { "Yellow" }
    Write-Host ("{0,-18} {1} - PID {2}" -f $Name, $state, $listeners[0].OwningProcess) -ForegroundColor $color
}

function Stop-ExpectedPort([int]$Port, [string]$Name, [string]$ExpectedPattern) {
    foreach ($listener in (Get-Listener $Port)) {
        $info = Get-ListenerProcess $listener
        if (-not (Test-ExpectedProcess $info $ExpectedPattern)) {
            Write-Warning "$Name on port $Port is not a verified Pro4Bro process; it was not stopped."
            continue
        }
        Write-Host "Stopping $Name (PID $($listener.OwningProcess))..." -ForegroundColor DarkYellow
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
    }
}

function Show-LogTail([string[]]$Paths) {
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path) {
            Write-Host ""
            Write-Host "---- $path ----" -ForegroundColor Yellow
            Get-Content -LiteralPath $path -Tail 35
        }
    }
}

function Get-LegacyRoot {
    if ($env:PRO4BRO_LEGACY_STUDIO_ROOT) {
        if ([System.IO.Path]::IsPathRooted($env:PRO4BRO_LEGACY_STUDIO_ROOT)) {
            return $env:PRO4BRO_LEGACY_STUDIO_ROOT
        }
        return Join-Path $root $env:PRO4BRO_LEGACY_STUDIO_ROOT
    }
    if (Test-Path -LiteralPath (Join-Path $localLegacyRoot "studio_app\server.py")) {
        return $localLegacyRoot
    }
    $found = $migrationLegacyRoots | Where-Object {
        Test-Path -LiteralPath (Join-Path $_ "studio_app\server.py")
    } | Select-Object -First 1
    if ($found) { return $found }
    return $migrationLegacyRoots[0]
}

if ($Command -eq "status") {
    Write-Host ""
    Write-Host "PRO4BRO LOCAL SERVICES" -ForegroundColor Cyan
    Show-PortStatus 18120 "Pro4Bro API" '(?i)-m\s+app(\s|$)'
    Show-PortStatus 18081 "WhisperX STT Studio" '(?i)-m\s+studio_app\.server(\s|$)'
    if (Test-Path -LiteralPath $sessionPath) {
        Write-Host "Session: $sessionPath" -ForegroundColor DarkGray
    }
    exit 0
}

if ($Command -eq "stop") {
    Write-Host ""
    Write-Host "Stopping Pro4Bro local services..." -ForegroundColor Cyan
    New-Item -ItemType File -Force -Path $stopRequestPath | Out-Null
    Stop-ExpectedPort 18081 "WhisperX STT Studio" '(?i)-m\s+studio_app\.server(\s|$)'
    Stop-ExpectedPort 18120 "Pro4Bro API" '(?i)-m\s+app(\s|$)'
    Remove-Item -LiteralPath $sessionPath -Force -ErrorAction SilentlyContinue
    Write-Host "Done. Use start-pro4bro.bat start to run again." -ForegroundColor Green
    exit 0
}

if (Get-Listener 18120) {
    Write-Host ""
    Write-Host "Pro4Bro API is already running." -ForegroundColor Yellow
    Show-PortStatus 18120 "Pro4Bro API" '(?i)-m\s+app(\s|$)'
    if (Get-Listener 18081) {
        Start-Process $url
        Write-Host "To take full control from CMD, run: start-pro4bro.bat stop" -ForegroundColor DarkGray
        exit 0
    }

    $existingLegacyRoot = Get-LegacyRoot
    $existingLegacyPython = Join-Path $existingLegacyRoot ".venv\Scripts\python.exe"
    $canStartStudio = (Test-Path -LiteralPath $existingLegacyPython) -and (Test-Path -LiteralPath (Join-Path $existingLegacyRoot "studio_app\server.py"))
    if (-not $canStartStudio) {
        Write-Warning "WhisperX STT Studio đang dừng và chưa được cài tại $existingLegacyRoot. UI vẫn chạy; STT sẽ offline."
        Start-Process $url
        exit 0
    }

    # API without its STT sidecar is an incomplete session. Restart the managed
    # API so this command can launch OmniVoice Studio and retain one clear CMD owner.
    Write-Host "WhisperX STT Studio đang dừng; khởi động lại API cùng STT sidecar..." -ForegroundColor Yellow
    Stop-ExpectedPort 18120 "Pro4Bro API" '(?i)-m\s+app(\s|$)'
}

if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $webDist)) {
    & (Join-Path $PSScriptRoot "setup-pro4bro.ps1")
}

$env:PRO4BRO_DATA_ROOT = $dataRoot
$env:PRO4BRO_OMNIVOICE_ROOT = Join-Path $root "engines\OmniVoice"
$env:PRO4BRO_LEGACY_STUDIO_URL = $studioUrl

$localFfmpeg = Join-Path $root ".tools\ffmpeg\ffmpeg.exe"
if (Test-Path -LiteralPath $localFfmpeg) {
    $env:PRO4BRO_FFMPEG_PATH = $localFfmpeg
    $env:PATH = "$(Split-Path -Parent $localFfmpeg);$env:PATH"
}
$env:HF_HOME = Join-Path $root ".cache\huggingface"
$env:HUGGINGFACE_HUB_CACHE = Join-Path $env:HF_HOME "hub"
$env:TRANSFORMERS_CACHE = Join-Path $env:HF_HOME "transformers"
$env:TORCH_HOME = Join-Path $root ".cache\torch"
$env:HF_HUB_DISABLE_TELEMETRY = "1"
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"
$env:DO_NOT_TRACK = "1"

New-Item -ItemType Directory -Force -Path $dataRoot, $runtimeRoot, $logRoot, $env:HF_HOME, $env:TORCH_HOME | Out-Null
Remove-Item -LiteralPath $stopRequestPath -Force -ErrorAction SilentlyContinue
$apiOut = Join-Path $logRoot "pro4bro-api.out.log"
$apiErr = Join-Path $logRoot "pro4bro-api.err.log"
$studioOut = Join-Path $logRoot "omnivoice-studio.out.log"
$studioErr = Join-Path $logRoot "omnivoice-studio.err.log"

$studioProcess = $null
$studioStarted = $false
$apiStarted = $false
$legacyRoot = Get-LegacyRoot
$legacyPython = Join-Path $legacyRoot ".venv\Scripts\python.exe"
if ($legacyRoot -eq $localLegacyRoot) {
    $env:PRO4BRO_STUDIO_ROOT = $legacyRoot
    $env:PRO4BRO_STT_MODEL_ROOT = Join-Path $legacyRoot "models"
}
if (-not (Get-Listener 18081)) {
    if ((Test-Path -LiteralPath $legacyPython) -and (Test-Path -LiteralPath (Join-Path $legacyRoot "studio_app\server.py"))) {
        Write-Host "Starting WhisperX STT Studio..." -ForegroundColor DarkGray
        $studioProcess = Start-Process -FilePath $legacyPython -ArgumentList "-m", "studio_app.server", "--host", "127.0.0.1", "--port", "18081" -WorkingDirectory $legacyRoot -RedirectStandardOutput $studioOut -RedirectStandardError $studioErr -PassThru -WindowStyle Hidden
        $studioReady = $false
        for ($attempt = 0; $attempt -lt 300; $attempt++) {
            try {
                if (Invoke-RestMethod -Uri "$studioUrl/api/status" -TimeoutSec 1) {
                    $studioReady = $true
                    break
                }
            } catch {
                Start-Sleep -Milliseconds 500
            }
        }
        if (-not $studioReady) {
            Show-LogTail @($studioOut, $studioErr)
            throw "WhisperX STT Studio không sẵn sàng sau 150 giây."
        }
        $studioStarted = $true
    } else {
        Write-Warning "Không tìm thấy WhisperX STT Studio tại $legacyRoot. UI vẫn chạy, nhưng STT sẽ offline."
    }
}

if (Test-Path -LiteralPath $stopRequestPath) {
    Write-Host "Start cancelled by stop request." -ForegroundColor Yellow
    if ($studioProcess -and -not $studioProcess.HasExited) {
        Stop-Process -Id $studioProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Stop-ExpectedPort 18081 "WhisperX STT Studio" '(?i)-m\s+studio_app\.server(\s|$)'
    exit 0
}

Write-Host "Starting Pro4Bro API..." -ForegroundColor DarkGray
$apiProcess = Start-Process -FilePath $python -ArgumentList "-m", "app" -WorkingDirectory $apiRoot -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
$apiStarted = $true
try {
    $ready = $false
    $cancelledByStop = $false
    for ($attempt = 0; $attempt -lt 240; $attempt++) {
        if (Test-Path -LiteralPath $stopRequestPath) {
            $cancelledByStop = $true
            break
        }

        try {
            $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1
            if ($health.status -eq "ok") {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if ($cancelledByStop) {
        Write-Host "Start cancelled by stop request." -ForegroundColor Yellow
        return
    }
    if (-not $ready) {
        Show-LogTail @($apiOut, $apiErr)
        throw "Pro4Bro API không sẵn sàng sau 60 giây."
    }

    $apiListener = Get-Listener 18120 | Select-Object -First 1
    $studioListener = Get-Listener 18081 | Select-Object -First 1
    [ordered]@{
        startedAt = [datetime]::UtcNow.ToString("o")
        apiPid = if ($apiListener) { $apiListener.OwningProcess } else { $null }
        studioPid = if ($studioListener) { $studioListener.OwningProcess } else { $null }
        root = $root
    } | ConvertTo-Json | Set-Content -LiteralPath $sessionPath -Encoding utf8

    Start-Process $url
    $Host.UI.RawUI.WindowTitle = "Pro4Bro Local Server - RUNNING"
    Write-Host ""
    Write-Host "Pro4Bro is running at $url" -ForegroundColor Green
    Write-Host "Keep this CMD window open. Ctrl+C stops services started by this window." -ForegroundColor Cyan
    Write-Host "Another CMD: start-pro4bro.bat status   |   start-pro4bro.bat stop" -ForegroundColor Cyan
    while (Get-Listener 18120) { Start-Sleep -Seconds 1 }
    if (Test-Path -LiteralPath $stopRequestPath) {
        Write-Host "Pro4Bro stopped by request." -ForegroundColor Yellow
        return
    }
    throw "Pro4Bro API stopped unexpectedly."
}
finally {
    if ($apiStarted) {
        Stop-ExpectedPort 18120 "Pro4Bro API" '(?i)-m\s+app(\s|$)'
    }
    if ($studioStarted) {
        Stop-ExpectedPort 18081 "WhisperX STT Studio" '(?i)-m\s+studio_app\.server(\s|$)'
    }
    Remove-Item -LiteralPath $sessionPath -Force -ErrorAction SilentlyContinue
}
