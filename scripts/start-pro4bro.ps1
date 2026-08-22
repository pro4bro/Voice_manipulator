[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$apiRoot = Join-Path $root "services\api"
$webDist = Join-Path $root "apps\web\dist\index.html"
$url = "http://127.0.0.1:18120"
$studioUrl = "http://127.0.0.1:18081"
$localLegacyRoot = Join-Path $root ".runtime\omnivoice-studio"
$migrationLegacyRoot = Join-Path (Split-Path -Parent $root) "OmniVoice"
if ($env:PRO4BRO_LEGACY_STUDIO_ROOT) {
    $legacyRoot = if ([System.IO.Path]::IsPathRooted($env:PRO4BRO_LEGACY_STUDIO_ROOT)) {
        $env:PRO4BRO_LEGACY_STUDIO_ROOT
    } else {
        Join-Path $root $env:PRO4BRO_LEGACY_STUDIO_ROOT
    }
}
elseif (Test-Path -LiteralPath (Join-Path $localLegacyRoot "studio_app\server.py")) {
    $legacyRoot = $localLegacyRoot
}
else {
    $legacyRoot = $migrationLegacyRoot
}
$legacyPython = Join-Path $legacyRoot ".venv\Scripts\python.exe"
$localFfmpeg = Join-Path $root ".tools\ffmpeg\ffmpeg.exe"

if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $webDist)) {
    & (Join-Path $PSScriptRoot "setup-pro4bro.ps1")
}

$env:PRO4BRO_DATA_ROOT = Join-Path $root "data"
$env:PRO4BRO_OMNIVOICE_ROOT = Join-Path $root "engines\OmniVoice"
$env:PRO4BRO_LEGACY_STUDIO_URL = $studioUrl
if (Test-Path -LiteralPath $localFfmpeg) { $env:PRO4BRO_FFMPEG_PATH = $localFfmpeg }
$env:HF_HOME = Join-Path $root ".cache\huggingface"
$env:HUGGINGFACE_HUB_CACHE = Join-Path $env:HF_HOME "hub"
$env:TRANSFORMERS_CACHE = Join-Path $env:HF_HOME "transformers"
$env:TORCH_HOME = Join-Path $root ".cache\torch"
$env:HF_HUB_DISABLE_TELEMETRY = "1"
$env:DO_NOT_TRACK = "1"

New-Item -ItemType Directory -Force -Path $env:PRO4BRO_DATA_ROOT, $env:HF_HOME, $env:TORCH_HOME | Out-Null

$studioServer = $null
$studioExisting = Get-NetTCPConnection -LocalPort 18081 -State Listen -ErrorAction SilentlyContinue
if (-not $studioExisting) {
    if ((Test-Path -LiteralPath $legacyPython) -and (Test-Path -LiteralPath (Join-Path $legacyRoot "studio_app\server.py"))) {
        Write-Host "Starting OmniVoice Studio runtime..." -ForegroundColor DarkGray
        $studioServer = Start-Process -FilePath $legacyPython -ArgumentList "-m", "studio_app.server", "--host", "127.0.0.1", "--port", "18081" -WorkingDirectory $legacyRoot -PassThru -WindowStyle Hidden
        $studioReady = $false
        for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
            if ($studioServer.HasExited) { throw "OmniVoice Studio runtime dừng sớm với code $($studioServer.ExitCode)." }
            try {
                $studioStatus = Invoke-RestMethod -Uri "$studioUrl/api/status" -TimeoutSec 1
                if ($studioStatus) { $studioReady = $true; break }
            }
            catch {
                Start-Sleep -Milliseconds 500
            }
        }
        if (-not $studioReady) { throw "OmniVoice Studio runtime không sẵn sàng sau 60 giây." }
    }
    else {
        Write-Warning "Không tìm thấy runtime Studio cũ tại $legacyRoot. Project UI vẫn chạy nhưng audio AI sẽ báo offline."
    }
}

$existing = Get-NetTCPConnection -LocalPort 18120 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Start-Process $url
    Write-Host "Pro4Bro đang chạy tại $url" -ForegroundColor Green
    exit 0
}

$server = Start-Process -FilePath $python -ArgumentList "-m", "app" -WorkingDirectory $apiRoot -PassThru -WindowStyle Hidden
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
        if ($server.HasExited) { throw "Local server dừng sớm với code $($server.ExitCode)." }
        try {
            $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1
            if ($health.status -eq "ok") { $ready = $true; break }
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $ready) { throw "Local server không sẵn sàng sau 10 giây." }

    Start-Process $url
    Write-Host "`nPro4Bro Voice Manipulator đang chạy tại $url" -ForegroundColor Green
    Write-Host "Giữ cửa sổ này mở. Nhấn Ctrl+C để dừng local server." -ForegroundColor DarkGray
    Wait-Process -Id $server.Id
}
finally {
    if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    if ($studioServer -and -not $studioServer.HasExited) { Stop-Process -Id $studioServer.Id -Force }
}
