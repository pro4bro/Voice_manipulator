from __future__ import annotations

import struct
import wave

import pytest

from app.workers.speaker_embedder import _read_pcm16


def test_worker_preloads_pcm_wav_for_pyannote_without_torchcodec(tmp_path):
    audio_path = tmp_path / "stereo.wav"
    with wave.open(str(audio_path), "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(struct.pack("<hhhh", 1000, -1000, 2000, 0))

    waveform, sample_rate = _read_pcm16(audio_path)

    assert sample_rate == 16000
    assert waveform.shape == (2,)
    assert waveform.tolist()[0] == pytest.approx(0.0)
    assert waveform.tolist()[1] == pytest.approx(1000 / 32768)
