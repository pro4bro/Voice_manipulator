import hashlib
import json
import re
import threading
from time import perf_counter
import wave
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.voice_stretch_audio import render_stretch


class VoiceEditPreview:
    _lock = threading.RLock()

    def __init__(self, store):
        self.store = store

    def path(self, project_id, output_id, key):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", output_id) or not re.fullmatch(r"[a-f0-9]{32}", key):
            raise ValueError("Preview key không hợp lệ.")
        source = self.store.outputs.audio_path(project_id, output_id)
        return source.parent / "previews" / f"{key}.wav"

    def validate(self, path, source_hash, expected_frames=None):
        report = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        if report.get("sourceSha256") != source_hash or report.get("audioSha256") != hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError("Preview hash không khớp.")
        with wave.open(str(path), "rb") as pcm:
            frames = pcm.getnframes()
            if (pcm.getnchannels(), pcm.getsampwidth(), pcm.getframerate(), pcm.getcomptype()) != (1, 2, 24000, "NONE") or len(pcm.readframes(frames)) != frames * 2:
                raise ValueError("Preview PCM không hợp lệ.")
        if frames != report.get("actualFrames") or (expected_frames is not None and frames != expected_frames):
            raise ValueError("Preview duration không khớp.")
        return report

    def render(self, project_id, output_id, doc, *, diagnostics=None):
        metrics = diagnostics if diagnostics is not None else {}
        metrics.update(cacheHit=False, lockWaitMs=0.0, cacheCheckMs=0.0, renderMs=0.0, artifactCheckMs=0.0)
        source = self.store.outputs.audio_path(project_id, output_id)
        if not doc.cursor:
            metrics["cacheHit"] = True
            return f"/api/projects/{project_id}/voice-outputs/{output_id}/audio", None
        payload = json.dumps({"source": doc.source_sha256, "operations": [o.model_dump(by_alias=True) for o in doc.active], "policy": 1}, sort_keys=True)
        key = hashlib.sha256(payload.encode()).hexdigest()[:32]
        path = self.path(project_id, output_id, key)
        wait_started = perf_counter()
        with self._lock:
            metrics["lockWaitMs"] = (perf_counter() - wait_started) * 1000
            check_started = perf_counter()
            try:
                report = self.validate(path, doc.source_sha256, doc.frames)
                metrics["cacheHit"] = True
            except (ValueError, OSError, wave.Error, EOFError):
                metrics["cacheCheckMs"] = (perf_counter() - check_started) * 1000
                render_started = perf_counter()
                report = render_stretch(source, path, [o.model_dump(by_alias=True) for o in doc.active])
                metrics["renderMs"] = (perf_counter() - render_started) * 1000
                artifact_started = perf_counter()
                report.update(sourceSha256=doc.source_sha256, audioSha256=hashlib.sha256(path.read_bytes()).hexdigest())
                FileProjectRepository._atomic_write(path.with_suffix(".json"), json.dumps(report))
                self.validate(path, doc.source_sha256, doc.frames)
                metrics["artifactCheckMs"] = (perf_counter() - artifact_started) * 1000
            else:
                metrics["cacheCheckMs"] = (perf_counter() - check_started) * 1000
        return f"/api/projects/{project_id}/voice-outputs/{output_id}/edit/previews/{key}/audio", report
