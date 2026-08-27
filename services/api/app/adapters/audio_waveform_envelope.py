from __future__ import annotations

import json
import math
import struct
import sys
import threading
import wave
from array import array
from pathlib import Path
from typing import Any


class AudioWaveformEnvelope:
    """Read real PCM min/max peaks for overview and zoomed Timeline views.

    The compact JSON overview is fast at project open. A project-local, disposable
    1 ms peak cache is then built once on demand. Zoomed requests read only the
    requested part of that cache, so the UI never interpolates a coarse full-file
    graphic when the user inspects a recording closely.
    """

    PEAK_CACHE_VERSION = 1
    PEAKS_PER_SECOND = 1_000
    MIN_DETAIL_POINTS = 64
    MAX_DETAIL_POINTS = 16_000

    def __init__(self, density_per_second: int = 72, min_points: int = 1800, max_points: int = 7200) -> None:
        self.density_per_second = density_per_second
        self.min_points = min_points
        self.max_points = max_points
        self._lock = threading.RLock()

    def read(self, audio_path: Path, cache_path: Path) -> dict[str, Any]:
        """Return the full-file overview peak envelope."""
        source = self._source(audio_path)
        source_stat = source.stat()
        with self._lock:
            cached = self._read_cache(cache_path, source_stat.st_size, source_stat.st_mtime_ns)
            if cached is not None:
                return cached
            payload = self._build(source)
            payload.update(
                {
                    "sourceSize": source_stat.st_size,
                    "sourceMtimeNs": source_stat.st_mtime_ns,
                }
            )
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = cache_path.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
            temporary.replace(cache_path)
            return payload

    def read_detail(
        self,
        audio_path: Path,
        cache_path: Path,
        start: float,
        end: float,
        points: int,
    ) -> dict[str, Any]:
        """Return source-derived min/max points for one zoomed Timeline window."""
        source = self._source(audio_path)
        with self._lock:
            metadata, peaks_path = self._ensure_peak_cache(source, cache_path)
            sample_rate = int(metadata["sampleRate"])
            frame_count = int(metadata["frameCount"])
            frames_per_peak = int(metadata["framesPerPeak"])
            peak_count = int(metadata["peakCount"])
            duration = frame_count / sample_rate
            requested_start = max(0.0, min(float(start), duration))
            requested_end = max(requested_start, min(float(end), duration))
            if requested_end - requested_start <= 0:
                raise ValueError("Vùng waveform chi tiết phải có thời lượng dương.")
            target_points = max(self.MIN_DETAIL_POINTS, min(self.MAX_DETAIL_POINTS, int(points)))
            first_peak = min(peak_count - 1, max(0, math.floor(requested_start * sample_rate / frames_per_peak)))
            last_peak = min(peak_count, max(first_peak + 1, math.ceil(requested_end * sample_rate / frames_per_peak)))
            raw = self._read_peaks(peaks_path, first_peak, last_peak)
            grouped = self._group_peaks(raw, target_points)
            actual_start = first_peak * frames_per_peak / sample_rate
            actual_end = min(duration, last_peak * frames_per_peak / sample_rate)
            return {
                "duration": duration,
                "start": actual_start,
                "end": actual_end,
                "sampleRate": sample_rate,
                "resolution": frames_per_peak / sample_rate,
                "points": grouped,
            }

    @staticmethod
    def _source(audio_path: Path) -> Path:
        source = audio_path.resolve()
        if not source.is_file():
            raise FileNotFoundError("Analysis audio không còn trong project.")
        return source

    def _read_cache(self, cache_path: Path, source_size: int, source_mtime_ns: int) -> dict[str, Any] | None:
        try:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            if (
                payload.get("sourceSize") == source_size
                and payload.get("sourceMtimeNs") == source_mtime_ns
                and isinstance(payload.get("points"), list)
            ):
                return payload
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            pass
        return None

    @staticmethod
    def _peak_paths(cache_path: Path) -> tuple[Path, Path]:
        return cache_path.with_suffix(".peaks.bin"), cache_path.with_suffix(".peaks.json")

    def _ensure_peak_cache(self, source: Path, cache_path: Path) -> tuple[dict[str, Any], Path]:
        source_stat = source.stat()
        peaks_path, metadata_path = self._peak_paths(cache_path)
        metadata = self._read_peak_metadata(metadata_path, peaks_path, source_stat.st_size, source_stat.st_mtime_ns)
        if metadata is not None:
            return metadata, peaks_path
        try:
            reader = wave.open(str(source), "rb")
        except (wave.Error, OSError) as exc:
            raise ValueError(f"Không đọc được analysis WAV: {exc}") from exc
        with reader:
            channels = max(1, reader.getnchannels())
            sample_width = reader.getsampwidth()
            sample_rate = reader.getframerate()
            frame_count = reader.getnframes()
            if sample_width != 2 or sample_rate <= 0:
                raise ValueError("Analysis audio phải là PCM 16-bit để tạo waveform.")
            frames_per_peak = max(1, sample_rate // self.PEAKS_PER_SECOND)
            peak_count = math.ceil(frame_count / frames_per_peak)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temporary_peaks = peaks_path.with_suffix(".bin.tmp")
            written = 0
            with temporary_peaks.open("wb") as output:
                while raw := reader.readframes(frames_per_peak):
                    samples = self._samples(raw)
                    minimum = min(samples) if samples else 0
                    maximum = max(samples) if samples else 0
                    output.write(struct.pack("<hh", minimum, maximum))
                    written += 1
            if written != peak_count:
                temporary_peaks.unlink(missing_ok=True)
                raise ValueError("Không thể tạo đủ peak cache cho analysis WAV.")
        metadata = {
            "version": self.PEAK_CACHE_VERSION,
            "sourceSize": source_stat.st_size,
            "sourceMtimeNs": source_stat.st_mtime_ns,
            "sampleRate": sample_rate,
            "channels": channels,
            "frameCount": frame_count,
            "framesPerPeak": frames_per_peak,
            "peakCount": peak_count,
        }
        temporary_meta = metadata_path.with_suffix(".json.tmp")
        temporary_meta.write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")
        temporary_peaks.replace(peaks_path)
        temporary_meta.replace(metadata_path)
        return metadata, peaks_path

    def _read_peak_metadata(
        self,
        metadata_path: Path,
        peaks_path: Path,
        source_size: int,
        source_mtime_ns: int,
    ) -> dict[str, Any] | None:
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            peak_count = int(metadata["peakCount"])
            if (
                metadata.get("version") == self.PEAK_CACHE_VERSION
                and metadata.get("sourceSize") == source_size
                and metadata.get("sourceMtimeNs") == source_mtime_ns
                and int(metadata["sampleRate"]) > 0
                and int(metadata["framesPerPeak"]) > 0
                and peak_count > 0
                and peaks_path.stat().st_size == peak_count * 4
            ):
                return metadata
        except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError):
            pass
        return None

    def _read_peaks(self, peaks_path: Path, start: int, end: int) -> list[tuple[int, int]]:
        count = end - start
        with peaks_path.open("rb") as source:
            source.seek(start * 4)
            raw = source.read(count * 4)
        if len(raw) != count * 4:
            raise ValueError("Peak cache bị thiếu dữ liệu; hãy tải lại waveform.")
        return list(struct.iter_unpack("<hh", raw))

    @staticmethod
    def _group_peaks(peaks: list[tuple[int, int]], target_points: int) -> list[dict[str, float]]:
        if len(peaks) <= target_points:
            return [{"min": minimum / 32768.0, "max": maximum / 32768.0} for minimum, maximum in peaks]
        frames_per_point = math.ceil(len(peaks) / target_points)
        grouped: list[dict[str, float]] = []
        for start in range(0, len(peaks), frames_per_point):
            group = peaks[start:start + frames_per_point]
            grouped.append(
                {
                    "min": min(item[0] for item in group) / 32768.0,
                    "max": max(item[1] for item in group) / 32768.0,
                }
            )
        return grouped

    def _build(self, source: Path) -> dict[str, Any]:
        try:
            reader = wave.open(str(source), "rb")
        except (wave.Error, OSError) as exc:
            raise ValueError(f"Không đọc được analysis WAV: {exc}") from exc
        with reader:
            channels = max(1, reader.getnchannels())
            sample_width = reader.getsampwidth()
            rate = reader.getframerate()
            frame_count = reader.getnframes()
            if sample_width != 2 or rate <= 0:
                raise ValueError("Analysis audio phải là PCM 16-bit để tạo waveform.")
            duration = frame_count / rate
            point_count = min(
                self.max_points,
                max(self.min_points, math.ceil(max(0.1, duration) * self.density_per_second)),
            )
            frames_per_point = max(1, math.ceil(frame_count / point_count))
            points: list[dict[str, float]] = []
            for _ in range(point_count):
                raw = reader.readframes(frames_per_point)
                if not raw:
                    points.append({"min": 0.0, "max": 0.0})
                    continue
                samples = self._samples(raw)
                points.append(
                    {
                        "min": min(samples) / 32768.0 if samples else 0.0,
                        "max": max(samples) / 32768.0 if samples else 0.0,
                    }
                )
            return {
                "duration": duration,
                "sampleRate": rate,
                "channels": channels,
                "points": points,
            }

    @staticmethod
    def _samples(raw: bytes) -> array:
        samples = array("h")
        samples.frombytes(raw)
        if sys.byteorder != "little":
            samples.byteswap()
        return samples