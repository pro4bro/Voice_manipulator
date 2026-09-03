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

function Repair-VenvActivationScripts {
    $replacements = @(
        @{
            Path = Join-Path $root ".venv\Scripts\activate.bat"
            Pattern = '(?m)^set VIRTUAL_ENV=.*$'
            Replacement = 'for %%I in ("%~dp0..") do set "VIRTUAL_ENV=%%~fI"'
        },
        @{
            Path = Join-Path $root ".venv\Scripts\activate"
            Pattern = '(?m)^VIRTUAL_ENV=.*$'
            Replacement = 'VIRTUAL_ENV="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"'
        },
        @{
            Path = Join-Path $root ".venv\Scripts\activate.fish"
            Pattern = '(?m)^set -gx VIRTUAL_ENV .*$'
            Replacement = 'set -gx VIRTUAL_ENV (cd (dirname (status -f))/..; and pwd)'
        },
        @{
            Path = Join-Path $root ".venv\Scripts\activate.csh"
            Pattern = '(?m)^setenv VIRTUAL_ENV .*$'
            Replacement = 'setenv VIRTUAL_ENV "$cwd/.venv"'
        }
    )

    foreach ($entry in $replacements) {
        if (-not (Test-Path -LiteralPath $entry.Path)) { continue }
        $content = Get-Content -LiteralPath $entry.Path -Raw
        $replacement = [string]$entry.Replacement
        $updated = [regex]::Replace($content, $entry.Pattern, [System.Text.RegularExpressions.MatchEvaluator]{
            param($match)
            $replacement
        })
        if ($updated -ne $content) {
            Set-Content -LiteralPath $entry.Path -Value $updated -NoNewline -Encoding utf8
        }
    }
}

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

# Python generates absolute activation paths; make copied or moved venvs portable.
Repair-VenvActivationScripts

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

function Invoke-WebNpm {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    # CMD does not support a UNC working directory. pushd supplies a temporary drive.
    $command = 'pushd "' + $webRoot + '" && npm ' + $Arguments
    & cmd.exe /d /c $command
    if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

Invoke-WebNpm -Arguments "install" -FailureMessage "Không cài được dependency frontend."
Invoke-WebNpm -Arguments "run build" -FailureMessage "Frontend build thất bại."

Write-Host "`nSetup hoàn tất. Chạy start-pro4bro.bat để mở app." -ForegroundColor Green
