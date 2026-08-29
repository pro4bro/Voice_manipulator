[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "pro4bro-workloads.ps1") -Action restart
exit $LASTEXITCODE
