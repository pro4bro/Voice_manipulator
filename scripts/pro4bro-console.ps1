[CmdletBinding()]
param(
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Command = "start"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "pro4bro-process-tree.ps1")

$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$apiRoot = Join-Path $projectRoot "services\api"
$webDist = Join-Path $projectRoot "apps\web\dist\index.html"
$controllerUrl = "http://127.0.0.1:18119"
$workloadScript = Join-Path $PSScriptRoot "pro4bro-workloads.ps1"
$logRoot = Join-Path $projectRoot "data\logs"
$consoleOwnerPath = Join-Path $projectRoot "data\runtime\pro4bro-console.json"

$jobObjectSource = @'
using System;
using System.Runtime.InteropServices;

public static class Pro4BroJobObject
{
    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public Int64 PerProcessUserTimeLimit;
        public Int64 PerJobUserTimeLimit;
        public UInt32 LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public UInt32 ActiveProcessLimit;
        public UIntPtr Affinity;
        public UInt32 PriorityClass;
        public UInt32 SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public UInt64 ReadOperationCount;
        public UInt64 WriteOperationCount;
        public UInt64 OtherOperationCount;
        public UInt64 ReadTransferCount;
        public UInt64 WriteTransferCount;
        public UInt64 OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint infoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    private const int JobObjectExtendedLimitInformation = 9;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    // Held for the lifetime of this process on purpose. Windows terminates every
    // member of the job when the last handle closes, so the whole Pro4Bro stack
    // dies with this console - Ctrl+C, the window's X button, taskkill, or a crash.
    private static IntPtr handle = IntPtr.Zero;

    public static bool CaptureCurrentProcessTree()
    {
        if (handle != IntPtr.Zero) { return true; }
        IntPtr created = CreateJobObject(IntPtr.Zero, null);
        if (created == IntPtr.Zero) { return false; }

        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr buffer = Marshal.AllocHGlobal(length);
        try
        {
            Marshal.StructureToPtr(limits, buffer, false);
            if (!SetInformationJobObject(created, JobObjectExtendedLimitInformation, buffer, (uint)length))
            {
                return false;
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }

        IntPtr self = System.Diagnostics.Process.GetCurrentProcess().Handle;
        if (!AssignProcessToJobObject(created, self)) { return false; }
        handle = created;
        return true;
    }
}
'@

function Enable-ProcessTreeOwnership {
    <#
        Job membership is inherited, so assigning this console makes the
        controller, the workload launcher, the API, the Studio sidecar, and every
        FFmpeg or model child a member too. Nothing can outlive this window.
    #>
    try {
        if (-not ([System.Management.Automation.PSTypeName]"Pro4BroJobObject").Type) {
            Add-Type -TypeDefinition $jobObjectSource -Language CSharp -ErrorAction Stop
        }
        return [Pro4BroJobObject]::CaptureCurrentProcessTree()
    } catch {
        return $false
    }
}

function Test-ControllerProcess($ProcessInfo) {
    return Test-Pro4BroPython $ProcessInfo $script:Pro4BroModulePatterns.controller
}

$HeartbeatSeconds = 30
$script:Pro4BroServices = @(
    @{ Role = "controller"; Label = "Runtime controller"; Port = 18119; Pattern = $script:Pro4BroModulePatterns.controller },
    @{ Role = "api";        Label = "Pro4Bro API";        Port = 18120; Pattern = $script:Pro4BroModulePatterns.api },
    @{ Role = "studio";     Label = "OmniVoice Studio";   Port = 18081; Pattern = $script:Pro4BroModulePatterns.studio }
)

function Get-ServiceRows {
    <#
        One row per managed listener: who holds the port, and whether it is ours.
        A port that is merely occupied is not the same as a service that is up,
        and the operator needs to be able to tell those apart at a glance.
    #>
    foreach ($service in $script:Pro4BroServices) {
        $listener = Get-Pro4BroListener $service.Port | Select-Object -First 1
        if (-not $listener) {
            [pscustomobject]@{ Label = $service.Label; Port = $service.Port; State = "STOPPED"; Pid = $null }
            continue
        }
        $owner = Get-Pro4BroProcess ([int]$listener.OwningProcess)
        $state = if (Test-Pro4BroPython $owner $service.Pattern) { "RUNNING" } else { "FOREIGN" }
        [pscustomobject]@{ Label = $service.Label; Port = $service.Port; State = $state; Pid = [int]$listener.OwningProcess }
    }
}

function Get-ServiceSignature {
    ((Get-ServiceRows | ForEach-Object { "$($_.Port):$($_.State):$($_.Pid)" }) -join "|")
}

function Write-ServiceTable([string]$Reason) {
    $rows = @(Get-ServiceRows)
    $stamp = (Get-Date).ToString("HH:mm:ss")
    Write-Host ""
    Write-Host "  [$stamp] $Reason" -ForegroundColor DarkGray
    foreach ($row in $rows) {
        $colour = switch ($row.State) {
            "RUNNING" { "Green" }
            "FOREIGN" { "Red" }
            default   { "DarkYellow" }
        }
        $pidText = if ($null -eq $row.Pid) { "-" } else { $row.Pid }
        Write-Host ("    {0,-20} port {1}  " -f $row.Label, $row.Port) -NoNewline
        Write-Host ("{0,-8}" -f $row.State) -ForegroundColor $colour -NoNewline
        Write-Host " pid $pidText"
    }
    if ($rows | Where-Object { $_.State -eq "FOREIGN" }) {
        Write-Host "    Mot process khac dang giu port. Chay start-pro4bro.bat stop roi start lai." -ForegroundColor Red
    }
    Set-WindowTitleFrom $rows
}

function Write-Heartbeat {
    $rows = @(Get-ServiceRows)
    $summary = ($rows | ForEach-Object { "$($_.Label.Split(' ')[0].ToLower())=$($_.State.ToLower())" }) -join "  "
    Write-Host ("  [{0}] {1}" -f (Get-Date).ToString("HH:mm:ss"), $summary) -ForegroundColor DarkGray
    Set-WindowTitleFrom $rows
}

function Set-WindowTitleFrom($Rows) {
    # The title carries the state even when the window is minimised or scrolled.
    $running = @($Rows | Where-Object { $_.State -eq "RUNNING" }).Count
    $title = if ($Rows | Where-Object { $_.State -eq "FOREIGN" }) {
        "Pro4Bro - PORT BLOCKED"
    } elseif ($running -eq $Rows.Count) {
        "Pro4Bro - RUNNING ($running/$($Rows.Count))"
    } elseif ($running -eq 0) {
        "Pro4Bro - STOPPED"
    } else {
        "Pro4Bro - PARTIAL ($running/$($Rows.Count))"
    }
    try { $Host.UI.RawUI.WindowTitle = $title } catch { }
}

function Stop-Controller {
    foreach ($listener in (Get-Pro4BroListener 18119)) {
        $listenerId = [int]$listener.OwningProcess
        $processInfo = Get-Pro4BroProcess $listenerId
        if (-not $processInfo) { continue }
        if (-not (Test-ControllerProcess $processInfo)) {
            throw "Port 18119 is not owned by the verified Pro4Bro controller; it was not stopped."
        }
        $rootId = $listenerId
        $parent = Get-Pro4BroProcess ([int]$processInfo.ParentProcessId)
        if (Test-ControllerProcess $parent) { $rootId = [int]$parent.ProcessId }
        Stop-Pro4BroTree $rootId
    }
    Remove-Pro4BroOrphan $projectRoot @("controller") | Out-Null
    if (-not (Wait-Pro4BroPortFree 18119)) {
        throw "The Pro4Bro controller still holds port 18119. Close it manually and retry."
    }
}

function Wait-Controller {
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri "$controllerUrl/api/runtime/health" -TimeoutSec 1
            if ($health.status -eq "ok") { return $true }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    return $false
}

function Open-Workspace {
    # Hand the URL to the shell rather than spawning the browser here. A browser
    # started as our child would join the kill-on-close job and be closed with the
    # console, which is never what the operator wants.
    try {
        Start-Process -FilePath "explorer.exe" -ArgumentList $controllerUrl -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "Open $controllerUrl in a browser." -ForegroundColor Yellow
    }
}

function Stop-FullStack {
    & $workloadScript -Action stop | Out-Null
    Stop-Controller
    Remove-Item -LiteralPath $consoleOwnerPath -Force -ErrorAction SilentlyContinue
}

function Test-ConsoleOwnership {
    if (-not (Test-Path -LiteralPath $consoleOwnerPath)) { return $false }
    try {
        $owner = Get-Content -LiteralPath $consoleOwnerPath -Raw | ConvertFrom-Json
    } catch {
        return $false
    }
    return [int]$owner.consolePid -eq $PID
}

if ($Command -eq "status") {
    $listener = Get-Pro4BroListener 18119 | Select-Object -First 1
    if ($listener) {
        $processInfo = Get-Pro4BroProcess ([int]$listener.OwningProcess)
        $state = if (Test-ControllerProcess $processInfo) { "RUNNING" } else { "IN USE (not managed)" }
        Write-Host "Pro4Bro Controller $state - PID $($listener.OwningProcess)"
    } else {
        Write-Host "Pro4Bro Controller STOPPED"
    }
    & $workloadScript -Action status
    exit $LASTEXITCODE
}

if ($Command -eq "stop") {
    Stop-FullStack
    Write-Host "Pro4Bro controller and all workloads are stopped." -ForegroundColor Green
    exit 0
}

if ($Command -eq "restart") {
    # A full-stack restart is the only way to load changes to the controller
    # itself, because the controller cannot replace the process serving its own UI.
    # This branch runs before job ownership is taken, so the relaunched window is
    # independent of this one.
    Stop-FullStack
    Write-Host "Full stack stopped. Relaunching in a new window..." -ForegroundColor Cyan
    Start-Process -FilePath (Join-Path $projectRoot "start-pro4bro.bat") | Out-Null
    exit 0
}

$ownsProcessTree = Enable-ProcessTreeOwnership

if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $webDist)) {
    & (Join-Path $PSScriptRoot "setup-pro4bro.ps1")
}
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

$existing = Get-Pro4BroListener 18119 | Select-Object -First 1
if ($existing) {
    $processInfo = Get-Pro4BroProcess ([int]$existing.OwningProcess)
    if (-not (Test-ControllerProcess $processInfo)) {
        throw "Port 18119 is occupied by a process that is not managed by Pro4Bro."
    }
    # A controller from an earlier window is not inside this console's job, so it
    # would survive this window and keep serving the previous build. Replace it.
    Write-Host "Reclaiming a Pro4Bro stack left over from a previous session..." -ForegroundColor Yellow
    Stop-FullStack
}
# Reclaim workloads whose launcher window was closed without an orderly shutdown.
$reclaimed = Remove-Pro4BroOrphan $projectRoot @("controller", "api", "studio")
if ($reclaimed -gt 0) {
    Write-Host "  Reclaimed $reclaimed orphaned Pro4Bro process tree(s)." -ForegroundColor Yellow
    # Also durable: a window that is gone cannot answer why the next start had
    # to clean up after it.
    try {
        $actionLog = Join-Path $logRoot "pro4bro-runtime-actions.log"
        New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
        Add-Content -LiteralPath $actionLog -Encoding utf8 -Value (
            "`n[{0}] reclaimed {1} orphaned process tree(s) before start" -f `
                ([datetime]::UtcNow.ToString("o")), $reclaimed)
    } catch { }
}

$controllerOut = Join-Path $logRoot "pro4bro-controller.out.log"
$controllerErr = Join-Path $logRoot "pro4bro-controller.err.log"
$controllerProcess = Start-Process -FilePath $python -ArgumentList "-m", "app.runtime_controller", "--host", "127.0.0.1", "--port", "18119" -WorkingDirectory $apiRoot -RedirectStandardOutput $controllerOut -RedirectStandardError $controllerErr -PassThru -WindowStyle Hidden

# The owner record lets a later window take over cleanly: whoever is named here
# performs teardown, so a replaced window never stops the stack its successor
# just started.
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $consoleOwnerPath) | Out-Null
[ordered]@{ consolePid = $PID; controllerPid = $controllerProcess.Id; startedAt = [datetime]::UtcNow.ToString("o") } |
    ConvertTo-Json | Set-Content -LiteralPath $consoleOwnerPath -Encoding utf8

try {
    if (-not (Wait-Controller)) {
        throw "Pro4Bro controller did not become ready within 30 seconds."
    }
    & $workloadScript -Action start
    Open-Workspace
    Write-Host ""
    Write-Host "  Pro4Bro is available at $controllerUrl" -ForegroundColor Green
    Write-Host "  Windows menu controls API, STT and background workloads." -ForegroundColor Cyan
    if ($ownsProcessTree) {
        Write-Host "  Closing this window stops every Pro4Bro process. Ctrl+C does the same." -ForegroundColor Cyan
    } else {
        Write-Host "  Process-tree ownership unavailable; use Ctrl+C or start-pro4bro.bat stop." -ForegroundColor Yellow
    }
    Write-Host "  Run start-pro4bro.bat restart to reload controller code changes." -ForegroundColor Cyan

    Write-ServiceTable "STARTED"
    $lastSignature = Get-ServiceSignature
    $lastHeartbeat = Get-Date

    # This window is the operator's only view of whether the stack is up, so it
    # reports rather than sitting silent: a line whenever a service changes state,
    # and a heartbeat often enough to prove the window itself is still alive.
    # It watches its own controller process rather than the port - a window that
    # replaced us must not read as a healthy stack, nor our exit as theirs.
    while (-not $controllerProcess.HasExited) {
        Start-Sleep -Seconds 2
        $signature = Get-ServiceSignature
        if ($signature -ne $lastSignature) {
            Write-ServiceTable "CHANGED"
            $lastSignature = $signature
            $lastHeartbeat = Get-Date
        } elseif (((Get-Date) - $lastHeartbeat).TotalSeconds -ge $HeartbeatSeconds) {
            Write-Heartbeat
            $lastHeartbeat = Get-Date
        }
    }
    Write-Host ""
    Write-Host "  Controller exited. Shutting the rest of the stack down." -ForegroundColor Yellow
} finally {
    if (Test-ConsoleOwnership) {
        try { & $workloadScript -Action stop | Out-Null } catch { }
        try { Stop-Pro4BroTree $controllerProcess.Id } catch { }
        Remove-Item -LiteralPath $consoleOwnerPath -Force -ErrorAction SilentlyContinue
    }
}
