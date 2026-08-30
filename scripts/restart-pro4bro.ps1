[CmdletBinding()]
param(
    [switch]$WorkloadsOnly
)

$ErrorActionPreference = "Stop"

# Default to a full-stack restart. Restarting only API and Studio cannot pick up
# changes to the runtime controller, which is the process serving the web UI.
if ($WorkloadsOnly) {
    & (Join-Path $PSScriptRoot "pro4bro-workloads.ps1") -Action restart
} else {
    & (Join-Path $PSScriptRoot "pro4bro-console.ps1") -Command restart
}
exit $LASTEXITCODE
