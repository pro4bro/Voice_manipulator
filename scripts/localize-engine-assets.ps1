[CmdletBinding()]
param(
    [string]$VibeVoiceSource,
    [string]$ResearchEnginesSource,
    [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd("\")

if (-not $VibeVoiceSource) { $VibeVoiceSource = Join-Path (Split-Path -Parent $root) "VibeVoice" }
if (-not $ResearchEnginesSource) { $ResearchEnginesSource = Join-Path (Split-Path -Parent $root) "research-engines" }

function Copy-LocalTree {
    param([string]$Source, [string]$Destination, [string]$Label)
    if (-not (Test-Path -LiteralPath $Source)) { throw "$Label source is missing: $Source" }
    $sourcePath = (Resolve-Path -LiteralPath $Source).Path.TrimEnd("\")
    $destinationPath = [System.IO.Path]::GetFullPath($Destination).TrimEnd("\")
    if ($sourcePath -eq $destinationPath -or $destinationPath.StartsWith("$sourcePath\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label destination must not be the source or one of its children."
    }
    if (-not ($destinationPath.StartsWith("$root\", [System.StringComparison]::OrdinalIgnoreCase))) {
        throw "$Label destination must stay inside the application folder."
    }
    New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
    & robocopy $sourcePath $destinationPath /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /MT:16 /NFL /NDL /NP `
        /XD .git .venv venv env .hf_cache .pip_cache outputs __pycache__ .cache /XF *.pyc
    if ($LASTEXITCODE -gt 7) { throw "$Label copy failed with robocopy code $LASTEXITCODE." }
    Write-Host "$Label is local at $destinationPath" -ForegroundColor Green
}

Copy-LocalTree $VibeVoiceSource (Join-Path $root ".runtime\engines\vibevoice") "VibeVoice"
Copy-LocalTree $ResearchEnginesSource (Join-Path $root ".runtime\engines\research") "Research engines"

if (-not $SkipAudit) {
    & (Join-Path $PSScriptRoot "test-portable-runtime.ps1") -Profile Training
    if ($LASTEXITCODE -ne 0) {
        throw "Engine assets are local, but the Training portability profile still has failures."
    }
}
