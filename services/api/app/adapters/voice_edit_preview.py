import hashlib
import json
import re
import threading
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

    def render(self, project_id, output_id, doc):
        source = self.store.outputs.audio_path(project_id, output_id)
        if not doc.cursor:
            return f"/api/projects/{project_id}/voice-outputs/{output_id}/audio", None
        payload = json.dumps({"source": doc.source_sha256, "operations": [o.model_dump(by_alias=True) for o in doc.active], "policy": 1}, sort_keys=True)
        key = hashlib.sha256(payload.encode()).hexdigest()[:32]
        path = self.path(project_id, output_id, key)
        with self._lock:
            try:
                report = self.validate(path, doc.source_sha256, doc.frames)
            except (ValueError, OSError, wave.Error, EOFError):
                report = render_stretch(source, path, [o.model_dump(by_alias=True) for o in doc.active])
                report.update(sourceSha256=doc.source_sha256, audioSha256=hashlib.sha256(path.read_bytes()).hexdigest())
                FileProjectRepository._atomic_write(path.with_suffix(".json"), json.dumps(report))
                self.validate(path, doc.source_sha256, doc.frames)
        return f"/api/projects/{project_id}/voice-outputs/{output_id}/edit/previews/{key}/audio", report
