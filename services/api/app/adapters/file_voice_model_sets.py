from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.adapters.safe_delete import child_folder, remove_tree
from app.domain.models import (
    DatasetManifest,
    ProjectVoice,
    TrainingRun,
    SpeakerSimilarityGateEvidence,
    VoiceModelSet,
    VoiceModelSetLineage,
    VoiceModelSetMember,
)
from app.domain.ports import ProjectRepository


class FileVoiceModelSets:
    """Project-owned Voice Model Set records, one atomic JSON file per set."""

    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects

    def root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "assets" / "voice-model-sets"

    def list(self, project_id: str) -> list[VoiceModelSet]:
        root = self.root(project_id)
        if not root.is_dir():
            return []
        found: list[VoiceModelSet] = []
        for record in root.glob("*/set.json"):
            try:
                found.append(VoiceModelSet.model_validate_json(record.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue
        return sorted(found, key=lambda item: item.created_at, reverse=True)

    def get(self, project_id: str, set_id: str) -> VoiceModelSet:
        record = child_folder(self.root(project_id), set_id) / "set.json"
        if not record.is_file():
            raise KeyError(set_id)
        return VoiceModelSet.model_validate_json(record.read_text(encoding="utf-8"))

    def create_pending(
        self,
        project_id: str,
        set_id: str,
        name: str,
        voice: ProjectVoice,
        run: TrainingRun,
        manifest: DatasetManifest,
    ) -> VoiceModelSet:
        if voice.kind == "vc":
            raise ValueError("Voice conversion models do not belong to a Voice Model Set.")
        if not run.speaker_profile_id or voice.speaker_profile_id != run.speaker_profile_id:
            raise ValueError("Voice and training run must reference the same Speaker Profile.")
        if voice.model_set_id != set_id:
            raise ValueError("Voice does not reference this Voice Model Set.")
        segments = [item for item in manifest.segments if item.speaker_profile_id == run.speaker_profile_id]
        if not segments:
            raise ValueError("Voice Model Set lineage has no segments for its Speaker Profile.")
        if voice.reference_segment_id not in {item.id for item in segments}:
            raise ValueError("Voice Model Set anchor is not part of its Dataset Manifest.")

        role = "neutral" if run.emotion == "normal" else "emotion"
        model_set = VoiceModelSet(
            id=set_id,
            name=name,
            speaker_profile_id=run.speaker_profile_id,
            generation_family=f"{voice.engine}:{voice.model_id or run.config.mode}:{voice.base_model}",
            anchor_voice_id=voice.id,
            anchor_segment_id=voice.reference_segment_id,
            members=[VoiceModelSetMember(
                voice_id=voice.id,
                role=role,
                emotion=run.emotion,
                source_run_id=run.id,
            )],
            lineage=VoiceModelSetLineage(
                manifest_id=run.manifest_id,
                manifest_hash=run.manifest_hash or "unavailable",
                engine=voice.engine,
                engine_revision=run.engine_revision or "unavailable",
                model_id=voice.model_id,
                base_model=voice.base_model,
                config=run.config,
                segment_count=len(segments),
                source_run_ids=[run.id],
            ),
        )
        return self._write(project_id, model_set, create=True)

    def for_voice(self, project_id: str, voice_id: str) -> list[VoiceModelSet]:
        return [item for item in self.list(project_id) if voice_id in item.voice_ids]

    def remove_voice(self, project_id: str, voice_id: str) -> list[VoiceModelSet]:
        removed: list[VoiceModelSet] = []
        for model_set in self.for_voice(project_id, voice_id):
            if model_set.status == "published":
                raise ValueError("Published Voice Model Set must be retired before deleting one of its voices.")
            remove_tree(child_folder(self.root(project_id), model_set.id))
            removed.append(model_set)
        return removed

    def record_gate(
        self,
        project_id: str,
        set_id: str,
        evidence: SpeakerSimilarityGateEvidence,
    ) -> VoiceModelSet:
        model_set = self.get(project_id, set_id)
        if model_set.status == "published":
            return model_set
        now = datetime.now(timezone.utc)
        status = "published" if evidence.passed else (
            "rejected" if evidence.decision_reason == "below-threshold" else "pending-gate"
        )
        updated = model_set.model_copy(update={
            "status": status,
            "gate": evidence,
            "published_at": now if status == "published" else None,
        })
        return self._write(project_id, updated)

    def _write(self, project_id: str, model_set: VoiceModelSet, *, create: bool = False) -> VoiceModelSet:
        folder = child_folder(self.root(project_id), model_set.id)
        folder.mkdir(parents=True, exist_ok=not create)
        record = folder / "set.json"
        if create and record.exists():
            raise FileExistsError(model_set.id)
        current = model_set.model_copy(update={"updated_at": datetime.now(timezone.utc)})
        temporary = record.with_suffix(".json.tmp")
        temporary.write_text(current.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(record)
        return current
