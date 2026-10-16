from __future__ import annotations

import hashlib
import re
import threading
import wave
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.domain.voice_script_document import effective_settings
from app.domain.voice_edits import VoiceEditCommand, VoiceEditDocument, apply_command


class FileVoiceEdits:
    """One undo journal per immutable generated WAV; paths stay project-relative."""
    _lock = threading.RLock()

    def __init__(self, outputs, scripts: FileVoiceScript):
        self.outputs, self.scripts = outputs, scripts

    def get(self, project_id: str, output_id: str) -> VoiceEditDocument:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", output_id):
            raise ValueError("Output ID không hợp lệ.")
        audio = self.outputs.audio_path(project_id, output_id)
        with wave.open(str(audio), "rb") as pcm:
            if pcm.getsampwidth() != 2 or pcm.getnchannels() != 1 or pcm.getframerate() != 24000:
                raise ValueError("Preview cần WAV PCM16 mono 24 kHz.")
            rate, frames = pcm.getframerate(), pcm.getnframes()
        digest = hashlib.sha256(audio.read_bytes()).hexdigest()
        path = audio.parent / "edits.json"
        if path.is_file():
            doc = VoiceEditDocument.model_validate_json(path.read_text(encoding="utf-8"))
            if (doc.source_sha256 != digest or doc.output_id != output_id or
                doc.sample_rate != rate or doc.source_frames != frames):
                raise ValueError("Audio nguồn đã đổi; không áp dụng mapping cũ.")
            return doc
        return VoiceEditDocument(output_id=output_id, source_sha256=digest, sample_rate=rate, source_frames=frames)

    def change(self, project_id: str, output_id: str, command: VoiceEditCommand, *, persist: bool = True) -> VoiceEditDocument:
        with self._lock, self.scripts._lock:
            current = self.get(project_id, output_id)
            script = self.scripts.get(project_id)
            if command.revision != current.revision or command.script_revision != script.revision:
                raise ScriptRevisionConflict("Script/Timeline đã đổi; tải lại trước khi chỉnh.")
            if command.action == "stretch" and command.operation:
                op = command.operation
                if op.delta and script.settings.duration is not None:
                    raise ValueError("Clip có budget thời lượng; điều chỉnh budget trước khi ripple.")
                output = self.outputs.get(project_id, output_id)
                for segment in output.segments:
                    row = next((r for r in script.rows if r.id == segment.row_id), None)
                    if row is None:
                        raise ValueError("Output không còn khớp Script; mở đúng Script trước khi ripple.")
                    settings = effective_settings(script, row)
                    start = round(current.map_seconds(segment.start) * current.sample_rate)
                    end = round(current.map_seconds(segment.end) * current.sample_rate)
                    overlaps = start < op.end_frame and end > op.start_frame
                    if overlaps and ("duration" in settings.get("locked", []) or
                        any(s.id == row.segment_id and s.settings.duration is not None for s in script.segments)):
                        raise ValueError("Vùng có duration khóa/budget đoạn; chỉnh cấu hình trước khi giãn.")
            saved = apply_command(current, command)
            path = self.outputs.audio_path(project_id, output_id).parent / "edits.json"
            if persist:
                FileProjectRepository._atomic_write(path, saved.model_dump_json(by_alias=True, indent=2))
            return saved

    def mapped_output(self, project_id: str, output_id: str, doc: VoiceEditDocument):
        output = self.outputs.get(project_id, output_id)
        words = [{**word, "start": doc.map_seconds(float(word["start"])), "end": doc.map_seconds(float(word["end"])),
                  **({"timingTrusted": False} if doc.cursor else {})} for word in output.words]
        segments = [segment.model_copy(update={"start": doc.map_seconds(segment.start), "end": doc.map_seconds(segment.end)})
                    for segment in output.segments]
        return output.model_copy(update={"duration": doc.frames / doc.sample_rate, "words": words, "segments": segments,
            "word_timing_quality": "needs-alignment" if doc.cursor else output.word_timing_quality,
            "word_timing_note": "Preview đã giãn; chưa generate lại hoặc căn lời." if doc.cursor else output.word_timing_note})
