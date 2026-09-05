[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $root ".runtime\omnivoice-training\.venv"
$wheelCache = Join-Path $root ".runtime\omnivoice-studio\installer-cache"
$engineRoot = Join-Path $root "engines\OmniVoice"
$python = Join-Path $runtimeRoot "Scripts\python.exe"

function Resolve-Python311 {
    $candidates = @(
        $env:PRO4BRO_BOOTSTRAP_PYTHON,
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
        (Join-Path $env:ProgramFiles "Python311\python.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    if ($candidates.Count -eq 0) {
        throw "Không tìm thấy Python 3.11. Cài Python 3.11 hoặc đặt PRO4BRO_BOOTSTRAP_PYTHON."
    }
    return @($candidates)[0]
}

if (-not (Test-Path -LiteralPath $python)) {
    $bootstrap = Resolve-Python311
    & $bootstrap -m venv $runtimeRoot
    if ($LASTEXITCODE -ne 0) { throw "Không tạo được training runtime." }
}

if (-not (Test-Path -LiteralPath $engineRoot)) {
    throw "Không tìm thấy engines/OmniVoice trong checkout hiện tại."
}

& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "Không nâng cấp được pip." }

$torchWheel = Get-ChildItem -LiteralPath $wheelCache -Filter "torch-*-cp311-*.whl" -File -ErrorAction SilentlyContinue | Select-Object -First 1
$torchVersion = "2.8.0+cu128"
if ($torchWheel) {
    & $python -m pip install --no-deps $torchWheel.FullName
    if ($LASTEXITCODE -ne 0) { throw "Không cài được cached torch wheel." }
    if ($torchWheel.BaseName -match "^torch-(?<version>[^-]+)-") {
        $torchVersion = $Matches.version
    }
}

& $python -m pip install --index-url "https://download.pytorch.org/whl/cu128" --no-deps "torchaudio==$torchVersion"
if ($LASTEXITCODE -ne 0) { throw "Không cài được torchaudio tương thích với torch $torchVersion." }

$packages = @(
    "transformers>=5.3.0",
    "accelerate",
    "peft>=0.20.0",
    "webdataset",
    "pydub",
    "tensorboardX",
    "numpy",
    "soundfile",
    "librosa"
)
& $python -m pip install --prefer-binary @packages
if ($LASTEXITCODE -ne 0) { throw "Không cài được dependency training." }

& $python -m pip install --no-deps $engineRoot
if ($LASTEXITCODE -ne 0) { throw "Không cài được OmniVoice từ checkout." }

& $python -c "import accelerate, omnivoice, peft, torch, torchaudio, transformers, webdataset; print('Training runtime ready:', transformers.__version__)"
if ($LASTEXITCODE -ne 0) { throw "Training runtime chưa import được đầy đủ package." }

Write-Host "Training runtime đã sẵn sàng tại .runtime/omnivoice-training/.venv" -ForegroundColor Green
