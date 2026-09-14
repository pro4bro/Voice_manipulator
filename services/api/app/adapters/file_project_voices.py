from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from app.domain.models import DatasetSegment, ProjectVoice, VoiceKind
from app.domain.ports import ProjectRepository

Slicer = Callable[[Path, Path, float, float], None]


class FileProjectVoices:
    """Voices a project made, one folder each.

    ```
    <project>/assets/voices/<voice-id>/
      voice.json       what the voice is and where it came from
      reference.wav    the clip it imitates, cut from the dataset segment
    ```

    A voice is never rewritten after publishing. Training again makes a new
    voice beside the old one, so a take generated last week can still name the
    exact voice it was made with.
    """

    def __init__(self, projects: ProjectRepository, slicer: Slicer) -> None:
        self.projects = projects
        self.slicer = slicer

    def root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "assets" / "voices"

    def list(self, project_id: str) -> list[ProjectVoice]:
        root = self.root(project_id)
        if not root.is_dir():
            return []
        voices: list[ProjectVoice] = []
        for record in root.glob("*/voice.json"):
            try:
                voices.append(ProjectVoice.model_validate_json(record.read_text(encoding="utf-8")))
            except ValueError:
                continue
        return sorted(voices, key=lambda voice: voice.created_at, reverse=True)

    def get(self, project_id: str, voice_id: str) -> ProjectVoice:
        record = self.root(project_id) / voice_id / "voice.json"
        if not record.is_file():
            raise KeyError(voice_id)
        return ProjectVoice.model_validate_json(record.read_text(encoding="utf-8"))

    def absolute(self, project_id: str, relative: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / relative

    def publish(
        self,
        project_id: str,
        *,
        name: str,
        speaker_profile_id: str,
        kind: VoiceKind,
        reference: DatasetSegment,
        language: str | None,
        model_id: str | None = None,
        base_model: str = "k2-fsa/OmniVoice",
        adapter_dir: Path | None = None,
        model_dir: Path | None = None,
        engine: str = "omnivoice",
        source_run_id: str | None = None,
    ) -> ProjectVoice:
        project_root = Path(self.projects.get(project_id).project_path)
        voice = ProjectVoice(
            name=name,
            speaker_profile_id=speaker_profile_id,
            engine=engine,
            kind=kind,
            model_id=model_id,
            base_model=base_model,
            reference_audio="",
            reference_text=reference.text.strip(),
            reference_seconds=reference.duration,
            reference_segment_id=reference.id,
            language=language,
            source_run_id=source_run_id,
        )
        folder = project_root / "assets" / "voices" / voice.id
        folder.mkdir(parents=True, exist_ok=False)
        clip = folder / "reference.wav"
        self.slicer((project_root / reference.audio_path).resolve(), clip, reference.start, reference.end)
        voice = voice.model_copy(
            update={
                "reference_audio": clip.relative_to(project_root).as_posix(),
                "adapter_path": adapter_dir.resolve().relative_to(project_root.resolve()).as_posix()
                if adapter_dir
                else None,
                "model_path": model_dir.resolve().relative_to(project_root.resolve()).as_posix()
                if model_dir
                else None,
            }
        )
        temporary = folder / "voice.json.tmp"
        temporary.write_text(voice.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(folder / "voice.json")
        return voice
