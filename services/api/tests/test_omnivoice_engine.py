from __future__ import annotations

from app.adapters.omnivoice_engine import OmniVoiceEngine


def test_engine_status_reports_upstream_checkout(tmp_path):
    engine_root = tmp_path / "OmniVoice"
    engine_root.mkdir()
    (engine_root / "README.md").write_text("# OmniVoice", encoding="utf-8")

    status = OmniVoiceEngine(engine_root).status()

    assert status.id == "omnivoice"
    assert status.installed is True
    assert status.path == str(engine_root.resolve())
    assert "text-to-speech" in status.capabilities
    assert "voice-training" in status.capabilities
    assert "speech-to-text" not in status.capabilities


def test_engine_status_is_honest_when_checkout_is_missing(tmp_path):
    status = OmniVoiceEngine(tmp_path / "missing").status()

    assert status.installed is False
    assert status.revision is None
    assert status.dirty is False
