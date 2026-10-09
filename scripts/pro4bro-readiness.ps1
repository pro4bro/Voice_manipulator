# Readiness is HTTP health plus the continued life of the process we launched.
# Keep model/device initialization out of this probe.
function Preserve-Pro4BroStartupLogs([string[]]$LogPaths) {
    foreach ($logPath in $LogPaths) {
        try {
            if (-not (Test-Path -LiteralPath $logPath -PathType Leaf)) { continue }
            $log = Get-Item -LiteralPath $logPath -ErrorAction Stop
            if ($log.Length -le 0) { continue }

            $logRoot = Split-Path -Parent $log.FullName
            $historyRoot = Join-Path $logRoot "startup-history"
            New-Item -ItemType Directory -Force -Path $historyRoot -ErrorAction Stop | Out-Null
            $timestamp = [datetime]::UtcNow.ToString("yyyyMMdd'T'HHmmss.fffffff'Z'")
            $unique = [guid]::NewGuid().ToString("N")
            $archiveName = "{0}.{1}.{2}.log" -f $log.BaseName, $timestamp, $unique
            Copy-Item -LiteralPath $log.FullName -Destination (Join-Path $historyRoot $archiveName) `
                -ErrorAction Stop
        } catch {
            # Diagnostics are best-effort; a filesystem issue must never block launch.
        }
    }
}

function Wait-Pro4BroReady(
    [string]$Label,
    [System.Diagnostics.Process]$Process,
    [string]$Uri,
    [int]$TimeoutSeconds,
    [string]$LogPath,
    [int]$DelayMilliseconds = 250
) {
    $clock = [System.Diagnostics.Stopwatch]::StartNew()
    $port = ([uri]$Uri).Port
    $lastProbe = 'not-probed'
    function Write-ReadinessEvidence([string]$State) {
        $Process.Refresh()
        $alive = -not $Process.HasExited
        $exitCode = if ($alive) { '-' } else { $Process.ExitCode }
        $listeners = @(Get-Pro4BroListener $port | ForEach-Object { $_.OwningProcess }) -join ','
        if (-not $listeners) { $listeners = '-' }
        $line = '[{0}] readiness service="{1}" state={2} elapsed={3:F3}s expectedPid={4} alive={5} exit={6} port={7} listener={8} probe={9}' -f `
            ([datetime]::UtcNow.ToString('o')), $Label, $State, $clock.Elapsed.TotalSeconds, `
            $Process.Id, $alive, $exitCode, $port, $listeners, $lastProbe
        # Logging must not make an otherwise healthy startup fail.
        try { Add-Content -LiteralPath $LogPath -Encoding utf8 -Value $line } catch { }
    }
    Write-ReadinessEvidence 'waiting'
    while ($clock.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $Process.Refresh()
        if ($Process.HasExited) {
            Write-ReadinessEvidence 'exited'
            throw "$Label exited before readiness (PID $($Process.Id), exit $($Process.ExitCode)). See $LogPath."
        }
        try {
            $health = Invoke-RestMethod -Uri $Uri -TimeoutSec 1
            $lastProbe = if ($health.status -eq 'ok') { 'ok' } else { 'invalid-health' }
        } catch {
            $lastProbe = $_.Exception.GetType().Name
        }
        $Process.Refresh()
        if ($lastProbe -eq 'ok' -and -not $Process.HasExited) {
            Write-ReadinessEvidence 'ready'
            return
        }
        $remaining = $TimeoutSeconds * 1000 - $clock.Elapsed.TotalMilliseconds
        if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int][Math]::Min($DelayMilliseconds, $remaining)) }
    }
    $Process.Refresh()
    if ($Process.HasExited) {
        Write-ReadinessEvidence 'exited'
        throw "$Label exited before readiness (PID $($Process.Id), exit $($Process.ExitCode)). See $LogPath."
    }
    Write-ReadinessEvidence 'timeout'
    throw "$Label readiness timed out after $TimeoutSeconds seconds with PID $($Process.Id) still alive. See $LogPath."
}
