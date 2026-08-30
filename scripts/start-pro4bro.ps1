[CmdletBinding()]
param(
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Command = "start"
)

$controller = Join-Path $PSScriptRoot "pro4bro-console.ps1"
& $controller -Command $Command
exit $LASTEXITCODE
