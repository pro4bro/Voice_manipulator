"""Native completion guard; the full runtime gate is exercised on the rebuilt bundle."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.parametrize("profile,deferred,failed,expected", [
    ("NoVibeVoice", True, False, True),
    ("All", True, False, True),
    ("NoVibeVoice", True, True, False),
    ("Core", True, False, False),
    ("NoVibeVoice", False, False, False),
])
def test_native_completion_requires_full_successful_deferred_gate(
    tmp_path: Path, profile: str, deferred: bool, failed: bool, expected: bool,
) -> None:
    powershell = shutil.which("powershell.exe")
    if not powershell:
        pytest.skip("native Windows PowerShell is required")
    bundle = tmp_path / "Portable With Spaces"
    bundle.mkdir()
    manifest_path = bundle / ".portable-bundle.json"
    manifest = {"schemaVersion": 1, "product": "Pro4Bro Voice Manipulator", "releaseVersion": "0.5.10",
                "profile": profile if profile in ("All", "NoVibeVoice") else "NoVibeVoice",
                "deferredBaseLayer": deferred, "baseLayerReady": False, "preserved": {"sentinel": 42}}
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    before = manifest_path.read_bytes()
    marker = bundle / ".bundle-incomplete"
    marker.write_text("Copy base folders then VERIFY.", encoding="utf-8")
    source = (ROOT / "scripts/test-portable-runtime.ps1").read_text(encoding="utf-8-sig")
    function = source[source.index("function Complete-DeferredBase"):source.index("if (-not [Environment]::Is64BitOperatingSystem")]
    status = "FAIL" if failed else "PASS"
    script = tmp_path / "complete.ps1"
    script.write_text(function + "\n" + f"""
$ErrorActionPreference = 'Stop'
$root = '{str(bundle).replace("'", "''")}'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root '.portable-bundle.json') | ConvertFrom-Json
$checks = @([pscustomobject]@{{id='bundle.app-layer';status='PASS'}}, [pscustomobject]@{{id='stt.runtime';status='{status}'}})
$completed = Complete-DeferredBase $root $manifest '{profile}' $checks
[ordered]@{{completed=$completed;markerExists=(Test-Path -LiteralPath (Join-Path $root '.bundle-incomplete'))}} | ConvertTo-Json
""", encoding="utf-8-sig")
    result = subprocess.run([powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
                            capture_output=True, text=True, timeout=15, check=True)
    output = json.loads(result.stdout)
    assert output == {"completed": expected, "markerExists": not expected}
    after = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    assert after["preserved"] == {"sentinel": 42}
    assert after["releaseVersion"] == "0.5.10"
    if expected:
        assert after["baseLayerReady"] is True
        assert after["baseLayerVerifiedAt"]
    else:
        assert manifest_path.read_bytes() == before
    assert not list(bundle.glob(".portable-base-verified-*.json"))
