[CmdletBinding()]
param(
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "status",
    [switch]$SkipWebBuild
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "pro4bro-process-tree.ps1")

$apiPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$apiRoot = Join-Path $projectRoot "services\api"
$webRoot = Join-Path $projectRoot "apps\web"
$webDist = Join-Path $webRoot "dist\index.html"
$apiUrl = "http://127.0.0.1:18120"
$studioUrl = "http://127.0.0.1:18081"
$dataRoot = Join-Path $projectRoot "data"
$runtimeRoot = Join-Path $dataRoot "runtime"
$sessionPath = Join-Path $runtimeRoot "pro4bro-services.json"
$logRoot = Join-Path $dataRoot "logs"
$studioRuntime = Join-Path $projectRoot ".runtime\omnivoice-studio"
$studioPython = Join-Path $studioRuntime ".venv\Scripts\python.exe"
$studioSource = Join-Path $projectRoot "services\stt_studio\studio_app"
$studioDestination = Join-Path $studioRuntime "studio_app"

function Get-ServiceState([int]$Port, [string]$ExpectedPattern) {
    $listener = Get-Pro4BroListener $Port | Select-Object -First 1
    if (-not $listener) {
        return [ordered]@{ state = "stopped"; pid = $null }
    }
    $processInfo = Get-Pro4BroProcess ([int]$listener.OwningProcess)
    if (Test-Pro4BroPython $processInfo $ExpectedPattern) {
        return [ordered]@{ state = "running"; pid = [int]$listener.OwningProcess }
    }
    return [ordered]@{ state = "foreign"; pid = [int]$listener.OwningProcess }
}

function Get-WorkloadStatus {
    $api = Get-ServiceState 18120 $script:Pro4BroModulePatterns.api
    $studio = Get-ServiceState 18081 $script:Pro4BroModulePatterns.studio
    $overall = if ($api.state -eq "running" -and $studio.state -eq "running") {
        "running"
    } elseif ($api.state -eq "foreign" -or $studio.state -eq "foreign") {
        "blocked"
    } elseif ($api.state -eq "stopped" -and $studio.state -eq "stopped") {
        "stopped"
    } else {
        "partial"
    }
    [ordered]@{ overall = $overall; api = $api; studio = $studio }
}

function Wait-Endpoint([string]$Uri, [int]$Attempts, [int]$DelayMilliseconds) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        try {
            if (Invoke-RestMethod -Uri $Uri -TimeoutSec 1) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds $DelayMilliseconds
        }
    }
    return $false
}

function Sync-StudioSource {
    if (-not (Test-Path -LiteralPath $studioSource) -or -not (Test-Path -LiteralPath $studioDestination)) {
        return
    }
    $resolvedSource = (Resolve-Path -LiteralPath $studioSource).Path
    $resolvedDestination = (Resolve-Path -LiteralPath $studioDestination).Path
    $resolvedProject = (Resolve-Path -LiteralPath $projectRoot).Path.TrimEnd('\')
    if (-not $resolvedSource.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not $resolvedDestination.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Studio sync paths must remain inside the Pro4Bro workspace."
    }
    Copy-Item -Path (Join-Path $resolvedSource "*") -Destination $resolvedDestination -Recurse -Force
}

function Get-NewestSourceWrite {
    <#
        The built bundle - not the source tree - is what the controller serves, so a
        code change is invisible until the bundle is rebuilt. Comparing write times
        makes "Restart all" apply frontend edits instead of silently reusing dist.
    #>
    $watched = @(
        (Join-Path $webRoot "src"),
        (Join-Path $webRoot "index.html"),
        (Join-Path $webRoot "vite.config.ts"),
        (Join-Path $webRoot "package.json"),
        (Join-Path $webRoot "tsconfig.json"),
        (Join-Path $webRoot "tsconfig.app.json")
    )
    $newest = [datetime]::MinValue
    foreach ($path in $watched) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $item = Get-Item -LiteralPath $path
        if ($item.PSIsContainer) {
            $latest = Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
            if ($latest -and $latest.LastWriteTimeUtc -gt $newest) { $newest = $latest.LastWriteTimeUtc }
        } elseif ($item.LastWriteTimeUtc -gt $newest) {
            $newest = $item.LastWriteTimeUtc
        }
    }
    return $newest
}

function Test-WebBundleStale {
    if (-not (Test-Path -LiteralPath $webDist)) { return $true }
    $bundleWrite = (Get-Item -LiteralPath $webDist).LastWriteTimeUtc
    return (Get-NewestSourceWrite) -gt $bundleWrite
}

function Invoke-WebBuild {
    Write-Host "Frontend source changed since the last build. Rebuilding bundle..." -ForegroundColor Cyan
    # CMD cannot use a UNC working directory; pushd maps a temporary drive.
    $command = 'pushd "' + $webRoot + '" && npm run build'
    & cmd.exe /d /c $command
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed. Fix the build error, then start Pro4Bro again." }
    Write-Host "Frontend bundle rebuilt." -ForegroundColor Green
}

function Stop-Workloads {
    Stop-Pro4BroPort 18081 "OmniVoice Studio" $script:Pro4BroModulePatterns.studio
    Stop-Pro4BroPort 18120 "Pro4Bro API" $script:Pro4BroModulePatterns.api
    # A listener check cannot see a workload whose interpreter already died but
    # whose stub, model worker, or FFmpeg child is still holding files open.
    Remove-Pro4BroOrphan $projectRoot @("api", "studio") | Out-Null
    Remove-Item -LiteralPath $sessionPath -Force -ErrorAction SilentlyContinue
}

function Start-Workloads {
    $before = Get-WorkloadStatus
    if ($before.overall -eq "blocked") {
        throw "A required port is occupied by a process that is not managed by Pro4Bro."
    }
    if ($before.overall -eq "running") {
        return
    }
    # Any non-stopped state means leftovers exist. Clear them and confirm both
    # ports are actually free before launching, so a restart can never observe a
    # dying listener and either abort or silently reuse the old build.
    if ($before.overall -ne "stopped") {
        Stop-Workloads
    }
    foreach ($port in 18081, 18120) {
        if (-not (Wait-Pro4BroPortFree $port)) {
            throw "Port $port did not become free. Run start-pro4bro.bat stop, then start again."
        }
    }

    if (-not (Test-Path -LiteralPath $apiPython)) {
        & (Join-Path $PSScriptRoot "setup-pro4bro.ps1")
    }
    if (-not $SkipWebBuild -and (Test-WebBundleStale)) {
        Invoke-WebBuild
    }
    if (-not (Test-Path -LiteralPath $studioPython) -or -not (Test-Path -LiteralPath (Join-Path $studioDestination "server.py"))) {
        throw "STT runtime is missing. Run scripts\setup-stt-runtime.ps1 first."
    }

    New-Item -ItemType Directory -Force -Path $dataRoot, $runtimeRoot, $logRoot | Out-Null
    Sync-StudioSource

    $workloadEnvironment = @{
        PRO4BRO_DATA_ROOT = $dataRoot
        PRO4BRO_OMNIVOICE_ROOT = (Join-Path $projectRoot "engines\OmniVoice")
        PRO4BRO_LEGACY_STUDIO_URL = $studioUrl
        PRO4BRO_STUDIO_ROOT = $studioRuntime
        PRO4BRO_STT_MODEL_ROOT = (Join-Path $studioRuntime "models")
        HF_HOME = (Join-Path $projectRoot ".cache\huggingface")
        HUGGINGFACE_HUB_CACHE = (Join-Path $projectRoot ".cache\huggingface\hub")
        TRANSFORMERS_CACHE = (Join-Path $projectRoot ".cache\huggingface\transformers")
        TORCH_HOME = (Join-Path $projectRoot ".cache\torch")
        HF_HUB_DISABLE_TELEMETRY = "1"
        HF_HUB_DISABLE_SYMLINKS_WARNING = "1"
        DO_NOT_TRACK = "1"
    }
    $localFfmpeg = Join-Path $projectRoot ".tools\ffmpeg\ffmpeg.exe"
    if (Test-Path -LiteralPath $localFfmpeg) {
        $workloadEnvironment.PRO4BRO_FFMPEG_PATH = $localFfmpeg
        $workloadEnvironment.PATH = "$(Split-Path -Parent $localFfmpeg);$env:PATH"
    }
    foreach ($entry in $workloadEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }

    $studioOut = Join-Path $logRoot "omnivoice-studio.out.log"
    $studioErr = Join-Path $logRoot "omnivoice-studio.err.log"
    $apiOut = Join-Path $logRoot "pro4bro-api.out.log"
    $apiErr = Join-Path $logRoot "pro4bro-api.err.log"
    $studioProcess = $null
    $apiProcess = $null
    try {
        $studioProcess = Start-Process -FilePath $studioPython -ArgumentList "-m", "studio_app.server", "--host", "127.0.0.1", "--port", "18081" -WorkingDirectory $studioRuntime -RedirectStandardOutput $studioOut -RedirectStandardError $studioErr -PassThru -WindowStyle Hidden
        if (-not (Wait-Endpoint "$studioUrl/api/status" 300 500)) {
            throw "OmniVoice Studio did not become ready within 150 seconds."
        }
        $apiProcess = Start-Process -FilePath $apiPython -ArgumentList "-m", "app" -WorkingDirectory $apiRoot -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
        if (-not (Wait-Endpoint "$apiUrl/api/health" 240 250)) {
            throw "Pro4Bro API did not become ready within 60 seconds."
        }
        [ordered]@{
            startedAt = [datetime]::UtcNow.ToString("o")
            apiPid = $apiProcess.Id
            studioPid = $studioProcess.Id
            root = $projectRoot
        } | ConvertTo-Json | Set-Content -LiteralPath $sessionPath -Encoding utf8
    } catch {
        if ($apiProcess) { Stop-Pro4BroTree $apiProcess.Id }
        if ($studioProcess) { Stop-Pro4BroTree $studioProcess.Id }
        throw
    }
}

switch ($Action) {
    "start" { Start-Workloads }
    "stop" { Stop-Workloads }
    "restart" { Stop-Workloads; Start-Workloads }
    "status" { }
}

Get-WorkloadStatus | ConvertTo-Json -Depth 4 -Compress
