# Shared, verified process-tree control for every Pro4Bro launcher script.
#
# A venv `python.exe` on Windows is a launcher stub that re-executes the base
# interpreter, so the process that owns a port is a *grandchild* of the script
# that started it. Killing only the listener leaves the stub behind, and killing
# without waiting lets the next start observe a port that is still in Listen
# state. Every helper here therefore works on whole trees and waits for real
# exit before reporting success.

$script:Pro4BroModulePatterns = [ordered]@{
    controller = '(?i)-m\s+app\.runtime_controller(\s|$)'
    api        = '(?i)-m\s+app(\s|$)'
    studio     = '(?i)-m\s+studio_app\.server(\s|$)'
}

function Get-Pro4BroProcess([int]$ProcessId) {
    if ($ProcessId -le 0) { return $null }
    Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Test-Pro4BroPython($ProcessInfo, [string]$ExpectedPattern) {
    if (-not $ProcessInfo) { return $false }
    if ($ProcessInfo.Name -notmatch "^python(w)?(\.exe)?$") { return $false }
    return $ProcessInfo.CommandLine -match $ExpectedPattern
}

function Get-Pro4BroListener([int]$Port) {
    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-Pro4BroDescendantIds([int]$ProcessId) {
    # Win32_Process only exposes one parent link, so walk breadth-first over a
    # single snapshot instead of querying per level.
    $snapshot = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $collected = New-Object System.Collections.Generic.List[int]
    $frontier = New-Object System.Collections.Generic.List[int]
    $frontier.Add($ProcessId) | Out-Null
    while ($frontier.Count -gt 0) {
        $current = $frontier[0]
        $frontier.RemoveAt(0)
        foreach ($candidate in $snapshot) {
            $childId = [int]$candidate.ProcessId
            if ($candidate.ParentProcessId -ne $current) { continue }
            if ($collected.Contains($childId) -or $childId -eq $ProcessId) { continue }
            $collected.Add($childId) | Out-Null
            $frontier.Add($childId) | Out-Null
        }
    }
    return $collected
}

function Stop-Pro4BroTree([int]$ProcessId, [int]$TimeoutSeconds = 20) {
    if ($ProcessId -le 0) { return }
    $targets = @(Get-Pro4BroDescendantIds $ProcessId)
    # Children first: a stub that outlives its interpreter cannot resurrect it.
    $ordered = @($targets) + @($ProcessId)
    foreach ($target in $ordered) {
        try { Stop-Process -Id $target -Force -ErrorAction Stop } catch { }
    }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    foreach ($target in $ordered) {
        while ((Get-Date) -lt $deadline) {
            if (-not (Get-Process -Id $target -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 100
        }
    }
}

function Wait-Pro4BroPortFree([int]$Port, [int]$TimeoutSeconds = 20) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Pro4BroListener $Port)) { return $true }
        Start-Sleep -Milliseconds 150
    }
    return -not (Get-Pro4BroListener $Port)
}

function Stop-Pro4BroPort([int]$Port, [string]$Label, [string]$ExpectedPattern) {
    foreach ($listener in (Get-Pro4BroListener $Port)) {
        $listenerId = [int]$listener.OwningProcess
        $processInfo = Get-Pro4BroProcess $listenerId
        if (-not $processInfo) { continue }
        if (-not (Test-Pro4BroPython $processInfo $ExpectedPattern)) {
            throw "$Label on port $Port is not a verified Pro4Bro process; it was not stopped."
        }
        # Climb to the venv launcher stub so the whole pair goes down together.
        $rootId = $listenerId
        $parent = Get-Pro4BroProcess ([int]$processInfo.ParentProcessId)
        if (Test-Pro4BroPython $parent $ExpectedPattern) { $rootId = [int]$parent.ProcessId }
        Stop-Pro4BroTree $rootId
    }
    if (-not (Wait-Pro4BroPortFree $Port)) {
        throw "$Label still holds port $Port after being stopped. Close the process manually and retry."
    }
}

function Get-Pro4BroRootAlias([string]$ProjectRoot) {
    <#
        The same workspace can be launched through a mapped drive letter or through
        its UNC share, and a process started one way records that spelling forever.
        Matching only the current spelling would leave the other one's workloads
        running, so resolve both and match either.
    #>
    $resolved = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\')
    $aliases = New-Object System.Collections.Generic.List[string]
    $aliases.Add($resolved) | Out-Null
    if ($resolved -match '^([A-Za-z]):(\\.*)?$') {
        $letter = $Matches[1]
        $remainder = $Matches[2]
        $mapped = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID = '$($letter):'" -ErrorAction SilentlyContinue
        if ($mapped -and $mapped.ProviderName) {
            $aliases.Add(($mapped.ProviderName.TrimEnd('\') + $remainder)) | Out-Null
        }
    } else {
        foreach ($disk in @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType = 4" -ErrorAction SilentlyContinue)) {
            if (-not $disk.ProviderName) { continue }
            $share = $disk.ProviderName.TrimEnd('\')
            if ($resolved.StartsWith($share, [System.StringComparison]::OrdinalIgnoreCase)) {
                $aliases.Add(($disk.DeviceID + $resolved.Substring($share.Length))) | Out-Null
            }
        }
    }
    return $aliases
}

function Remove-Pro4BroOrphan([string]$ProjectRoot, [string[]]$Roles) {
    <#
        Reclaim workloads that survived an unclean shutdown - the classic case is
        closing the launcher window with its X button, where PowerShell never runs
        its finally block. Only the venv stub carries this project's path on its
        command line, so it is the one safe identity anchor; its interpreter child
        is reached through the tree walk.
    #>
    $rootPatterns = @(Get-Pro4BroRootAlias $ProjectRoot | ForEach-Object { [regex]::Escape($_) })
    $reclaimed = 0
    foreach ($candidate in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
        if ($candidate.Name -notmatch "^python(w)?(\.exe)?$") { continue }
        $commandLine = [string]$candidate.CommandLine
        if (-not $commandLine) { continue }
        $inWorkspace = $false
        foreach ($rootPattern in $rootPatterns) {
            if ($commandLine -match $rootPattern) { $inWorkspace = $true; break }
        }
        if (-not $inWorkspace) { continue }
        foreach ($role in $Roles) {
            if ($commandLine -match $script:Pro4BroModulePatterns[$role]) {
                Stop-Pro4BroTree ([int]$candidate.ProcessId)
                $reclaimed += 1
                break
            }
        }
    }
    return $reclaimed
}
