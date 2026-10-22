from __future__ import annotations

import hashlib
import json
import struct
import shutil
import subprocess
import wave
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


CANONICAL_RATE = 24000


@dataclass(frozen=True)
class AudioHeader:
    path: str
    sha256: str
    sample_rate: int
    channels: int
    format: str
    frames: int
    duration: float


@dataclass(frozen=True)
class CanonicalAudioArtifact:
    native: AudioHeader
    published: AudioHeader


class CanonicalVoiceOutputAudio:
    """Keep engine audio intact and publish the app's PCM16/24 kHz edit source."""

    def __init__(self, ffmpeg_path: str | Path | None, ffprobe_path: str | Path | None = None) -> None:
        self.ffmpeg = Path(ffmpeg_path) if ffmpeg_path else None
        if ffprobe_path:
            self.ffprobe = Path(ffprobe_path)
        elif self.ffmpeg:
            sibling = self.ffmpeg.with_name("ffprobe.exe" if self.ffmpeg.suffix.lower() == ".exe" else "ffprobe")
            self.ffprobe = sibling if sibling.is_file() else None
        else:
            self.ffprobe = None

    def publish(
        self, native_path: Path, published_path: Path,
    ) -> CanonicalAudioArtifact:
        if not native_path.is_file() or native_path.stat().st_size == 0:
            raise ValueError("Engine không tạo file WAV native hợp lệ.")
        native_info = self._header(native_path)
        if not native_info["frames"] or native_info["duration"] <= 0:
            raise ValueError("WAV native không có frame audio hợp lệ.")

        if self._is_canonical_pcm16(native_path):
            shutil.copyfile(native_path, published_path)
        else:
            if not self.ffmpeg or not self.ffmpeg.is_file():
                raise RuntimeError("Cần FFmpeg đã cấu hình để chuyển audio engine sang PCM16 mono 24 kHz.")
            subprocess.run(
                [str(self.ffmpeg), "-y", "-nostdin", "-hide_banner", "-loglevel", "error",
                 "-i", str(native_path), "-vn", "-ac", "1", "-ar", str(CANONICAL_RATE),
                 "-c:a", "pcm_s16le", str(published_path)],
                check=True, capture_output=True, timeout=120,
            )

        published_info = self._header(published_path)
        if (published_info["sample_rate"], published_info["channels"], published_info["format"]) != (
            CANONICAL_RATE, 1, "pcm_s16le"
        ) or not published_info["frames"] or published_info["duration"] <= 0:
            raise ValueError("Audio chuẩn hóa không phải PCM16 mono 24 kHz hợp lệ.")
        return CanonicalAudioArtifact(
            native=self._artifact_header(native_path.name, native_path, native_info),
            published=self._artifact_header(published_path.name, published_path, published_info),
        )

    @staticmethod
    def _artifact_header(path: str, source: Path, header: dict[str, Any]) -> AudioHeader:
        return AudioHeader(path, _sha256(source), int(header["sample_rate"]), int(header["channels"]),
                           str(header["format"]), int(header["frames"]), float(header["duration"]))

    @staticmethod
    def _is_canonical_pcm16(path: Path) -> bool:
        try:
            with wave.open(str(path), "rb") as audio:
                return (audio.getcomptype() == "NONE" and audio.getsampwidth() == 2 and
                        audio.getnchannels() == 1 and audio.getframerate() == CANONICAL_RATE and
                        audio.getnframes() > 0)
        except (wave.Error, EOFError):
            return False

    def _header(self, path: Path) -> dict[str, Any]:
        wav_header = self._wav_header(path)
        if wav_header is not None:
            return wav_header
        # Metadata probes may still describe a truncated WAV. A recognized RIFF
        # must pass our payload bounds checks before it can be published.
        with path.open("rb") as source:
            prefix = source.read(12)
        if prefix[:4] == b"RIFF" and prefix[8:12] == b"WAVE":
            raise ValueError("WAV có header không nhất quán hoặc thiếu dữ liệu audio.")
        if self.ffprobe and self.ffprobe.is_file():
            result = subprocess.run(
                [str(self.ffprobe), "-v", "error", "-select_streams", "a:0", "-show_entries",
                 "stream=codec_name,sample_fmt,sample_rate,channels,bits_per_sample,duration,nb_frames",
                 "-of", "json", str(path)], check=True, capture_output=True, text=True, timeout=15,
            )
            streams = json.loads(result.stdout).get("streams", [])
            if not streams:
                raise ValueError(f"WAV không có audio stream: {path.name}")
            stream = streams[0]
            rate = int(stream["sample_rate"])
            frames = int(stream.get("nb_frames") or 0)
            duration = float(stream.get("duration") or 0)
            if not frames and duration > 0:
                frames = round(duration * rate)
            if not duration and frames:
                duration = frames / rate
            codec = str(stream.get("codec_name") or "unknown")
            format_name = codec
            return {"sample_rate": rate, "channels": int(stream["channels"]), "format": format_name,
                    "frames": frames, "duration": duration}

        try:
            with wave.open(str(path), "rb") as audio:
                width = audio.getsampwidth()
                format_name = {1: "pcm_u8", 2: "pcm_s16le", 3: "pcm_s24le", 4: "pcm_s32le"}.get(
                    width, f"pcm_{width * 8}"
                )
                frames, rate = audio.getnframes(), audio.getframerate()
                return {"sample_rate": rate, "channels": audio.getnchannels(), "format": format_name,
                        "frames": frames, "duration": frames / rate if rate else 0}
        except (wave.Error, EOFError) as exc:
            raise RuntimeError("Cần FFprobe đã cấu hình để đọc header WAV native.") from exc

    @staticmethod
    def _wav_header(path: Path) -> dict[str, Any] | None:
        """Read RIFF/WAVE format and data chunk sizes, including IEEE float WAV."""
        try:
            with path.open("rb") as source:
                if source.read(4) != b"RIFF":
                    return None
                source.read(4)  # RIFF chunk size
                if source.read(4) != b"WAVE":
                    return None
                fmt = None
                data_bytes = None
                file_size = path.stat().st_size
                while True:
                    chunk_start = source.tell()
                    chunk = source.read(8)
                    if len(chunk) != 8:
                        break
                    chunk_id, chunk_size = chunk[:4], struct.unpack("<I", chunk[4:])[0]
                    chunk_end = source.tell() + chunk_size
                    if chunk_end > file_size:
                        return None
                    if chunk_id == b"fmt " and chunk_size >= 16:
                        chunk_data = source.read(min(chunk_size, 40))
                        if len(chunk_data) < 16:
                            return None
                        fmt = struct.unpack("<HHIIHH", chunk_data[:16])
                        if fmt[0] == 0xFFFE and chunk_size >= 40:
                            if len(chunk_data) < 40:
                                return None
                            subformat_tag = struct.unpack("<I", chunk_data[24:28])[0]
                            fmt = (subformat_tag, *fmt[1:])
                    elif chunk_id == b"data":
                        data_bytes = chunk_size
                    source.seek(chunk_end + (chunk_size % 2))
                    if source.tell() > file_size or source.tell() <= chunk_start:
                        return None
                if fmt is None or data_bytes is None:
                    return None
                tag, channels, rate, _byte_rate, block_align, bits = fmt
                if not block_align or not rate or not channels:
                    return None
                if tag in (1, 3) and block_align != channels * ((bits + 7) // 8):
                    return None
                if data_bytes % block_align:
                    return None
                frames = data_bytes // block_align
                format_name = ("pcm_f32le" if tag == 3 and bits == 32 else
                               "pcm_f64le" if tag == 3 and bits == 64 else
                               {8: "pcm_u8", 16: "pcm_s16le", 24: "pcm_s24le", 32: "pcm_s32le"}.get(
                                   bits, f"pcm_{bits}"
                               ) if tag == 1 else f"wav_format_{tag}")
                return {"sample_rate": rate, "channels": channels, "format": format_name,
                        "frames": frames, "duration": frames / rate}
        except (OSError, struct.error):
            return None

    @staticmethod
    def write_provenance(
        path: Path, artifact: CanonicalAudioArtifact, *, engine: str, generator_id: str, artifact_identity: str,
        worker_reported_seconds: float | None = None,
    ) -> None:
        document = {
            "schemaVersion": 1,
            "engine": engine,
            "generatorId": generator_id,
            "artifactIdentity": artifact_identity,
            "workerReportedSeconds": worker_reported_seconds,
            "native": asdict(artifact.native),
            "published": asdict(artifact.published),
        }
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
