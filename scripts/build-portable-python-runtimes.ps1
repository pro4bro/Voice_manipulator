[CmdletBinding()]
param(
    [ValidateSet("All", "Core", "STT", "OmniVoiceTraining", "VibeVoiceTraining", "RVC", "VoiceChanger")]
    [string[]]$Profiles = @("All"),
    [switch]$SkipDownload,
    [switch]$RefreshPathsOnly
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd("\")
$pythonRoot = Join-Path $root ".runtime\python"
$downloadRoot = Join-Path $pythonRoot ".downloads"
$baseRoot = Join-Path $pythonRoot ".base\cpython-3.11.9"
$archive = Join-Path $downloadRoot "python-3.11.9-embeddable-amd64.zip"
$downloadUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embeddable-amd64.zip"
$archiveSha256 = "33B448F95FECB7C6F802157DBD5E6B40A2AD9BFC8B95CA634A06BA4073AD1AC0"

$definitions = [ordered]@{
    Core = @{
        Name = "core"; Source = ".venv"
        Imports = @("fastapi", "uvicorn", "numpy", "app")
        Paths = @("../../../services/api")
    }
    STT = @{
        Name = "stt"; Source = ".runtime\omnivoice-studio\.venv"
        Imports = @("numpy", "faster_whisper", "whisperx", "pyannote.audio", "studio_app")
        Paths = @("../../omnivoice-studio")
    }
    OmniVoiceTraining = @{
        Name = "omnivoice-training"; Source = ".runtime\omnivoice-training\.venv"
        Imports = @("torch", "torchaudio", "transformers", "accelerate", "peft", "webdataset", "omnivoice")
        Paths = @("../../../services/api")
    }
    VibeVoiceTraining = @{
        Name = "vibevoice-training"; Source = ".runtime\vibevoice-training\.venv"
        Imports = @("torch", "transformers", "peft", "datasets", "diffusers", "vibevoice")
        Paths = @("../../engines/vibevoice/VibeVoice", "../../engines/vibevoice/VibeVoice-community", "../../../services/api")
    }
    RVC = @{
        Name = "rvc"; Source = ".runtime\rvc\.venv"
        Imports = @("torch", "numpy", "soundfile", "rvc", "sitecustomize")
        Paths = @("../../../services/api/app/workers/rvc_site", "../../engines/research/Applio", "../../engines/research/Applio/rvc/train", "../../../services/api")
    }
    VoiceChanger = @{
        Name = "voice-changer"; Source = ".runtime\voice-changer\.venv"
        Imports = @("numpy", "sounddevice")
        Paths = @("../../../services/api")
    }
}

if ($Profiles -contains "All") { $Profiles = @($definitions.Keys) }
$Profiles = @($Profiles | Select-Object -Unique)

New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
    if ($SkipDownload) { throw "Python archive is missing: $archive" }
    Write-Host "Downloading official CPython 3.11.9 embedded package..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archive
}
$actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
if ($actualHash -ne $archiveSha256) {
    throw "Python archive checksum mismatch. Expected $archiveSha256, got $actualHash."
}

if (-not (Test-Path -LiteralPath (Join-Path $baseRoot "python.exe"))) {
    New-Item -ItemType Directory -Force -Path $baseRoot | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $baseRoot -Force
}

if (-not ("PortableHardLink" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class PortableHardLink {
    [DllImport("Kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateHardLink(string newName, string existingName, IntPtr attributes);
    public static void Create(string newName, string existingName) {
        if (!CreateHardLink(newName, existingName, IntPtr.Zero)) {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
    }
}
"@
}

function Assert-InsideRoot([string]$Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    if (-not ($full -eq $root -or $full.StartsWith("$root\", [System.StringComparison]::OrdinalIgnoreCase))) {
        throw "Runtime path escaped the application root: $full"
    }
}

function Sync-SitePackages([string]$Source, [string]$Destination) {
    Assert-InsideRoot $Source
    Assert-InsideRoot $Destination
    if (-not (Test-Path -LiteralPath $Source)) { throw "Source site-packages is missing: $Source" }
    if ([System.IO.Path]::GetPathRoot($Source) -ne [System.IO.Path]::GetPathRoot($Destination)) {
        throw "Hardlink source and destination must use the same volume."
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $directories = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    [void]$directories.Add($Destination)
    $linked = 0
    $reused = 0
    $bytes = 0L
    Get-ChildItem -LiteralPath $Source -Recurse -File -Force | Where-Object {
        $_.Extension -ne ".pyc" -and $_.FullName -notmatch "[\\/]__pycache__[\\/]"
    } | ForEach-Object {
        $relative = $_.FullName.Substring($Source.Length).TrimStart("\")
        $target = Join-Path $Destination $relative
        $parent = Split-Path -Parent $target
        if ($directories.Add($parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        if (Test-Path -LiteralPath $target) {
            $existing = Get-Item -LiteralPath $target
            if ($existing.Length -eq $_.Length) {
                $reused++
                $bytes += $_.Length
                return
            }
            Assert-InsideRoot $target
            Remove-Item -LiteralPath $target -Force
        }
        [PortableHardLink]::Create($target, $_.FullName)
        $linked++
        $bytes += $_.Length
    }
    return [ordered]@{ linked = $linked; reused = $reused; files = $linked + $reused; bytes = $bytes }
}

$manifestPath = Join-Path $pythonRoot "runtime-manifest.json"
$manifestProfiles = [ordered]@{}
if (Test-Path -LiteralPath $manifestPath) {
    $old = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    foreach ($property in $old.profiles.PSObject.Properties) {
        $manifestProfiles[$property.Name] = $property.Value
    }
}

foreach ($profile in $Profiles) {
    $definition = $definitions[$profile]
    $sourceRoot = Join-Path $root $definition.Source
    $sourceSite = Join-Path $sourceRoot "Lib\site-packages"
    $destination = Join-Path $pythonRoot $definition.Name
    Write-Host "Preparing $profile runtime..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Get-ChildItem -LiteralPath $baseRoot -File -Force | Where-Object { $_.Name -ne "python311._pth" } |
        Copy-Item -Destination $destination -Force
    $pathLines = @("python311.zip", ".") + @($definition.Paths) + @("site-packages", "import site")
    Set-Content -LiteralPath (Join-Path $destination "python311._pth") -Value $pathLines -Encoding ascii
    if ($RefreshPathsOnly) {
        $previous = $manifestProfiles[$definition.Name]
        if ($null -eq $previous) { throw "Cannot refresh paths before building the $profile runtime." }
        $sync = [ordered]@{
            linked = [int64]$previous.linked
            reused = [int64]$previous.reused
            files = [int64]$previous.files
            bytes = [int64]$previous.bytes
        }
    } else {
        $sync = Sync-SitePackages $sourceSite (Join-Path $destination "site-packages")
    }
    $python = Join-Path $destination "python.exe"
    $statement = ($definition.Imports | ForEach-Object { "import $_" }) -join "; "
    & $python -c "$statement; print('READY $profile', __import__('sys').version)"
    if ($LASTEXITCODE -ne 0) { throw "$profile runtime import verification failed." }
    $manifestProfiles[$definition.Name] = [ordered]@{
        source = $definition.Source.Replace("\", "/")
        imports = $definition.Imports
        paths = $definition.Paths
        files = $sync.files
        bytes = $sync.bytes
        linked = $sync.linked
        reused = $sync.reused
    }
}

[ordered]@{
    schemaVersion = 1
    pythonVersion = "3.11.9"
    distribution = "windows-embeddable-amd64"
    sourceUrl = $downloadUrl
    sha256 = $archiveSha256
    generatedAt = [DateTimeOffset]::Now.ToString("o")
    profiles = $manifestProfiles
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Host "Portable Python runtimes are ready under .runtime/python." -ForegroundColor Green
