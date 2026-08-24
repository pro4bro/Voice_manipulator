[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Stop-Pro4BroServer {
    param(
        [int]$Port,
        [string]$ExpectedCommand,
        [string]$Label
    )

    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction Stop
        if ($process.Name -ne "python.exe" -or $process.CommandLine -notmatch $ExpectedCommand) {
            throw "Port $Port is used by $($process.Name), not the expected $Label process. It was not stopped."
        }
        Write-Host "Stopping $Label (PID $($listener.OwningProcess))..." -ForegroundColor DarkGray
        Stop-Process -Id $listener.OwningProcess -Force
    }
}

Stop-Pro4BroServer -Port 18120 -ExpectedCommand '(?i)-m\s+app(\s|$)' -Label "Pro4Bro API"
Stop-Pro4BroServer -Port 18081 -ExpectedCommand '(?i)-m\s+studio_app\.server(\s|$)' -Label "OmniVoice Studio"
Start-Sleep -Milliseconds 600

& (Join-Path $root "start-pro4bro.bat")
exit $LASTEXITCODE
