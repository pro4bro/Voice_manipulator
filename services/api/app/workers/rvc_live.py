"""RVC as a live Voice Changer engine, through Applio's own realtime conversion.

Imported by `voice_changer_worker.py` when the RVC runtime runs it; must not
import `app`. Applio does the conversion - its pipeline, SOLA alignment and
crossfade - on blocks at 48 kHz; this class only adapts the worker's blocks to
that and back, and says how much delay the conversion adds.
"""

from __future__ import annotations

import os
import sys

import numpy as np

APPLIO_RATE = 48000


class RvcLive:
    handles_silence = True

    def __init__(self, sample_rate: int, parameters: dict, target: dict | None) -> None:
        if not target or not target.get("model"):
            raise ValueError("Voice Changer RVC cần một voice RVC đã train (model .pth).")
        applio = os.environ.get("PRO4BRO_APPLIO_ROOT")
        if not applio:
            raise ValueError("Chưa cấu hình PRO4BRO_APPLIO_ROOT.")
        # Applio resolves its models and imports relative to its own folder.
        os.chdir(applio)
        if applio not in sys.path:
            sys.path.insert(0, applio)
        from rvc.realtime.core import VoiceChanger

        self.sample_rate = sample_rate
        self.block = max(64, int(sample_rate * float(parameters.get("block_ms") or 250) / 1000))
        self.block_48k = int(round(self.block * APPLIO_RATE / sample_rate))
        crossfade = float(parameters.get("crossfade_s") or 0.05)
        self.pitch = int(parameters.get("pitch_shift") or 0)
        self.index_rate = float(parameters.get("index_rate") if parameters.get("index_rate") is not None else 0.5)
        self.protect = float(parameters.get("protect") if parameters.get("protect") is not None else 0.5)
        self.changer = VoiceChanger(
            block_frame=self.block_48k,
            cross_fade_overlap_size=crossfade,
            extra_convert_size=float(parameters.get("extra_convert_s") or 2.5),
            model_path=target["model"],
            index_path=target.get("index") or "",
            f0_method="rmvpe",
            embedder_model="contentvec",
            silent_threshold=int(parameters.get("silence_gate_db") if parameters.get("silence_gate_db") is not None else -60),
        )
        # The converted block trails the spoken one by the crossfade Applio holds
        # back; the recorder measures the rest from the audio.
        self.delay_samples = int(round(crossfade * sample_rate))

    def _resample(self, samples: np.ndarray, source: int, target: int, count: int) -> np.ndarray:
        if source == target and samples.size == count:
            return samples.astype(np.float32, copy=False)
        positions = np.linspace(0, samples.size - 1, count)
        return np.interp(positions, np.arange(samples.size), samples).astype(np.float32)

    def process(self, block: np.ndarray) -> np.ndarray:
        audio = self._resample(block, self.sample_rate, APPLIO_RATE, self.block_48k)
        converted, _volume, _timings = self.changer.on_request(audio, f0_up_key=self.pitch, index_rate=self.index_rate, protect=self.protect)
        return self._resample(np.asarray(converted, dtype=np.float32), APPLIO_RATE, self.sample_rate, block.size)
