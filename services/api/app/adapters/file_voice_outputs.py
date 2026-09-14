from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from app.domain.models import VoiceOutput
from app.domain.ports import ProjectRepository


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
