[CmdletBinding()]
param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$rootResult = & git -C $PSScriptRoot rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or -not $rootResult) {
    throw "Could not determine the repository root from scripts/."
}
$root = [System.IO.Path]::GetFullPath(($rootResult | Select-Object -First 1).Trim())
$runtimeRoot = Join-Path $root ".runtime\w-okada"
$venvRoot = Join-Path $runtimeRoot ".venv-py310"
$python = Join-Path $venvRoot "Scripts\python.exe"
$engineRoot = Join-Path $root ".runtime\engines\research\w-okada-voice-changer"
$serverRoot = Join-Path $engineRoot "server"
$requirements = Join-Path $serverRoot "requirements.txt"
$report = Join-Path $runtimeRoot "official-requirements-dry-run.json"
$probe = Join-Path $PSScriptRoot "probe-w-okada-runtime.py"
$fairseqRoot = Join-Path $root ".runtime\engines\research\fairseq-w-okada"
$fairseqRevision = "4a388e64cd646ed7d7ad8de8fae55df2b8eea91d"

function Resolve-Python310 {
    $candidates = @(
        $env:PRO4BRO_BOOTSTRAP_PYTHON,
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python310\python.exe"),
        (Join-Path $env:ProgramFiles "Python310\python.exe"),
        (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($candidate in $candidates) {
        $version = & $candidate -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($LASTEXITCODE -eq 0 -and $version -eq "3.10") { return $candidate }
    }

    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        $resolved = & $launcher.Source -3.10 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $resolved -and (Test-Path -LiteralPath $resolved.Trim())) { return $resolved.Trim() }
    }
    throw "Python 3.10 was not found. Install CPython 3.10 or set PRO4BRO_BOOTSTRAP_PYTHON."
}

if (-not (Test-Path -LiteralPath (Join-Path $engineRoot ".git") -PathType Container)) {
    throw "w-okada checkout is missing or has no Git metadata: $engineRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $serverRoot "MMVCServerSIO.py") -PathType Leaf)) {
    throw "w-okada server entrypoint is missing: $serverRoot"
}
if (-not (Test-Path -LiteralPath $requirements -PathType Leaf)) {
    throw "w-okada server requirements are missing: $requirements"
}

$bootstrap = Resolve-Python310
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    & $bootstrap -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated w-okada virtual environment." }
}
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "w-okada virtual environment did not create its Python executable: $python"
}

# Use the resolver validated with Fairseq's legacy OmegaConf metadata.
& $python -m pip install --disable-pip-version-check "pip==22.3.1"
if ($LASTEXITCODE -ne 0) { throw "Could not prepare the legacy w-okada dependency resolver." }

Write-Host "Checking official w-okada server requirements with CPython 3.10; no packages are installed by this check."
& $python -m pip install --disable-pip-version-check --no-input --dry-run --no-deps --report $report -r $requirements
if ($LASTEXITCODE -ne 0) {
    throw "Official w-okada requirements do not resolve for this Python/platform. Inspect the pip error and $report; no runtime packages were installed."
}

if (-not $Install) {
    Write-Host "Official direct requirements resolved. Re-run with -Install to install and run the import-only probe." -ForegroundColor Yellow
    return
}

& $python -m pip install --prefer-binary -r $requirements
if ($LASTEXITCODE -ne 0) { throw "Could not install the official w-okada server requirements." }

# RVC imports these dependencies although upstream requirements.txt omits them.
# The Fairseq PyPI sdist omits libbase/balanced_assignment.cpp; build the complete
# official v0.12.2 checkout instead. Never reset an existing checkout.
if (-not (Test-Path -LiteralPath (Join-Path $fairseqRoot ".git"))) {
    & git clone --depth 1 --branch v0.12.2 "https://github.com/facebookresearch/fairseq.git" $fairseqRoot
    if ($LASTEXITCODE -ne 0) { throw "Could not download the official Fairseq source." }
}
$fairseqHead = & git -C $fairseqRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $fairseqHead.Trim() -ne $fairseqRevision) {
    throw "Fairseq checkout does not match the supported v0.12.2 revision: $fairseqRoot"
}
& git -C $fairseqRoot diff --quiet HEAD --
if ($LASTEXITCODE -ne 0) { throw "Fairseq checkout has tracked changes; inspect them before building." }
& $python -m pip install "Cython==0.29.37" "wheel==0.48.0" "pyworld==0.3.4"
if ($LASTEXITCODE -ne 0) { throw "Could not prepare Fairseq/RVC build dependencies." }
& $python -m pip install --no-build-isolation $fairseqRoot
if ($LASTEXITCODE -ne 0) { throw "Could not build the pinned Fairseq source; inspect the C++ compiler output." }

$env:PYTHONPATH = if ($env:PYTHONPATH) { "$serverRoot;$env:PYTHONPATH" } else { $serverRoot }
Push-Location $serverRoot
try {
    & $python $probe
    if ($LASTEXITCODE -ne 0) { throw "w-okada server/RVC module import probe failed." }
} finally {
    Pop-Location
}

Write-Host "w-okada import-only runtime probe passed at .runtime/w-okada/.venv-py310" -ForegroundColor Green
