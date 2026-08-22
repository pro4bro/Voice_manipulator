[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$engineRoot = Join-Path $root "engines\OmniVoice"

if (-not (Test-Path -LiteralPath (Join-Path $engineRoot ".git"))) {
    throw "Không tìm thấy checkout OmniVoice tại $engineRoot. Hãy chạy setup-pro4bro.ps1."
}

$dirty = & git -C $engineRoot status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Không đọc được trạng thái Git của OmniVoice." }
if ($dirty) {
    throw "OmniVoice đang có thay đổi cục bộ. Update đã dừng để không ghi đè dữ liệu."
}

$before = & git -C $engineRoot rev-parse --short=12 HEAD
& git -C $engineRoot fetch origin
if ($LASTEXITCODE -ne 0) { throw "Không fetch được upstream OmniVoice." }
& git -C $engineRoot pull --ff-only
if ($LASTEXITCODE -ne 0) { throw "Không thể fast-forward OmniVoice; không có file nào bị ép ghi đè." }
$after = & git -C $engineRoot rev-parse --short=12 HEAD

if ($before -eq $after) {
    Write-Host "OmniVoice đã ở revision mới nhất: $after" -ForegroundColor Green
}
else {
    Write-Host "OmniVoice đã cập nhật: $before -> $after" -ForegroundColor Green
    Write-Host "Chạy lại test trước khi dùng pipeline production." -ForegroundColor DarkGray
}
