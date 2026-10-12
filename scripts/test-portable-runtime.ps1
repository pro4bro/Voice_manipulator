[CmdletBinding()]
param(
    [ValidateSet("Core", "Capture", "STT", "Training", "All", "NoVibeVoice", "Auto")]
    [string]$Profile = "All",
    [string]$OutputPath,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd("\")
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Result {
    param([string]$Id, [string]$Status, [string]$Message, [string]$Path = "")
    $checks.Add([ordered]@{ id = $Id; status = $Status; message = $Message; path = $Path })
}

function Test-LocalPath {
    param([string]$Id, [string]$RelativePath, [string]$Description)
    $candidate = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $candidate)) {
        Add-Result $Id "FAIL" "$Description is missing." $candidate
        return
    }
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    if (-not ($resolved -eq $root -or $resolved.StartsWith("$root\", [System.StringComparison]::OrdinalIgnoreCase))) {
        Add-Result $Id "FAIL" "$Description resolves outside the application folder." $resolved
        return
    }
    Add-Result $Id "PASS" "$Description is local." $resolved
}

function Test-PythonRuntime {
    param([string]$Id, [string]$RelativeRoot, [string[]]$Imports)
    $runtimeRoot = Join-Path $root $RelativeRoot
    $python = Join-Path $runtimeRoot "python.exe"
    if (-not (Test-Path -LiteralPath $python)) {
        $python = Join-Path $runtimeRoot "Scripts\python.exe"
    }
    if (-not (Test-Path -LiteralPath $python)) {
        Add-Result $Id "FAIL" "Python runtime is missing." $python
        return
    }
    $config = Join-Path $runtimeRoot "pyvenv.cfg"
    if (Test-Path -LiteralPath $config) {
        $homeLine = Get-Content -LiteralPath $config | Where-Object { $_ -match '^home\s*=' } | Select-Object -First 1
        if ($homeLine) {
            $pythonHome = ($homeLine -split '=', 2)[1].Trim()
            $pythonHomeFull = [System.IO.Path]::GetFullPath($pythonHome)
            if (-not ($pythonHomeFull -eq $root -or $pythonHomeFull.StartsWith("$root\", [System.StringComparison]::OrdinalIgnoreCase))) {
                Add-Result $Id "FAIL" "Virtualenv depends on Python outside the application folder; rebuild it as a bundled runtime." $pythonHomeFull
                return
            }
        }
    }
    $pathFile = Join-Path $runtimeRoot "python311._pth"
    if (Test-Path -LiteralPath $pathFile) {
        $unsafePath = Get-Content -LiteralPath $pathFile | Where-Object {
            $line = $_.Trim()
            $line -and -not $line.StartsWith("#") -and -not $line.StartsWith("import ") -and [System.IO.Path]::IsPathRooted($line)
        } | Select-Object -First 1
        if ($unsafePath) {
            Add-Result $Id "FAIL" "Embedded Python contains an absolute search path: $unsafePath" $pathFile
            return
        }
    }
    if ($Imports.Count -gt 0) {
        $statement = ($Imports | ForEach-Object { "import $_" }) -join "; "
        & $python -c $statement 2>$null
        if ($LASTEXITCODE -ne 0) {
            Add-Result $Id "FAIL" "Python starts, but required imports failed: $($Imports -join ', ')." $python
            return
        }
    }
    Add-Result $Id "PASS" "Python runtime and required imports are ready." $python
}

function Test-NonEmptyTree {
    param([string]$Id, [string]$RelativePath, [string]$Description, [string]$Filter = "*")
    $candidate = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $candidate)) {
        Add-Result $Id "FAIL" "$Description is missing." $candidate
        return
    }
    $item = Get-ChildItem -LiteralPath $candidate -Recurse -File -Filter $Filter -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $item) {
        Add-Result $Id "FAIL" "$Description contains no matching files." $candidate
        return
    }
    Add-Result $Id "PASS" "$Description is present." $candidate
}

if (-not [Environment]::Is64BitOperatingSystem -or $env:OS -ne "Windows_NT") {
    Add-Result "host.windows-x64" "FAIL" "This bundle targets 64-bit Windows."
} else {
    Add-Result "host.windows-x64" "PASS" "64-bit Windows detected."
}

$bundleManifestPath = Join-Path $root ".portable-bundle.json"
$bundleProfile = $null
if (Test-Path -LiteralPath $bundleManifestPath -PathType Leaf) {
    try { $bundleProfile = (Get-Content -Raw -LiteralPath $bundleManifestPath | ConvertFrom-Json).profile } catch { }
}
$effectiveProfile = if ($Profile -eq "Auto") {
    if ($bundleProfile -eq "NoVibeVoice") { "NoVibeVoice" } else { "All" }
} else { $Profile }
$selected = if ($effectiveProfile -in @("All", "NoVibeVoice")) { @("Core", "Capture", "STT", "Training") } else { @($effectiveProfile) }

if ($selected -contains "Core") {
    Test-LocalPath "core.readiness" "scripts\pro4bro-readiness.ps1" "Runtime readiness helper"
    Test-LocalPath "core.web" "apps\web\dist\index.html" "Built web application"
    Test-LocalPath "core.ffmpeg" ".tools\ffmpeg\ffmpeg.exe" "FFmpeg"
    Test-LocalPath "core.ffprobe" ".tools\ffmpeg\ffprobe.exe" "FFprobe"
    Test-PythonRuntime "core.python" ".runtime\python\core" @("fastapi", "uvicorn", "numpy")
}

if ($selected -contains "Capture") {
    Test-LocalPath "capture.obs-plugin" "build\obs-plugin\RelWithDebInfo\pro4bro-obs-bridge.dll" "OBS bridge plugin"
    Test-LocalPath "capture.obs-config" "plugins\obs-pro4bro-bridge\config.example.json" "OBS bridge configuration template"
    Test-LocalPath "capture.obs-installer" "scripts\install-obs-plugin.ps1" "OBS bridge installer"
    $obsPackage = Join-Path $root "obs-plugin-package\manifest.json"
    if (-not (Test-Path -LiteralPath $obsPackage -PathType Leaf)) {
        $obsPackage = Join-Path $root "build\obs-plugin-package\manifest.json"
    }
    try {
        $obsManifest = Get-Content -Raw -LiteralPath $obsPackage | ConvertFrom-Json
        if ($obsManifest.schemaVersion -ne 1 -or $obsManifest.pluginId -ne "pro4bro-obs-bridge" -or @($obsManifest.files).Count -ne 3) {
            throw "OBS plugin manifest identity or file count is invalid."
        }
        $packageRoot = Split-Path -Parent $obsPackage
        foreach ($relative in @("bin/64bit/pro4bro-obs-bridge.dll", "data/locale/en-US.ini", "data/brand/pro4bro-livelink.svg")) {
            $entry = @($obsManifest.files | Where-Object { $_.source -eq $relative })
            if ($entry.Count -ne 1) { throw "OBS package manifest lacks $relative" }
            $file = Join-Path $packageRoot ($relative -replace '/', '\')
            if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "OBS package file is missing: $relative" }
            if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne [string]$entry[0].sha256) {
                throw "OBS package hash differs: $relative"
            }
        }
        Add-Result "capture.obs-package" "PASS" "OBS plugin DLL, locale and brand hashes match the installer manifest." $obsPackage
    } catch {
        Add-Result "capture.obs-package" "FAIL" "OBS plugin package verification failed: $($_.Exception.Message)" $obsPackage
    }
}

if ($selected -contains "STT") {
    Test-PythonRuntime "stt.python" ".runtime\python\stt" @("numpy", "faster_whisper", "whisperx")
    Test-LocalPath "stt.server" ".runtime\omnivoice-studio\studio_app\server.py" "STT service"
    # Presence/import checks cannot catch the UI disabling a shipped engine
    # because the production catalog resolves the development service path.
    $corePython = Join-Path $root ".runtime\python\core\python.exe"
    try {
        if (-not (Test-Path -LiteralPath $corePython -PathType Leaf)) { throw "Core Python is missing." }
        $catalogProbe = @'
from app.main import app
endpoint = next(route.endpoint for route in app.routes if getattr(route, "path", "") == "/api/stt-engines")
whisper = next(option for option in endpoint() if option.id == "faster-whisper")
assert whisper.available, whisper.status
print("Production STT catalog exposes faster-whisper as available.")
'@
        $catalogOutput = (& $corePython -c $catalogProbe 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw $catalogOutput }
        Add-Result "stt.catalog" "PASS" $catalogOutput
    } catch {
        Add-Result "stt.catalog" "FAIL" "Production STT catalog verification failed: $($_.Exception.Message)"
    }
    Test-NonEmptyTree "stt.whisper-large-v3" ".runtime\omnivoice-studio\models\models--Systran--faster-whisper-large-v3" "Final STT model" "model.bin"
    Test-NonEmptyTree "stt.whisper-medium" ".runtime\omnivoice-studio\models\models--Systran--faster-whisper-medium" "LiveLink STT model" "model.bin"
    Test-NonEmptyTree "stt.diarization-models" ".runtime\omnivoice-studio\models\diarization" "Speaker diarization models"
}

if ($selected -contains "Training") {
    Test-LocalPath "training.omnivoice-source" "engines\OmniVoice\pyproject.toml" "OmniVoice source"
    Test-PythonRuntime "training.omnivoice-python" ".runtime\python\omnivoice-training" @("torch", "torchaudio", "transformers", "accelerate", "peft")
    if ($effectiveProfile -ne "NoVibeVoice") {
        Test-PythonRuntime "training.vibevoice-python" ".runtime\python\vibevoice-training" @("torch", "transformers")
    }
    Test-PythonRuntime "training.rvc-python" ".runtime\python\rvc" @("torch", "numpy")
    Test-PythonRuntime "training.voice-changer-python" ".runtime\python\voice-changer" @("numpy", "sounddevice")
    if ($effectiveProfile -ne "NoVibeVoice") {
        Test-LocalPath "training.vibevoice-source" ".runtime\engines\vibevoice\VibeVoice\pyproject.toml" "Bundled VibeVoice source"
        Test-NonEmptyTree "training.vibevoice-models" ".runtime\engines\vibevoice\VibeVoice_models" "Bundled VibeVoice models" "*.safetensors"
    }
    Test-LocalPath "training.applio-source" ".runtime\engines\research\Applio\requirements.txt" "Bundled Applio source"
    Test-NonEmptyTree "training.model-hub" ".cache\huggingface\hub" "Bundled Hugging Face model cache" "*.safetensors"
    if ($effectiveProfile -eq "NoVibeVoice") {
        Test-NonEmptyTree "training.omnivoice-checkpoint" ".cache\huggingface\hub\models--k2-fsa--OmniVoice\snapshots" "OmniVoice checkpoint" "model.safetensors"
    }
}

if (Test-Path -LiteralPath $bundleManifestPath -PathType Leaf) {
    try {
        $bundleManifest = Get-Content -Raw -LiteralPath $bundleManifestPath | ConvertFrom-Json
        if ($bundleManifest.schemaVersion -ne 1 -or -not $bundleManifest.product) {
            Add-Result "bundle.manifest" "FAIL" "Portable bundle manifest has an unsupported schema." $bundleManifestPath
        } else {
            Add-Result "bundle.manifest" "PASS" "Portable bundle manifest is readable." $bundleManifestPath
        }
        if ($bundleProfile -and $effectiveProfile -in @("All", "NoVibeVoice") -and $bundleProfile -ne $effectiveProfile) {
            Add-Result "bundle.profile" "FAIL" "Requested profile differs from bundle manifest profile." $bundleManifestPath
        }
        if ($effectiveProfile -eq "NoVibeVoice") {
            $vibePaths = @(".runtime\python\vibevoice-training", ".runtime\engines\vibevoice")
            $present = @($vibePaths | Where-Object { Test-Path -LiteralPath (Join-Path $root $_) })
            if ($present.Count) {
                Add-Result "bundle.no-vibevoice" "FAIL" "VibeVoice payload is present: $($present -join ', ')." $root
            } else {
                Add-Result "bundle.no-vibevoice" "PASS" "VibeVoice runtime, source, and weights are absent." $root
            }
        }
        foreach ($critical in @($bundleManifest.criticalFiles)) {
            $criticalPath = Join-Path $root ([string]$critical.path)
            if (-not (Test-Path -LiteralPath $criticalPath -PathType Leaf)) {
                Add-Result "bundle.critical-file" "FAIL" "Manifest critical file is missing: $($critical.path)" $criticalPath
                continue
            }
            $actualHash = (Get-FileHash -LiteralPath $criticalPath -Algorithm SHA256).Hash
            if ($actualHash -ne [string]$critical.sha256) {
                Add-Result "bundle.critical-file" "FAIL" "Manifest critical file hash differs: $($critical.path)" $criticalPath
            }
        }
        if (@($checks | Where-Object { $_.id -eq "bundle.critical-file" -and $_.status -eq "FAIL" }).Count -eq 0) {
            Add-Result "bundle.critical-files" "PASS" "All critical bundle hashes match the manifest." $bundleManifestPath
        }
        $appLayerPath = Join-Path $root '.portable-app-layer.json'
        $modelLayerPath = Join-Path $root '.portable-model-layer.json'
        if ((Test-Path -LiteralPath $appLayerPath) -xor (Test-Path -LiteralPath $modelLayerPath)) {
            Add-Result 'bundle.layers' 'FAIL' 'App and base-model layer manifests must be present together.' $root
        } elseif (Test-Path -LiteralPath $appLayerPath) {
            $appLayer = Get-Content -Raw -LiteralPath $appLayerPath | ConvertFrom-Json
            $modelLayer = Get-Content -Raw -LiteralPath $modelLayerPath | ConvertFrom-Json
            if ($bundleManifest.releaseVersion) {
                if ([string]$bundleManifest.releaseVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
                    $bundleManifest.releaseChannel -notin @('alpha', 'stable') -or
                    $appLayer.releaseVersion -cne $bundleManifest.releaseVersion -or
                    $appLayer.releaseChannel -cne $bundleManifest.releaseChannel) {
                    Add-Result 'bundle.release' 'FAIL' 'App release version differs between bundle and app-layer manifests.' $appLayerPath
                } else {
                    Add-Result 'bundle.release' 'PASS' ("App release is {0} {1}." -f $bundleManifest.releaseChannel, $bundleManifest.releaseVersion) $appLayerPath
                }
            }
            $appComponentPaths = @('services/api', 'apps/web/dist', '.runtime/omnivoice-studio/studio_app', 'obs-plugin-package', 'scripts', 'build/obs-plugin/RelWithDebInfo/pro4bro-obs-bridge.dll', 'plugins/obs-pro4bro-bridge/config.example.json', 'start-pro4bro.bat', 'open-pro4bro-console.bat', 'restart-pro4bro.bat', 'VERIFY-PORTABLE.bat', 'INSTALL-OBS-PLUGIN.bat', 'UPDATE-PORTABLE.bat', 'PORTABLE-README.md')
            $mixedComponents = @($modelLayer.components | Where-Object { $_.path -in $appComponentPaths -or $_.path -like 'scripts/*' })
            if ($appLayer.schemaVersion -ne 1 -or $appLayer.kind -ne 'app' -or
                $modelLayer.schemaVersion -ne 1 -or $modelLayer.kind -ne 'base-runtime-and-models' -or
                $modelLayer.profile -ne $effectiveProfile -or $mixedComponents.Count) {
                Add-Result 'bundle.layers' 'FAIL' 'Portable layer manifest identity/profile is invalid.' $root
            } else {
                $appFailures = 0
                foreach ($entry in @($appLayer.entries)) {
                    $relative = [string]$entry.path
                    $path = if ($relative -and -not $relative.Contains(':') -and -not $relative.StartsWith('/') -and
                        -not @($relative.Replace('\', '/').Split('/') | Where-Object { $_ -in @('.', '..') }).Count) {
                        [IO.Path]::GetFullPath((Join-Path $root ($relative.Replace('/', '\'))))
                    } else { '' }
                    if (-not $path.StartsWith("$root\", [StringComparison]::OrdinalIgnoreCase) -or
                        -not (Test-Path -LiteralPath $path -PathType Leaf) -or
                        (Get-Item -LiteralPath $path).Length -ne [long]$entry.bytes -or
                        (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $entry.sha256) {
                        $appFailures++
                    }
                }
                if ($appFailures) {
                    Add-Result 'bundle.app-layer' 'FAIL' "$appFailures app-layer files are missing or changed." $appLayerPath
                } else {
                    Add-Result 'bundle.app-layer' 'PASS' "All $(@($appLayer.entries).Count) app-layer file hashes match." $appLayerPath
                }
                Add-Result 'bundle.model-layer' 'PASS' 'Base runtime/model layer inventory is separate from the app update.' $modelLayerPath
            }
        }
    } catch {
        Add-Result "bundle.manifest" "FAIL" "Portable bundle manifest could not be read: $($_.Exception.Message)" $bundleManifestPath
    }

    $forbidden = @(
        ".git",
        ".venv",
        "node_modules",
        ".runtime\python\.base",
        ".runtime\python\.downloads",
        ".runtime\omnivoice-studio\.venv",
        ".runtime\omnivoice-studio\installer-cache",
        ".cache\obs-studio-32.2.2",
        "services\api\tests"
    )
    $foundForbidden = @($forbidden | Where-Object { Test-Path -LiteralPath (Join-Path $root $_) })
    if ($foundForbidden.Count -gt 0) {
        Add-Result "bundle.exclusions" "FAIL" "Build-only content is present: $($foundForbidden -join ', ')." $root
    } else {
        Add-Result "bundle.exclusions" "PASS" "Build-only environments, caches, tests, and Git metadata are absent." $root
    }
    if (Test-Path -LiteralPath (Join-Path $root ".bundle-incomplete")) {
        Add-Result "bundle.complete" "FAIL" "Bundle creation did not complete." (Join-Path $root ".bundle-incomplete")
    } else {
        Add-Result "bundle.complete" "PASS" "Bundle completion marker is clean." $root
    }
}

$failed = @($checks | Where-Object { $_.status -eq "FAIL" }).Count
$passed = @($checks | Where-Object { $_.status -eq "PASS" }).Count
$report = [ordered]@{
    schemaVersion = 1
    profile = $effectiveProfile
    applicationRoot = $root
    portable = ($failed -eq 0)
    passed = $passed
    failed = $failed
    checkedAt = [DateTimeOffset]::Now.ToString("o")
    checks = $checks
}
$serialized = $report | ConvertTo-Json -Depth 6

if ($OutputPath) {
    $destination = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Set-Content -LiteralPath $destination -Value $serialized -Encoding utf8
}

if ($Json) {
    Write-Output $serialized
} else {
    foreach ($check in $checks) {
        $color = if ($check.status -eq "PASS") { "Green" } else { "Red" }
        Write-Host ("[{0}] {1}: {2}" -f $check.status, $check.id, $check.message) -ForegroundColor $color
        if ($check.path) { Write-Host ("       {0}" -f $check.path) -ForegroundColor DarkGray }
    }
    Write-Host ("`nPortable profile {0}: {1} passed, {2} failed." -f $Profile, $passed, $failed) -ForegroundColor $(if ($failed) { "Red" } else { "Green" })
}

if ($failed -gt 0) { exit 1 }
