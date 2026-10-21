param([string]$TorchCache = '')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEnv = Join-Path $taskRoot '.runtime/lipsync-musetalk-py311'
if (!(Test-Path (Join-Path $taskEnv 'Scripts/python.exe'))) {
  py -3.11 -m venv $taskEnv
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 venv creation failed' }
}
$taskPython = Join-Path $taskEnv 'Scripts/python.exe'
if ($TorchCache) {
  # Optional local package cache: copy bytes, never share writable packages.
  $taskCache = (Resolve-Path -LiteralPath $TorchCache).Path
  $taskVersion = & (Join-Path $taskCache 'Scripts/python.exe') -c 'import torch,sys; assert sys.version_info[:2] == (3,11); assert torch.__version__ == "2.3.1+cu121"; print(torch.__version__)'
  if ($LASTEXITCODE -ne 0) { throw 'Incompatible Torch cache' }
  $taskSite = Join-Path $taskEnv 'Lib/site-packages'
  foreach ($taskPackage in @('torch','torch-2.3.1+cu121.dist-info','functorch','torchgen')) {
    Copy-Item -LiteralPath (Join-Path $taskCache "Lib/site-packages/$taskPackage") -Destination $taskSite -Recurse -Force
  }
} else {
  & $taskPython -m pip install torch==2.3.1 --index-url https://download.pytorch.org/whl/cu121 --timeout 30
  if ($LASTEXITCODE -ne 0) { throw 'Torch install failed' }
}
& $taskPython -m pip install -r (Join-Path $PSScriptRoot 'lipsync-requirements.txt') torch==2.3.1 torchvision==0.18.1
if ($LASTEXITCODE -ne 0) { throw 'Inference dependencies failed' }
& $taskPython -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Dependency check failed' }
& $taskPython (Join-Path $PSScriptRoot 'check-lipsync-runtime.py')
if ($LASTEXITCODE -ne 0) { throw 'Runtime probe failed' }
