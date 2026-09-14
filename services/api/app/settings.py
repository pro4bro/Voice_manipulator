from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    project_root: Path
    data_root: Path
    omnivoice_root: Path
    web_dist: Path
    training_runtime_root: Path
    training_wheel_cache: Path
    legacy_studio_url: str
    ffmpeg_path: str | None
    reading_packs_root: Path
    authored_reading_packs_root: Path
    # The folder holding the VibeVoice checkouts side by side
    # (VibeVoice, VibeVoice-community, ...). Absent is a normal state.
    vibevoice_root: Path
    # Pro4Bro's own Python for VibeVoice training and inference; see VibeVoicePaths.
    vibevoice_runtime_root: Path
    training_models_root: Path
    local_training_models_root: Path
    voice_generators_root: Path
    stt_engines_root: Path
    local_voice_generators_root: Path
    # A Hugging Face hub cache that already holds the engine weights. When set,
    # engine processes run offline against it: nothing is fetched, and a
    # missing model fails loudly instead of quietly downloading gigabytes.
    model_hub_cache: Path | None

    @classmethod
    def from_env(cls) -> "Settings":
        project_root = Path(__file__).resolve().parents[3]
        return cls(
            project_root=project_root,
            data_root=Path(os.getenv("PRO4BRO_DATA_ROOT", project_root / "data")),
            omnivoice_root=Path(
                os.getenv("PRO4BRO_OMNIVOICE_ROOT", project_root / "engines" / "OmniVoice")
            ),
            web_dist=project_root / "apps" / "web" / "dist",
            training_runtime_root=Path(
                os.getenv(
                    "PRO4BRO_TRAINING_RUNTIME_ROOT",
                    project_root / ".runtime" / "omnivoice-training" / ".venv",
                )
            ),
            training_wheel_cache=Path(
                os.getenv(
                    "PRO4BRO_TRAINING_WHEEL_CACHE",
                    project_root / ".runtime" / "omnivoice-studio" / "installer-cache",
                )
            ),
            legacy_studio_url=os.getenv("PRO4BRO_LEGACY_STUDIO_URL", "http://127.0.0.1:18081"),
            ffmpeg_path=os.getenv("PRO4BRO_FFMPEG_PATH"),
            reading_packs_root=Path(
                os.getenv(
                    "PRO4BRO_READING_PACKS_ROOT",
                    Path(__file__).resolve().parent / "resources" / "reading-packs",
                )
            ),
            authored_reading_packs_root=Path(
                os.getenv("PRO4BRO_DATA_ROOT", project_root / "data")
            )
            / "reading-packs",
            vibevoice_root=Path(
                os.getenv("PRO4BRO_VIBEVOICE_ROOT", project_root.parent / "VibeVoice")
            ),
            vibevoice_runtime_root=Path(
                os.getenv(
                    "PRO4BRO_VIBEVOICE_RUNTIME_ROOT",
                    project_root / ".runtime" / "vibevoice-training" / ".venv",
                )
            ),
            training_models_root=Path(
                os.getenv(
                    "PRO4BRO_TRAINING_MODELS_ROOT",
                    Path(__file__).resolve().parent / "resources" / "training-models",
                )
            ),
            local_training_models_root=Path(
                os.getenv("PRO4BRO_DATA_ROOT", project_root / "data")
            )
            / "training-models",
            voice_generators_root=Path(__file__).resolve().parent / "resources" / "voice-generators",
            stt_engines_root=Path(__file__).resolve().parent / "resources" / "stt-engines",
            local_voice_generators_root=Path(
                os.getenv("PRO4BRO_DATA_ROOT", project_root / "data")
            )
            / "voice-generators",
            model_hub_cache=_model_hub_cache(project_root),
        )


def _model_hub_cache(project_root: Path) -> Path | None:
    configured = os.getenv("PRO4BRO_HF_HUB_CACHE")
    if configured:
        return Path(configured)
    # The cache the original OmniVoice checkout filled beside this project,
    # which already holds k2-fsa/OmniVoice and its audio tokenizer.
    legacy = project_root.parent / "OmniVoice" / "OmniVoice" / ".cache" / "huggingface" / "hub"
    return legacy if legacy.is_dir() else None
