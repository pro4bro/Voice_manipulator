[CmdletBinding()]
param(
    [switch]$SkipEngineClone
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$engineRoot = Join-Path $root "engines\OmniVoice"
$webRoot = Join-Path $root "apps\web"
$ffmpegRoot = Join-Path $root ".tools\ffmpeg"
$localFfmpeg = Join-Path $ffmpegRoot "ffmpeg.exe"
$localFfprobe = Join-Path $ffmpegRoot "ffprobe.exe"

function Resolve-Python311 {
    $candidates = @(
        $env:PRO4BRO_BOOTSTRAP_PYTHON,
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
        (Join-Path $env:ProgramFiles "Python311\python.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    if ($candidates.Count -eq 0) {
        throw "Không tìm thấy Python 3.11. Cài Python 3.11 hoặc đặt PRO4BRO_BOOTSTRAP_PYTHON."
    }
    return $candidates[0]
}

Write-Host "`nPRO4BRO VOICE MANIPULATOR / LOCAL SETUP" -ForegroundColor DarkGray

if (-not $SkipEngineClone -and -not (Test-Path -LiteralPath (Join-Path $engineRoot ".git"))) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $engineRoot) | Out-Null
    & git clone https://github.com/k2-fsa/OmniVoice.git $engineRoot
    if ($LASTEXITCODE -ne 0) { throw "Không clone được OmniVoice." }
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    $bootstrapPython = Resolve-Python311
    & $bootstrapPython -m venv (Join-Path $root ".venv")
    if ($LASTEXITCODE -ne 0) { throw "Không tạo được Python environment." }
}

if (-not (Test-Path -LiteralPath $localFfmpeg) -or -not (Test-Path -LiteralPath $localFfprobe)) {
    $ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if (-not $ffmpegCommand) {
        throw "Không tìm thấy FFmpeg. Đặt ffmpeg.exe và ffprobe.exe trong $ffmpegRoot rồi chạy setup lại."
    }
    $sourceFfprobe = Join-Path (Split-Path -Parent $ffmpegCommand.Source) "ffprobe.exe"
    if (-not (Test-Path -LiteralPath $sourceFfprobe)) {
        throw "Có ffmpeg.exe nhưng thiếu ffprobe.exe tại $(Split-Path -Parent $ffmpegCommand.Source)."
    }
    New-Item -ItemType Directory -Force -Path $ffmpegRoot | Out-Null
    Copy-Item -LiteralPath $ffmpegCommand.Source -Destination $localFfmpeg
    Copy-Item -LiteralPath $sourceFfprobe -Destination $localFfprobe
}

& $venvPython -m pip install -r (Join-Path $root "services\api\requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Không cài được dependency backend." }

Push-Location $webRoot
try {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "Không cài được dependency frontend." }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build thất bại." }
}
finally {
    Pop-Location
}

Write-Host "`nSetup hoàn tất. Chạy start-pro4bro.bat để mở app." -ForegroundColor Green
