import hashlib
import json
import math
import os
import re
import threading
from time import perf_counter
import wave
from weakref import WeakValueDictionary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.voice_stretch_audio import MAX_ADJUSTMENT_FRAMES, render_stretch


class VoiceEditPreview:
    _lock_registry = WeakValueDictionary()
    _lock_registry_guard = threading.RLock()

    def __init__(self, store):
        self.store = store

    def path(self, project_id, output_id, key):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", output_id) or not re.fullmatch(r"[a-f0-9]{32}", key):
            raise ValueError("Preview key không hợp lệ.")
        source = self.store.outputs.audio_path(project_id, output_id)
        return source.parent / "previews" / f"{key}.wav"

    @staticmethod
    def _lock_key(output_folder):
        return os.path.normcase(os.path.realpath(os.fspath(output_folder)))

    @classmethod
    def _lock_for(cls, output_folder):
        key = cls._lock_key(output_folder)
        with cls._lock_registry_guard:
            lock = cls._lock_registry.get(key)
            if lock is None:
                lock = threading.RLock()
                cls._lock_registry[key] = lock
            return lock

    @staticmethod
    def _key(source_sha256, operations):
        payload = json.dumps({"source": source_sha256, "operations": operations, "policy": 1}, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()[:32]

    def validate(self, path, source_hash, expected_frames=None, expected_operations=None):
        try:
            report = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError) as exc:
            raise ValueError("Preview report is missing or invalid.") from exc
        if not isinstance(report, dict):
            raise ValueError("Preview report is missing or invalid.")
        if report.get("sourceSha256") != source_hash or report.get("audioSha256") != hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError("Preview hash không khớp.")
        with wave.open(str(path), "rb") as pcm:
            frames = pcm.getnframes()
            if (pcm.getnchannels(), pcm.getsampwidth(), pcm.getframerate(), pcm.getcomptype()) != (1, 2, 24000, "NONE") or len(pcm.readframes(frames)) != frames * 2:
                raise ValueError("Preview PCM không hợp lệ.")
        if (isinstance(report.get("actualFrames"), bool) or frames != report.get("actualFrames")
                or (expected_frames is not None and frames != expected_frames)):
            raise ValueError("Preview duration không khớp.")
        target_frames = report.get("targetFrames")
        if target_frames is not None and (isinstance(target_frames, bool) or target_frames != frames):
            raise ValueError("Preview target duration does not match its saved WAV.")
        processing_seconds = report.get("processingSeconds")
        if (processing_seconds is not None and (isinstance(processing_seconds, bool)
                or not isinstance(processing_seconds, (int, float))
                or not math.isfinite(processing_seconds) or processing_seconds < 0)):
            raise ValueError("Preview processing duration is invalid.")
        if "paddingFrames" in report and (isinstance(report["paddingFrames"], bool)
                or not isinstance(report["paddingFrames"], int)):
            raise ValueError("Preview padding diagnostic is invalid.")
        count = report.get("operationCount")
        if count is not None and (isinstance(count, bool) or not isinstance(count, int)
                or not 1 <= count <= 128 or (expected_operations is not None and count != expected_operations)):
            raise ValueError("Preview operation count does not match the requested history.")
        # Legacy reports omit the count. At request time the exact prefix length
        # is known; standalone artifact reads use the journal's128-op ceiling.
        adjustment_limit = (expected_operations or count or 128) * MAX_ADJUSTMENT_FRAMES
        if "paddingFrames" in report and abs(report["paddingFrames"]) > adjustment_limit:
            raise ValueError("Preview silence-fit adjustment exceeds its operation limits.")
        if "maxBoundaryStep" in report:
            boundary = report["maxBoundaryStep"]
            if (isinstance(boundary, bool) or not isinstance(boundary, (int, float))
                    or not math.isfinite(boundary) or not 0 <= boundary <= 0.05):
                raise ValueError("Preview boundary diagnostic is invalid.")
        if "clippedSamples" in report and (isinstance(report["clippedSamples"], bool)
                or not isinstance(report["clippedSamples"], int) or report["clippedSamples"] != 0):
            raise ValueError("Preview clipping diagnostic is invalid.")
        if "boundariesWithinLimit" in report and report["boundariesWithinLimit"] is not True:
            raise ValueError("Preview boundary status is invalid.")
        return report

    def validate_prefix(self, path, source_hash, expected_frames, expected_operations):
        report = self.validate(path, source_hash, expected_frames, expected_operations)
        padding = report.get("paddingFrames")
        boundary = report.get("maxBoundaryStep")
        clipped = report.get("clippedSamples")
        if (isinstance(padding, bool) or not isinstance(padding, int)
                or isinstance(boundary, bool) or not isinstance(boundary, (int, float))
                or not math.isfinite(boundary) or not 0 <= boundary <= 0.05
                or isinstance(clipped, bool) or not isinstance(clipped, int) or clipped != 0
                or report.get("boundariesWithinLimit") is not True):
            raise ValueError("Preview prefix has incomplete or invalid cumulative quality diagnostics.")
        return report

    def render(self, project_id, output_id, doc, *, diagnostics=None):
        metrics = diagnostics if diagnostics is not None else {}
        metrics.update(cacheHit=False, lockWaitMs=0.0, cacheCheckMs=0.0, prefixSearchMs=0.0,
            renderMs=0.0, artifactCheckMs=0.0, artifactHashMs=0.0, artifactReportWriteMs=0.0,
            finalVerificationMs=0.0, atomicCreateMs=0.0, atomicWriteFlushMs=0.0, atomicCloseMs=0.0,
            atomicFsyncMs=0.0, atomicReplaceMs=0.0, atomicRetryCount=0, atomicRetryWaitMs=0.0)
        metrics.update(reusedOperations=0, renderedOperations=0)
        source = self.store.outputs.audio_path(project_id, output_id)
        if not doc.cursor:
            metrics["cacheHit"] = True
            return f"/api/projects/{project_id}/voice-outputs/{output_id}/audio", None
        active = [operation.model_dump(by_alias=True) for operation in doc.active]
        key = self._key(doc.source_sha256, active)
        path = self.path(project_id, output_id, key)
        wait_started = perf_counter()
        output_lock = self._lock_for(source.parent)
        with output_lock:
            metrics["lockWaitMs"] = (perf_counter() - wait_started) * 1000
            check_started = perf_counter()
            prefix_report = None
            prefix_path = None
            reused_operations = 0
            try:
                report = self.validate(path, doc.source_sha256, doc.frames, len(active))
                metrics["cacheHit"] = True
                metrics["reusedOperations"] = len(active)
            except (ValueError, OSError, wave.Error, EOFError):
                metrics["cacheCheckMs"] = (perf_counter() - check_started) * 1000
                # Search backward so a damaged longest prefix falls back to the
                # longest earlier artifact whose source, checksum, PCM, and
                # cumulative frame count all still validate.
                prefix_started = perf_counter()
                for count in range(len(active) - 1, 0, -1):
                    prefix_operations = active[:count]
                    prefix_frames = doc.source_frames + sum(
                        item["targetFrames"] - (item["endFrame"] - item["startFrame"])
                        for item in prefix_operations)
                    candidate = self.path(project_id, output_id, self._key(doc.source_sha256, prefix_operations))
                    try:
                        prefix_report = self.validate_prefix(candidate, doc.source_sha256, prefix_frames, count)
                    except (ValueError, OSError, wave.Error, EOFError, AttributeError):
                        continue
                    prefix_path, reused_operations = candidate, count
                    break
                metrics["prefixSearchMs"] = (perf_counter() - prefix_started) * 1000

                render_started = perf_counter()
                render_source = prefix_path if prefix_path is not None else source
                suffix = active[reused_operations:]
                metrics["reusedOperations"] = reused_operations
                metrics["renderedOperations"] = len(suffix)
                report = render_stretch(render_source, path, suffix)
                metrics["renderMs"] = (perf_counter() - render_started) * 1000
                artifact_started = perf_counter()
                if prefix_report is not None:
                    report["paddingFrames"] = int(prefix_report.get("paddingFrames", 0)) + int(report.get("paddingFrames", 0))
                    report["maxBoundaryStep"] = max(float(prefix_report.get("maxBoundaryStep", 0.0)),
                        float(report.get("maxBoundaryStep", 0.0)))
                    report["processingSeconds"] = float(prefix_report.get("processingSeconds", 0.0)) + float(
                        report.get("processingSeconds", 0.0))
                report["targetFrames"] = doc.frames
                report["operationCount"] = len(active)
                hash_started = perf_counter()
                report.update(sourceSha256=doc.source_sha256, audioSha256=hashlib.sha256(path.read_bytes()).hexdigest())
                metrics["artifactHashMs"] = (perf_counter() - hash_started) * 1000
                atomic_metrics = {}
                report_started = perf_counter()
                FileProjectRepository._atomic_write(path.with_suffix(".json"), json.dumps(report),
                    diagnostics=atomic_metrics)
                metrics["artifactReportWriteMs"] = (perf_counter() - report_started) * 1000
                metrics.update(atomicCreateMs=atomic_metrics["createMs"],
                    atomicWriteFlushMs=atomic_metrics["writeFlushMs"], atomicFsyncMs=atomic_metrics["fsyncMs"],
                    atomicCloseMs=atomic_metrics["closeMs"],
                    atomicReplaceMs=atomic_metrics["replaceMs"], atomicRetryCount=atomic_metrics["retryCount"],
                    atomicRetryWaitMs=atomic_metrics["retryWaitMs"])
                verification_started = perf_counter()
                self.validate(path, doc.source_sha256, doc.frames, len(active))
                metrics["finalVerificationMs"] = (perf_counter() - verification_started) * 1000
                metrics["artifactCheckMs"] = (perf_counter() - artifact_started) * 1000
            else:
                metrics["cacheCheckMs"] = (perf_counter() - check_started) * 1000
        return f"/api/projects/{project_id}/voice-outputs/{output_id}/edit/previews/{key}/audio", report
