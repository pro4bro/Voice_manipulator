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
        )
