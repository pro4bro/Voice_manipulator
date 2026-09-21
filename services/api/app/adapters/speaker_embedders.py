from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from app.domain.models import SpeakerEmbedderInfo

REPLY_PREFIX = "PRO4BRO_SPEAKER_EMBEDDER="
PROVISIONAL_THRESHOLD = 0.70


class SubprocessSpeakerEmbedder:
    """Runs pyannote in the ML runtime, keeping Torch out of the API process."""

    def __init__(self, python: Path, worker: Path, model: str, info: SpeakerEmbedderInfo) -> None:
        self.python = python
        self.worker = worker
        self.model = model
        self.info = info

    def compare(self, reference: Path, candidates: dict[str, Path]) -> dict[str, float]:
        if not self.info.available:
            raise RuntimeError(self.info.status)
        payload = {
            "model": self.model,
            "reference": str(reference),
            "candidates": {key: str(value) for key, value in candidates.items()},
        }
        process = subprocess.run(
            [str(self.python), str(self.worker)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            timeout=600,
            check=False,
        )
        reply = next((line[len(REPLY_PREFIX):] for line in process.stdout.splitlines() if line.startswith(REPLY_PREFIX)), None)
        if process.returncode or reply is None:
            detail = process.stderr.strip() or process.stdout.strip() or f"exit {process.returncode}"
            raise RuntimeError(f"Speaker embedding failed: {detail}")
        result = json.loads(reply)
        return {str(key): float(value) for key, value in result["scores"].items()}


def default_speaker_embedders(project_root: Path) -> dict[str, SubprocessSpeakerEmbedder]:
    runtime = project_root / ".runtime" / "omnivoice-studio" / ".venv"
    python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    worker = project_root / "services" / "api" / "app" / "workers" / "speaker_embedder.py"
    cache = project_root / ".runtime" / "omnivoice-studio" / "models" / "diarization"

    community_repo = cache / "models--pyannote--speaker-diarization-community-1"
    community_revision, community_model = _cached_model(community_repo, "embedding")
    dedicated_repo = cache / "models--pyannote--wespeaker-voxceleb-resnet34-LM"
    dedicated_revision, dedicated_model = _cached_model(dedicated_repo)

    runtime_ready = python.is_file() and worker.is_file()
    community_ready = runtime_ready and community_model is not None
    dedicated_ready = runtime_ready and dedicated_model is not None
    return {
        "pyannote-community-1": SubprocessSpeakerEmbedder(
            python,
            worker,
            str(community_model or ""),
            SpeakerEmbedderInfo(
                id="pyannote-community-1",
                label="Pyannote Community-1 embedding",
                model_id="pyannote/speaker-diarization-community-1:embedding",
                revision=community_revision or "not-installed",
                threshold=PROVISIONAL_THRESHOLD,
                calibrated=False,
                available=community_ready,
                status="ready; threshold awaits local calibration" if community_ready else "Community-1 embedding is not installed.",
            ),
        ),
        "wespeaker-resnet34-lm": SubprocessSpeakerEmbedder(
            python,
            worker,
            str(dedicated_model or ""),
            SpeakerEmbedderInfo(
                id="wespeaker-resnet34-lm",
                label="WeSpeaker ResNet34-LM",
                model_id="pyannote/wespeaker-voxceleb-resnet34-LM",
                revision=dedicated_revision or "not-installed",
                threshold=PROVISIONAL_THRESHOLD,
                calibrated=False,
                available=dedicated_ready,
                status="ready; threshold awaits local calibration" if dedicated_ready else "Dedicated WeSpeaker model must be installed through ModelStore.",
            ),
        ),
    }


def _cached_model(repository: Path, child: str | None = None) -> tuple[str | None, Path | None]:
    ref = repository / "refs" / "main"
    if not ref.is_file():
        return None, None
    revision = ref.read_text(encoding="utf-8").strip()
    model = repository / "snapshots" / revision
    if child:
        model /= child
    return (revision, model) if model.is_dir() or model.is_file() else (revision, None)
