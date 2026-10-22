import hashlib
import json
import wave

import pytest

from app.adapters.voice_output_audio import CanonicalVoiceOutputAudio


ROOT = __import__("pathlib").Path(__file__).resolve().parents[3]
FFMPEG = ROOT / ".tools" / "ffmpeg" / "ffmpeg.exe"
FFPROBE = ROOT / ".tools" / "ffmpeg" / "ffprobe.exe"


def write_pcm(path, rate, frames=2400):
    with wave.open(str(path), "wb") as wav:
        wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        wav.writeframes(b"\x01\x00" * frames)


def write_float(path, rate, frames=2400):
    import soundfile as sf
    import numpy as np

    sf.write(path, np.full(frames, 0.1, dtype=np.float32), rate, subtype="FLOAT")


@pytest.mark.parametrize("rate", [24000, 22050, 44100])
def test_canonicalizes_native_rates_with_measured_header_and_provenance(tmp_path, rate):
    native, published = tmp_path / "native-audio.wav", tmp_path / "audio.wav"
    write_pcm(native, rate)
    artifact = CanonicalVoiceOutputAudio(FFMPEG, FFPROBE).publish(native, published)

    with wave.open(str(published), "rb") as wav:
        assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (24000, 1, 2)
        assert wav.getnframes() > 0
    assert artifact.published.duration == pytest.approx(artifact.published.frames / 24000)
    assert artifact.native.sample_rate == rate
    assert artifact.native.duration == pytest.approx(2400 / rate)
    assert artifact.native.path == "native-audio.wav"
    assert artifact.published.path == "audio.wav"
    assert artifact.native.sha256 == hashlib.sha256(native.read_bytes()).hexdigest()
    assert artifact.published.sha256 == hashlib.sha256(published.read_bytes()).hexdigest()


def test_canonical_24k_pcm_preserves_exact_bytes(tmp_path):
    native, published = tmp_path / "native-audio.wav", tmp_path / "audio.wav"
    write_pcm(native, 24000, 73)
    native_bytes = native.read_bytes()
    artifact = CanonicalVoiceOutputAudio(FFMPEG, FFPROBE).publish(native, published)
    assert published.read_bytes() == native_bytes
    assert artifact.native.sha256 == artifact.published.sha256


@pytest.mark.parametrize("rate", [24000, 44100])
def test_float_native_is_retained_and_canonical_pcm16_published(tmp_path, rate):
    native, published = tmp_path / "native-audio.wav", tmp_path / "audio.wav"
    write_float(native, rate)
    native_bytes = native.read_bytes()
    artifact = CanonicalVoiceOutputAudio(FFMPEG, FFPROBE).publish(native, published)
    assert native.read_bytes() == native_bytes
    assert artifact.native.format == "pcm_f32le"
    assert artifact.native.sample_rate == rate
    assert artifact.published.format == "pcm_s16le"
    assert artifact.published.sample_rate == 24000
    import soundfile as sf
    audio, decoded_rate = sf.read(published)
    assert decoded_rate == 24000
    assert audio.mean() == pytest.approx(0.1, abs=0.001)


def test_sidecar_uses_relative_paths_and_is_verifiable(tmp_path):
    native, published = tmp_path / "native-audio.wav", tmp_path / "audio.wav"
    write_float(native, 22050)
    artifact = CanonicalVoiceOutputAudio(FFMPEG, FFPROBE).publish(native, published)
    sidecar = tmp_path / "audio-provenance.json"
    CanonicalVoiceOutputAudio.write_provenance(sidecar, artifact, engine="vivoice",
        generator_id="vivoice-generate", artifact_identity="model-revision")
    value = json.loads(sidecar.read_text(encoding="utf-8"))
    assert value["schemaVersion"] == 1
    assert value["engine"] == "vivoice"
    assert value["generatorId"] == "vivoice-generate"
    assert value["artifactIdentity"] == "model-revision"
    assert value["native"]["path"] == "native-audio.wav"
    assert value["published"]["path"] == "audio.wav"
    assert value["native"]["sha256"] == artifact.native.sha256


def test_conversion_requires_configured_ffmpeg_and_does_not_create_published_file(tmp_path):
    native, published = tmp_path / "native.wav", tmp_path / "audio.wav"
    write_pcm(native, 22050)
    with pytest.raises(RuntimeError, match="FFmpeg"):
        CanonicalVoiceOutputAudio(None, None).publish(native, published)
    assert native.is_file()
    assert not published.exists()


@pytest.mark.skipif(not FFMPEG.is_file() or not FFPROBE.is_file(), reason="configured local FFmpeg tools unavailable")
def test_canonical_output_metadata_is_header_derived_not_worker_duration(tmp_path):
    native, published = tmp_path / "native.wav", tmp_path / "audio.wav"
    write_float(native, 44100, 4410)
    result = CanonicalVoiceOutputAudio(FFMPEG, FFPROBE).publish(native, published)
    assert result.published.duration == pytest.approx(0.1, abs=1 / 24000)


@pytest.mark.parametrize("damage", ["truncated", "wrong-block-align"])
def test_rejects_incomplete_or_inconsistent_riff_before_copying(tmp_path, damage):
    import struct

    native, published = tmp_path / "native.wav", tmp_path / "audio.wav"
    write_pcm(native, 24000, 100)
    payload = bytearray(native.read_bytes())
    if damage == "truncated":
        payload = payload[:-2]
    else:
        struct.pack_into("<H", payload, 32, 4)  # mono PCM16 requires two bytes per frame
    native.write_bytes(payload)
    with pytest.raises(ValueError, match="WAV"):
        CanonicalVoiceOutputAudio(FFMPEG, FFPROBE).publish(native, published)
    assert native.read_bytes() == payload
    assert not published.exists()

