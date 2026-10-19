[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$rootResult = & git -C $PSScriptRoot rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or -not $rootResult) {
    throw "Could not determine the repository root from scripts/."
}
$root = [System.IO.Path]::GetFullPath(($rootResult | Select-Object -First 1).Trim())
$runtimeRoot = Join-Path $root ".runtime\cosyvoice"
$venvRoot = Join-Path $runtimeRoot ".venv"
$python = Join-Path $venvRoot "Scripts\python.exe"
$engineRoot = Join-Path $root ".runtime\engines\research\CosyVoice"
$matchaRoot = Join-Path $engineRoot "third_party\Matcha-TTS"
$requirements = Join-Path $PSScriptRoot "requirements-cosyvoice-inference.txt"

function Resolve-Python311 {
    $candidates = @(
        $env:PRO4BRO_BOOTSTRAP_PYTHON,
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
        (Join-Path $env:ProgramFiles "Python311\python.exe"),
        (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($candidate in $candidates) {
        $version = & $candidate -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($LASTEXITCODE -eq 0 -and $version -eq "3.11") { return $candidate }
    }

    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        $resolved = & $launcher.Source -3.11 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $resolved -and (Test-Path -LiteralPath $resolved.Trim())) { return $resolved.Trim() }
    }
    throw "Python 3.11 was not found. Install CPython 3.11 or set PRO4BRO_BOOTSTRAP_PYTHON."
}

if (-not (Test-Path -LiteralPath $engineRoot -PathType Container)) {
    throw "CosyVoice checkout is missing: $engineRoot. Run scripts/provision-open-engines.py first."
}
if (-not (Test-Path -LiteralPath (Join-Path $engineRoot ".git"))) {
    throw "CosyVoice path is not a Git checkout: $engineRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $engineRoot "cosyvoice\cli\cosyvoice.py") -PathType Leaf)) {
    throw "CosyVoice inference source is missing from $engineRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $matchaRoot "matcha") -PathType Container)) {
    throw "CosyVoice Matcha-TTS submodule is missing: $matchaRoot"
}
$submoduleStatus = & git -C $engineRoot submodule status --recursive
if ($LASTEXITCODE -ne 0 -or ($submoduleStatus | Where-Object { $_ -match '^[\-+U]' })) {
    throw "CosyVoice submodules are missing or do not match the checked-out revision."
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    $bootstrap = Resolve-Python311
    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    & $bootstrap -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated CosyVoice virtual environment." }
}
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "CosyVoice virtual environment did not create its Python executable: $python"
}

& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "Could not upgrade pip in the CosyVoice environment." }

& $python -m pip install --index-url "https://download.pytorch.org/whl/cu121" "torch==2.3.1" "torchaudio==2.3.1"
if ($LASTEXITCODE -ne 0) { throw "Could not install Torch 2.3.1 and Torchaudio 2.3.1 CUDA 12.1 wheels." }

# Whisper's released setup.py imports pkg_resources, removed by newer setuptools.
& $python -m pip install "setuptools==75.8.2" wheel
if ($LASTEXITCODE -ne 0) { throw "Could not prepare the Whisper build environment." }
& $python -m pip install --prefer-binary --no-build-isolation -r $requirements
if ($LASTEXITCODE -ne 0) { throw "Could not install CosyVoice inference requirements." }

$probe = Join-Path $root "services\api\app\workers\cosyvoice_import_probe.py"
& $python $probe $engineRoot
if ($LASTEXITCODE -ne 0) { throw "CosyVoice model configuration imports failed in its isolated environment." }

Write-Host "CosyVoice inference runtime is ready at .runtime/cosyvoice/.venv" -ForegroundColor Green
