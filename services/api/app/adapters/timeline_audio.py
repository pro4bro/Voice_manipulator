from __future__ import annotations

import wave
from pathlib import Path

from app.domain.models import ProjectMediaAsset
from app.domain.timeline_intervals import excluded_intervals, included_intervals


def prepare_diarization_audio(source: Path, asset: ProjectMediaAsset) -> tuple[Path, list[tuple[float, float]] | None]:
    """Read only retained PCM; the project-owned source remains byte identical."""
    if not excluded_intervals(asset):
        return source, None
    kept = included_intervals(asset)
    if not kept:
        raise ValueError("Toàn bộ footage đã bị loại. Hãy Uncut hoặc Reset trước khi nhận diện speaker.")
    destination = source.with_name("analysis-diarization-edited.wav")
    with wave.open(str(source), "rb") as original:
        params = original.getparams()
        with wave.open(str(destination), "wb") as output:
            output.setparams(params)
            for start, end in kept:
                first, last = round(start * params.framerate), round(end * params.framerate)
                original.setpos(min(first, original.getnframes()))
                output.writeframes(original.readframes(max(0, last - first)))
    return destination, kept
