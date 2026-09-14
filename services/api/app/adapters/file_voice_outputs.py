from __future__ import annotations

import shutil
import time
from pathlib import Path
from uuid import uuid4

from app.domain.models import VoiceOutput
from app.domain.ports import ProjectRepository

CLIPS_FOLDER = ".clips"


class FileVoiceOutputs:
    """Speech a voice engine produced, kept apart from Media Pool.

    ```
    <project>/assets/voice-output/<output-id>/
      output.json   text, voice, tool and settings that made it
      audio.wav     the result
    ```

    Media Pool holds recorded source material - what STT, diarization and
    training read. Generated speech is a result of that work, so it lives in its
    own store and never shows up where source footage is expected.
    """

    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects

    def root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "assets" / "voice-output"

    def clips_root(self, project_id: str) -> Path:
        """Per-row clips a Script read reuses; `.clips` never holds an output.json."""
        return self.root(project_id) / CLIPS_FOLDER

    def reserve(self, project_id: str) -> tuple[str, Path]:
        """A fresh folder for one result, and the path its audio goes to."""
        output_id = f"output-{uuid4().hex[:12]}"
        folder = self.root(project_id) / output_id
        folder.mkdir(parents=True, exist_ok=False)
        return output_id, folder / "audio.wav"

    def discard(self, project_id: str, output_id: str) -> None:
        shutil.rmtree(self.root(project_id) / output_id, ignore_errors=True)

    def save(self, project_id: str, output: VoiceOutput) -> VoiceOutput:
        folder = self.root(project_id) / output.id
        temporary = folder / "output.json.tmp"
        temporary.write_text(output.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(folder / "output.json")
        return output

    def list(self, project_id: str) -> list[VoiceOutput]:
        root = self.root(project_id)
        if not root.is_dir():
            return []
        outputs: list[VoiceOutput] = []
        for record in root.glob("*/output.json"):
            try:
                outputs.append(VoiceOutput.model_validate_json(record.read_text(encoding="utf-8")))
            except ValueError:
                continue
        return sorted(outputs, key=lambda output: output.created_at, reverse=True)

    def get(self, project_id: str, output_id: str) -> VoiceOutput:
        record = self.root(project_id) / output_id / "output.json"
        if not record.is_file():
            raise KeyError(output_id)
        return VoiceOutput.model_validate_json(record.read_text(encoding="utf-8"))

    def audio_path(self, project_id: str, output_id: str) -> Path:
        self.get(project_id, output_id)
        return self.root(project_id) / output_id / "audio.wav"

    def delete(self, project_id: str, output_id: str) -> None:
        self.get(project_id, output_id)
        self.discard(project_id, output_id)
        self.prune_clips(project_id)

    def prune_clips(self, project_id: str, keep_recent_seconds: float = 900.0) -> int:
        """Remove clips no output uses any more.

        A clip written in the last few minutes may belong to a Script still
        being read, whose output does not exist yet, so it is left alone.
        """
        clips = self.clips_root(project_id)
        if not clips.is_dir():
            return 0
        used = {segment.clip for output in self.list(project_id) for segment in output.segments if segment.clip}
        now = time.time()
        removed = 0
        for folder in clips.iterdir():
            if not folder.is_dir() or folder.name in used:
                continue
            if now - folder.stat().st_mtime < keep_recent_seconds:
                continue
            shutil.rmtree(folder, ignore_errors=True)
            removed += 1
        return removed
