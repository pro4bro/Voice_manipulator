<#
.SYNOPSIS
    Save a screenshot from the clipboard into the feedback folder and print the
    Markdown line that references it.

.DESCRIPTION
    A chat agent can see an image you paste into its window, but it cannot write
    the binary to disk, so the picture never reaches the log and the record of
    why a round was rejected is lost. Take the screenshot, then run this: the file
    lands next to the log and you paste one line into the round's Feedback block.

.EXAMPLE
    Take a screenshot with Win+Shift+S, then:
    .\scripts\save-feedback-image.ps1 -Round R1 -Note "timeline trong khi phat"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^R\d+$')]
    [string]$Round,

    [string]$Note = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$projectRoot = Split-Path -Parent $PSScriptRoot
$feedbackRoot = Join-Path $projectRoot "docs\feedback"
New-Item -ItemType Directory -Force -Path $feedbackRoot | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$image = [System.Windows.Forms.Clipboard]::GetImage()
if (-not $image) {
    Write-Host "Clipboard khong co anh." -ForegroundColor Yellow
    Write-Host "Chup bang Win+Shift+S (anh vao clipboard), roi chay lai lenh nay." -ForegroundColor Yellow
    exit 1
}

# Sequential names keep several shots for one round in the order they were taken.
$existing = @(Get-ChildItem -LiteralPath $feedbackRoot -Filter "$Round-*.png" -ErrorAction SilentlyContinue)
$sequence = ($existing.Count + 1).ToString("00")
$fileName = "$Round-$sequence.png"
$destination = Join-Path $feedbackRoot $fileName

try {
    $image.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $image.Dispose()
}

$sizeKb = [math]::Round((Get-Item -LiteralPath $destination).Length / 1KB)
$caption = if ($Note) { $Note } else { "$Round feedback $sequence" }

Write-Host ""
Write-Host "Da luu: docs/feedback/$fileName  ($sizeKb KB)" -ForegroundColor Green
Write-Host ""
Write-Host "Dan dong nay vao muc Feedback cua $Round trong docs/STABILIZATION-LOG.md:" -ForegroundColor Cyan
Write-Host ""
Write-Host "![$caption](feedback/$fileName)"
Write-Host ""
Write-Host "Roi noi voi agent: doc anh do va ghi lai cach hieu cua no vao log." -ForegroundColor Cyan
