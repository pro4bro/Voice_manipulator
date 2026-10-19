[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$rootResult = & git -C $PSScriptRoot rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or -not $rootResult) {
    throw "Could not determine the repository root from scripts/."
}
$root = [System.IO.Path]::GetFullPath(($rootResult | Select-Object -First 1).Trim())
$repo = Join-Path $root ".runtime\engines\research\sokuji"
$sidecar = Join-Path $repo "sidecar"
$runtime = Join-Path $root ".runtime\sokuji"
$venv = Join-Path $runtime ".venv"
$python = Join-Path $venv "Scripts\python.exe"

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

if (-not (Test-Path -LiteralPath (Join-Path $sidecar "sokuji_sidecar\__main__.py") -PathType Leaf)) {
    throw "Sokuji sidecar checkout is missing: $sidecar"
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    $bootstrap = Resolve-Python311
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    & $bootstrap -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated Sokuji virtual environment." }
}
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Sokuji virtual environment did not create its Python executable: $python"
}

& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "Could not upgrade pip in the Sokuji environment." }

& $python -m pip install --prefer-binary -r (Join-Path $sidecar "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Could not install the official Sokuji sidecar requirements." }

$env:PYTHONPATH = $sidecar
Push-Location $sidecar
try {
    & $python -c "import sokuji_native, websockets, sokuji_sidecar; print('Sokuji sidecar imports OK; websockets', websockets.__version__)"
    if ($LASTEXITCODE -ne 0) { throw "Sokuji sidecar runtime import check failed." }
}
finally {
    Pop-Location
}

Write-Host "Sokuji sidecar runtime is ready at .runtime/sokuji/.venv" -ForegroundColor Green
