"""Engineering smoke evidence must measure real decoded PCM, not process success."""
import importlib.util
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf


def module():
    path = Path(__file__).resolve().parents[3] / "scripts/check-expressive-inference.py"
    spec = importlib.util.spec_from_file_location("expressive_smoke", path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_measures_float_peaks_and_boundaries_without_normalizing_source(tmp_path):
    target = tmp_path / "real-float.wav"
    pcm = np.concatenate([np.full(480, .1), np.full(480, 1.2), np.full(480, .3)]).astype("float32")
    sf.write(target, pcm, 24000, subtype="FLOAT")
    smoke = module()
    original = smoke.digest(target)
    evidence = smoke.audio_evidence(target)
    assert evidence["sampleRate"] == 24000 and evidence["channels"] == 1
    assert evidence["frames"] == 1440 and evidence["seconds"] == .06
    assert evidence["subtype"] == "FLOAT"
    assert evidence["peak"] == pytest.approx(1.2)
    assert evidence["fullScaleFraction"] == pytest.approx(1 / 3)
    assert evidence["first20msRms"] == pytest.approx(.1)
    assert evidence["last20msRms"] == pytest.approx(.3)
    assert evidence["firstSample"] == pytest.approx(.1)
    assert evidence["lastSample"] == pytest.approx(.3)
    assert evidence["maxAdjacentSampleDelta"] == pytest.approx(1.1)
    assert smoke.digest(target) == original == evidence["sha256"]


def test_detects_positive_pcm16_full_scale_below_float_one(tmp_path):
    target = tmp_path / "positive-clipped-pcm16.wav"
    sf.write(target, np.full(100, 1.2), 24000, subtype="PCM_16")
    evidence = module().audio_evidence(target)
    assert evidence["fullScaleFraction"] == 0
    assert evidence["nearFullScaleFraction"] == 1


@pytest.mark.parametrize("pcm", [np.zeros(100), np.full((100, 2), .2), np.array([.1, np.nan])])
def test_rejects_silent_multichannel_and_nonfinite_artifacts(tmp_path, pcm):
    target = tmp_path / "invalid.wav"
    sf.write(target, pcm, 24000, subtype="FLOAT")
    with pytest.raises(ValueError):
        module().audio_evidence(target)
