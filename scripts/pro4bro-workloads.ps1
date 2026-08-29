[CmdletBinding()]
param(
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$projectRoot = Split-Path -Parent $PSScriptRoot
$apiPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$apiRoot = Join-Path $projectRoot "services\api"
$webDist = Join-Path $projectRoot "apps\web\dist\index.html"
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

function Get-Listener([int]$Port) {
    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-ListenerProcess($Listener) {
    Get-CimInstance Win32_Process -Filter "ProcessId = $($Listener.OwningProcess)" -ErrorAction SilentlyContinue
}

function Test-ExpectedProcess($ProcessInfo, [string]$ExpectedPattern) {
    $ProcessInfo -and $ProcessInfo.Name -match "^python(\.exe)?$" -and $ProcessInfo.CommandLine -match $ExpectedPattern
}

function Get-ServiceState([int]$Port, [string]$ExpectedPattern) {
    $listener = Get-Listener $Port | Select-Object -First 1
    if (-not $listener) {
        return [ordered]@{ state = "stopped"; pid = $null }
    }
    $processInfo = Get-ListenerProcess $listener
    if (Test-ExpectedProcess $processInfo $ExpectedPattern) {
        return [ordered]@{ state = "running"; pid = [int]$listener.OwningProcess }
    }
    return [ordered]@{ state = "foreign"; pid = [int]$listener.OwningProcess }
}

function Get-WorkloadStatus {
    $api = Get-ServiceState 18120 '(?i)-m\s+app(\s|$)'
    $studio = Get-ServiceState 18081 '(?i)-m\s+studio_app\.server(\s|$)'
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

function Stop-ExpectedPort([int]$Port, [string]$Label, [string]$ExpectedPattern) {
    foreach ($listener in (Get-Listener $Port)) {
        $processInfo = Get-ListenerProcess $listener
        if (-not (Test-ExpectedProcess $processInfo $ExpectedPattern)) {
            throw "$Label on port $Port is not a verified Pro4Bro process; it was not stopped."
        }
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
    }
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

function Stop-Workloads {
    Stop-ExpectedPort 18081 "OmniVoice Studio" '(?i)-m\s+studio_app\.server(\s|$)'
    Stop-ExpectedPort 18120 "Pro4Bro API" '(?i)-m\s+app(\s|$)'
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
    if ($before.overall -eq "partial") {
        Stop-Workloads
    }
    if (-not (Test-Path -LiteralPath $apiPython) -or -not (Test-Path -LiteralPath $webDist)) {
        & (Join-Path $PSScriptRoot "setup-pro4bro.ps1")
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
        if ($apiProcess -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue }
        if ($studioProcess -and -not $studioProcess.HasExited) { Stop-Process -Id $studioProcess.Id -Force -ErrorAction SilentlyContinue }
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
