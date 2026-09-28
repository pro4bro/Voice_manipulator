from __future__ import annotations

from pathlib import Path

from app.settings import Settings


def _inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def test_runtime_defaults_stay_inside_application_folder(monkeypatch):
    for name in (
        "PRO4BRO_DATA_ROOT",
        "PRO4BRO_OMNIVOICE_ROOT",
        "PRO4BRO_TRAINING_RUNTIME_ROOT",
        "PRO4BRO_TRAINING_WHEEL_CACHE",
        "PRO4BRO_VIBEVOICE_ROOT",
        "PRO4BRO_VIBEVOICE_RUNTIME_ROOT",
        "PRO4BRO_VOICE_CHANGER_RUNTIME_ROOT",
        "PRO4BRO_RESEARCH_ENGINES_ROOT",
        "PRO4BRO_APPLIO_ROOT",
        "PRO4BRO_RVC_RUNTIME_ROOT",
        "PRO4BRO_HF_HUB_CACHE",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = Settings.from_env()
    local_paths = (
        settings.data_root,
        settings.omnivoice_root,
        settings.web_dist,
        settings.training_runtime_root,
        settings.training_wheel_cache,
        settings.vibevoice_root,
        settings.vibevoice_runtime_root,
        settings.voice_changer_runtime_root,
        settings.research_engines_root,
        settings.applio_root,
        settings.rvc_runtime_root,
        settings.model_hub_cache,
    )

    assert all(path is not None and _inside(path, settings.project_root) for path in local_paths)
    assert settings.vibevoice_root == settings.project_root / ".runtime" / "engines" / "vibevoice"
    assert settings.applio_root == settings.project_root / ".runtime" / "engines" / "research" / "Applio"
    assert settings.training_runtime_root == settings.project_root / ".runtime" / "python" / "omnivoice-training"
    assert settings.vibevoice_runtime_root == settings.project_root / ".runtime" / "python" / "vibevoice-training"
    assert settings.rvc_runtime_root == settings.project_root / ".runtime" / "python" / "rvc"
    assert settings.voice_changer_runtime_root == settings.project_root / ".runtime" / "python" / "voice-changer"


def test_explicit_engine_override_is_preserved(monkeypatch, tmp_path):
    external = tmp_path / "VibeVoice"
    monkeypatch.setenv("PRO4BRO_VIBEVOICE_ROOT", str(external))

    assert Settings.from_env().vibevoice_root == external
