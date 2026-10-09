from __future__ import annotations

import json
import hashlib
import os
import re
import shutil
import threading
from pathlib import Path, PurePosixPath
from uuid import uuid4

from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_voice_model_sets import FileVoiceModelSets
from app.adapters.safe_delete import child_folder
from app.domain.models import (
    ConsentEvidence,
    ProjectVoice,
    SpeakerProfile,
    TrainingCatalog,
    VoiceCollection,
    VoiceCollectionCreate,
    VoiceCollectionEntry,
    VoiceCollectionImportResult,
    VoiceCollectionProperties,
    VoiceCollectionSource,
)
from app.domain.ports import ProjectRepository


_LOCKS: dict[Path, threading.RLock] = {}
_LOCKS_GUARD = threading.Lock()
_SAFE_SOURCE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
_MAX_CONSENT_EVIDENCE = 10 * 1024 * 1024
_ALLOWED_EVIDENCE_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt"}


class FileVoiceCollections:
    """Host-local voice archives with project-relative paths inside each entry."""

    def __init__(
        self,
        data_root: Path,
        projects: ProjectRepository,
        voices: FileProjectVoices,
        catalogs: FileTrainingCatalog,
        model_sets: FileVoiceModelSets,
        runs: FileTrainingRuns,
    ) -> None:
        self.root = data_root.resolve() / "voice-collections"
        self.root.mkdir(parents=True, exist_ok=True)
        self.projects = projects
        self.voices = voices
        self.catalogs = catalogs
        self.model_sets = model_sets
        self.runs = runs
        with _LOCKS_GUARD:
            self._lock = _LOCKS.setdefault(self.root, threading.RLock())

    def list(self) -> list[VoiceCollection]:
        with self._lock:
            result: list[VoiceCollection] = []
            for folder in sorted(self.root.glob("collection-*")):
                try:
                    result.append(self._read_collection(folder.name))
                except (OSError, ValueError, KeyError):
                    continue
            return result

    def create(self, payload: VoiceCollectionCreate) -> VoiceCollection:
        with self._lock:
            if not payload.name.strip():
                raise ValueError("Collection name cannot be blank.")
            collection_id = f"collection-{uuid4().hex[:12]}"
            stage = self.root / f".{collection_id}.tmp"
            stage.mkdir()
            try:
                (stage / "entries").mkdir()
                collection = VoiceCollection(
                    id=collection_id,
                    name=payload.name.strip(),
                    properties=payload.properties,
                    entries=[],
                )
                self._write_json(stage / "collection.json", collection.model_dump(mode="json", by_alias=True))
                stage.replace(self._folder(collection_id))
                return collection
            except Exception:
                shutil.rmtree(stage, ignore_errors=True)
                raise

    def get(self, collection_id: str) -> VoiceCollection:
        with self._lock:
            return self._read_collection(collection_id)

    def add_entry(self, collection_id: str, project_id: str, voice_id: str) -> VoiceCollectionEntry:
        with self._lock:
            self._read_collection(collection_id)
            self._validate_project_id(project_id)
            if not _SAFE_SOURCE_ID.fullmatch(voice_id):
                raise ValueError("Voice ID is invalid.")
            collection = self._read_collection(collection_id)
            prior = next((item for item in collection.entries
                          if item.source_project_id == project_id and item.voice.id == voice_id), None)
            if prior:
                return prior

            project = self.projects.get(project_id)
            voice = self.voices.get(project_id, voice_id)
            if voice.kind == "clone":
                raise ValueError("Voice collections accept trained LoRA, full, or VC voices only.")
            speaker = next((item for item in self.catalogs.get(project_id).speakers
                            if item.id == voice.speaker_profile_id), None)
            if speaker is None:
                raise ValueError("Voice Speaker Profile is missing from the project catalog.")
            provenance = self._require_completed_training_output(
                project_id, Path(project.project_path).resolve(), voice, speaker,
            )
            self._require_publishable_model_set(project_id, voice)

            entry_id = f"entry-{uuid4().hex[:12]}"
            folder = self._folder(collection_id)
            entries_root = self._contained_dir(folder, "entries")
            stage = entries_root / f".{entry_id}.tmp"
            destination = entries_root / entry_id
            stage.mkdir()
            try:
                payload_root = stage / "payload"
                payload_root.mkdir()
                voice = self._archive_voice(Path(project.project_path), payload_root, voice)
                speaker = self._archive_speaker(Path(project.project_path), payload_root, speaker)
                lineage = {
                    "provenance": provenance,
                    "artifactHashes": self._artifact_hashes_for_voice(payload_root, voice, speaker),
                }
                entry = VoiceCollectionEntry(
                    id=entry_id,
                    source_project_id=project.id,
                    source_project_name=project.name,
                    voice=voice,
                    speaker=speaker,
                )
                self._write_json(stage / "entry.json", entry.model_dump(mode="json", by_alias=True))
                self._write_json(stage / "lineage.json", lineage)
                stage.replace(destination)
                return entry
            except Exception:
                shutil.rmtree(stage, ignore_errors=True)
                raise

    def import_entry(self, collection_id: str, entry_id: str, project_id: str) -> VoiceCollectionImportResult:
        with self._lock:
            entry = self._read_entry(collection_id, entry_id)
            self._verified_entry_lineage(collection_id, entry_id, entry)
            self._validate_project_id(project_id)
            project = self.projects.get(project_id)
            project_root = Path(project.project_path).resolve()
            voices_root = self._contained_dir(project_root, "assets/voices")
            existing = self._find_import(voices_root, collection_id, entry_id)
            if existing:
                voice = self.voices.get(project_id, existing)
                catalog = self.catalogs.get(project_id)
                speaker = next((item for item in catalog.speakers if item.id == voice.speaker_profile_id), None)
                if speaker is None:
                    speaker = self._imported_speaker(project_root, entry, voice)
                    catalog = self.catalogs.save(project_id, catalog.model_copy(
                        update={"speakers": [*catalog.speakers, speaker]},
                    ))
                self._require_completed_training_output(project_id, project_root, voice, speaker)
                return VoiceCollectionImportResult(voice=voice, speaker=speaker, catalog=catalog)

            archive_root = self._entry_folder(collection_id, entry_id) / "payload"
            new_voice_id = f"voice-{uuid4().hex[:12]}"
            new_speaker_id = f"speaker-{uuid4().hex[:12]}"
            folder = voices_root / new_voice_id
            stage = voices_root / f".{new_voice_id}.tmp"
            stage.mkdir()
            try:
                reference_rel = "reference.wav"
                self._copy_from_archive(archive_root, entry.voice.reference_audio, stage / reference_rel)
                adapter_rel = self._import_artifact(
                    archive_root, entry.voice.adapter_path, stage, "adapter",
                    expect_directory=entry.voice.kind == "lora",
                )
                model_rel = self._import_artifact(
                    archive_root, entry.voice.model_path, stage, "model",
                    expect_directory=entry.voice.kind == "full",
                )

                speaker = entry.speaker.model_copy(update={"id": new_speaker_id})
                if speaker.voice_consent and speaker.voice_consent.evidence:
                    evidence = speaker.voice_consent.evidence
                    evidence_name = PurePosixPath(evidence.path).name
                    evidence_rel = f"assets/voices/{new_voice_id}/consent-evidence/{evidence_name}"
                    self._copy_from_archive(archive_root, evidence.path, stage / "consent-evidence" / evidence_name)
                    evidence = evidence.model_copy(update={"path": evidence_rel})
                    speaker = speaker.model_copy(update={
                        "voice_consent": speaker.voice_consent.model_copy(update={"evidence": evidence})
                    })

                voice = entry.voice.model_copy(update={
                    "id": new_voice_id,
                    "speaker_profile_id": new_speaker_id,
                    "collection_source": VoiceCollectionSource(
                        collection_id=collection_id,
                        entry_id=entry_id,
                    ),
                    "reference_audio": f"assets/voices/{new_voice_id}/{reference_rel}",
                    "model_path": f"assets/voices/{new_voice_id}/{model_rel}" if model_rel else None,
                    "adapter_path": f"assets/voices/{new_voice_id}/{adapter_rel}" if adapter_rel else None,
                    "source_run_id": None,
                    "reference_segment_id": None,
                    # The source aggregate has already passed its gate. This single
                    # imported member must not claim to be part of a destination set.
                    "model_set_id": None,
                })
                marker = {
                    "collectionId": collection_id,
                    "entryId": entry_id,
                    "sourceProjectId": entry.source_project_id,
                    "sourceVoiceId": entry.voice.id,
                    "sourceRunId": entry.voice.source_run_id,
                    "sourceReferenceSegmentId": entry.voice.reference_segment_id,
                    "sourceModelSetId": entry.voice.model_set_id,
                    "provenance": self._verified_entry_lineage(collection_id, entry_id, entry)["provenance"],
                    "artifactHashes": self._artifact_hashes_for_import(
                        stage, reference_rel, adapter_rel, model_rel,
                        "consent-evidence" if speaker.voice_consent and speaker.voice_consent.evidence else None,
                    ),
                }
                self._write_json(stage / "collection-import.json", marker)
                self._write_json(stage / "voice.json", voice.model_dump(mode="json", by_alias=True))

                catalog = self.catalogs.get(project_id)
                if any(item.id == new_speaker_id for item in catalog.speakers):
                    raise ValueError("Generated Speaker Profile ID already exists; retry the import.")
                updated_catalog = catalog.model_copy(update={"speakers": [*catalog.speakers, speaker]})

                stage.replace(folder)
                try:
                    updated_catalog = self.catalogs.save(project_id, updated_catalog)
                except Exception:
                    shutil.rmtree(folder, ignore_errors=True)
                    raise
                return VoiceCollectionImportResult(voice=voice, speaker=speaker, catalog=updated_catalog)
            except Exception:
                shutil.rmtree(stage, ignore_errors=True)
                raise

    def store_consent_evidence(self, project_id: str, name: str, content: bytes) -> ConsentEvidence:
        self._validate_project_id(project_id)
        if not content or len(content) > _MAX_CONSENT_EVIDENCE:
            raise ValueError("Consent evidence must be non-empty and at most 10 MiB.")
        original_name = Path(name.replace("\\", "/")).name.strip()
        extension = Path(original_name).suffix.lower()
        if extension not in _ALLOWED_EVIDENCE_EXTENSIONS:
            raise ValueError("Evidence must be a PDF, PNG/JPEG/WebP image, or plain text file.")
        self._validate_evidence(extension, content)
        project = self.projects.get(project_id)
        project_root = Path(project.project_path).resolve()
        folder = self._contained_dir(project_root, "assets/consent-evidence")
        stored_name = f"evidence-{uuid4().hex}{extension}"
        relative = f"assets/consent-evidence/{stored_name}"
        path = folder / stored_name
        temporary = folder / f".{stored_name}.tmp"
        try:
            temporary.write_bytes(content)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
        return ConsentEvidence(path=relative, name=original_name[:255])

    def _read_collection(self, collection_id: str) -> VoiceCollection:
        folder = self._folder(collection_id)
        record = folder / "collection.json"
        if record.is_symlink() or not record.is_file():
            raise KeyError(collection_id)
        metadata = json.loads(record.read_text(encoding="utf-8"))
        entries: list[VoiceCollectionEntry] = []
        entries_root = self._contained_dir(folder, "entries")
        for entry_folder in sorted(entries_root.glob("entry-*")):
            if (entry_folder.is_symlink() or not entry_folder.is_dir()
                    or entry_folder.resolve().parent != entries_root.resolve()):
                continue
            entry_record = entry_folder / "entry.json"
            if entry_record.is_symlink() or not entry_record.is_file():
                continue
            try:
                entries.append(VoiceCollectionEntry.model_validate_json(entry_record.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue
        metadata["entries"] = [item.model_dump(mode="json", by_alias=True) for item in entries]
        return VoiceCollection.model_validate(metadata)

    def _read_entry(self, collection_id: str, entry_id: str) -> VoiceCollectionEntry:
        record = self._entry_folder(collection_id, entry_id) / "entry.json"
        if record.is_symlink() or not record.is_file():
            raise KeyError(entry_id)
        return VoiceCollectionEntry.model_validate_json(record.read_text(encoding="utf-8"))

    def _folder(self, collection_id: str) -> Path:
        return child_folder(self.root, collection_id)

    def _entry_folder(self, collection_id: str, entry_id: str) -> Path:
        collection = self._folder(collection_id)
        entries = self._contained_dir(collection, "entries")
        return child_folder(entries, entry_id)

    def _contained_dir(self, root: Path, relative: str) -> Path:
        result = root
        for part in relative.split("/"):
            result = result / part
            if result.is_symlink():
                raise ValueError("Storage path cannot traverse a symbolic link.")
        resolved_root = root.resolve()
        resolved = result.resolve()
        if resolved != resolved_root and resolved_root not in resolved.parents:
            raise ValueError("Storage path escaped its root.")
        result.mkdir(parents=True, exist_ok=True)
        return result

    def _require_publishable_model_set(self, project_id: str, voice: ProjectVoice) -> None:
        if not voice.model_set_id:
            return
        try:
            model_set = self.model_sets.get(project_id, voice.model_set_id)
        except (KeyError, ValueError) as exc:
            raise ValueError("Voice belongs to a missing Voice Model Set and cannot be exported.") from exc
        if (model_set.status != "published" or voice.id not in model_set.voice_ids
                or model_set.gate is None or not model_set.gate.passed):
            raise ValueError("Voice Model Set must pass its identity gate before collection export.")

    def _require_completed_training_output(
        self, project_id: str, project_root: Path, voice: ProjectVoice, speaker: SpeakerProfile,
    ) -> dict:
        if not voice.source_run_id:
            marker_relative = f"assets/voices/{voice.id}/collection-import.json"
            marker_path = self._safe_relative_source(project_root, marker_relative)
            if not marker_path.is_file():
                raise ValueError("Voice has no completed training run or verified collection import lineage.")
            try:
                marker = json.loads(marker_path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as exc:
                raise ValueError("Imported voice lineage marker is unreadable.") from exc
            if marker.get("artifactHashes") != self._artifact_hashes_for_voice(project_root, voice, speaker):
                raise ValueError("Imported voice artifacts changed after collection import.")
            source_collection_id = marker.get("collectionId")
            source_entry_id = marker.get("entryId")
            source_entry = self._read_entry(source_collection_id, source_entry_id)
            if (marker.get("sourceProjectId") != source_entry.source_project_id
                    or marker.get("sourceVoiceId") != source_entry.voice.id
                    or marker.get("sourceRunId") != source_entry.voice.source_run_id
                    or marker.get("sourceReferenceSegmentId") != source_entry.voice.reference_segment_id
                    or marker.get("sourceModelSetId") != source_entry.voice.model_set_id):
                raise ValueError("Imported voice lineage does not match its archived collection entry.")
            source_lineage = self._verified_entry_lineage(source_collection_id, source_entry_id, source_entry)
            if marker.get("provenance") != source_lineage.get("provenance"):
                raise ValueError("Imported voice provenance does not match its archived collection entry.")
            provenance = dict(source_lineage["provenance"])
            chain = list(provenance.get("importChain", []))
            chain.append({
                "collectionId": source_collection_id,
                "entryId": source_entry_id,
                "projectId": project_id,
                "voiceId": voice.id,
            })
            provenance["importChain"] = chain
            return provenance
        if not _SAFE_SOURCE_ID.fullmatch(voice.source_run_id):
            raise ValueError("Voice training run ID is invalid.")
        try:
            run = self.runs.get(project_id, voice.source_run_id)
        except KeyError as exc:
            raise ValueError("Voice training run is missing; it cannot be exported as trained output.") from exc
        if run.status != "complete" or run.speaker_profile_id != voice.speaker_profile_id:
            raise ValueError("Voice training run must be complete for this Speaker Profile.")

        artifacts = [value for value in (voice.adapter_path, voice.model_path) if value]
        if not artifacts:
            raise ValueError("Voice has no trained model artifact.")
        run_root = self.runs.run_dir(project_id, run.id).resolve()
        output_paths: set[Path] = set()
        for relative in artifacts:
            source = self._safe_relative_source(project_root, relative)
            if run_root != source and run_root not in source.parents:
                raise ValueError("Voice model artifacts must remain inside their training run.")
            output_paths.add(source)
        checkpoint_paths: set[Path] = set()
        for checkpoint in run.checkpoints:
            if checkpoint.bytes <= 0:
                continue
            # Training records are written by Windows runtimes and may retain
            # native separators. Normalize this persisted path only; the
            # project-relative validator still rejects traversal and drives.
            checkpoint_path = checkpoint.path.replace("\\", "/")
            try:
                source = self._safe_relative_source(project_root, checkpoint_path)
                self._require_nonempty(project_root, checkpoint_path, "training checkpoint")
            except (OSError, ValueError):
                continue
            if run_root == source or run_root in source.parents:
                checkpoint_paths.add(source)
        if not output_paths.intersection(checkpoint_paths):
            raise ValueError("Voice artifact is not a retained non-empty checkpoint from its completed run.")
        model_set = None
        if voice.model_set_id:
            try:
                model_set = self.model_sets.get(project_id, voice.model_set_id)
            except (KeyError, ValueError) as exc:
                raise ValueError("Voice belongs to a missing Voice Model Set and cannot be exported.") from exc
            if (model_set.status != "published" or voice.id not in model_set.voice_ids
                    or model_set.gate is None or not model_set.gate.passed):
                raise ValueError("Voice Model Set must pass its identity gate before collection export.")
        return {
            "sourceProjectId": project_id,
            "sourceProjectName": self.projects.get(project_id).name,
            "sourceVoiceId": voice.id,
            "sourceRunId": run.id,
            "sourceReferenceSegmentId": voice.reference_segment_id,
            "sourceModelSetId": model_set.id if model_set else None,
            "sourceRun": run.model_dump(mode="json", by_alias=True),
            "sourceModelSet": model_set.model_dump(mode="json", by_alias=True) if model_set else None,
            "importChain": [],
        }

    def _verified_entry_lineage(
        self, collection_id: str, entry_id: str, entry: VoiceCollectionEntry,
    ) -> dict:
        folder = self._entry_folder(collection_id, entry_id)
        record = folder / "lineage.json"
        if record.is_symlink() or not record.is_file():
            raise ValueError("Collection entry is missing verified artifact lineage.")
        try:
            lineage = json.loads(record.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ValueError("Collection entry lineage is unreadable.") from exc
        actual = self._artifact_hashes_for_voice(folder / "payload", entry.voice, entry.speaker)
        if lineage.get("artifactHashes") != actual:
            raise ValueError("Archived collection artifacts do not match their recorded hashes.")
        provenance = lineage.get("provenance")
        if not isinstance(provenance, dict):
            raise ValueError("Collection entry is missing source provenance.")
        source_run = provenance.get("sourceRun")
        if not isinstance(source_run, dict) or source_run.get("status") != "complete":
            raise ValueError("Collection entry does not prove a completed training run.")
        if not source_run.get("id") or not source_run.get("checkpoints"):
            raise ValueError("Collection entry does not retain training checkpoint lineage.")
        import_chain = provenance.get("importChain", [])
        if import_chain:
            last_import = import_chain[-1]
            if (last_import.get("projectId") != entry.source_project_id
                    or last_import.get("voiceId") != entry.voice.id):
                raise ValueError("Collection entry import lineage does not match its project voice.")
        elif (provenance.get("sourceProjectId") != entry.source_project_id
              or provenance.get("sourceVoiceId") != entry.voice.id
              or source_run.get("id") != entry.voice.source_run_id
              or provenance.get("sourceRunId") != entry.voice.source_run_id
              or provenance.get("sourceReferenceSegmentId") != entry.voice.reference_segment_id
              or source_run.get("speakerProfileId") != entry.voice.speaker_profile_id):
            raise ValueError("Collection entry training lineage does not match its project voice.")
        source_set = provenance.get("sourceModelSet")
        if source_set is not None:
            if not isinstance(source_set, dict):
                raise ValueError("Collection entry Voice Model Set gate record is invalid.")
            gate = source_set.get("gate")
            if (source_set.get("status") != "published" or not isinstance(gate, dict) or not gate.get("passed")
                    or provenance.get("sourceVoiceId") not in source_set.get("voiceIds", [])
                    or provenance.get("sourceModelSetId") != source_set.get("id")):
                raise ValueError("Collection entry does not prove a published Voice Model Set gate.")
        elif not provenance.get("importChain") and entry.voice.model_set_id:
            raise ValueError("Collection entry is missing its Voice Model Set gate record.")
        return lineage

    def _artifact_hashes_for_voice(
        self, root: Path, voice: ProjectVoice, speaker: SpeakerProfile,
    ) -> dict:
        return {
            "reference": self._hash_tree(self._safe_relative_source(root, voice.reference_audio)),
            "adapter": self._hash_tree(self._safe_relative_source(root, voice.adapter_path)) if voice.adapter_path else None,
            "model": self._hash_tree(self._safe_relative_source(root, voice.model_path)) if voice.model_path else None,
            "consentEvidence": (
                self._hash_tree(self._safe_relative_source(root, speaker.voice_consent.evidence.path))
                if speaker.voice_consent and speaker.voice_consent.evidence else None
            ),
        }

    def _artifact_hashes_for_import(
        self, stage: Path, reference: str, adapter: str | None, model: str | None, evidence: str | None,
    ) -> dict:
        return {
            "reference": self._hash_tree(stage / reference),
            "adapter": self._hash_tree(stage / adapter) if adapter else None,
            "model": self._hash_tree(stage / model) if model else None,
            "consentEvidence": self._hash_tree(stage / evidence) if evidence else None,
        }

    @staticmethod
    def _hash_tree(path: Path) -> dict[str, str]:
        if path.is_file():
            FileVoiceCollections._resolve_tree_member(path.parent, path)
            files = [path]
            base = path.parent
        elif path.is_dir():
            files = []
            for current, directories, filenames in os.walk(path, followlinks=False):
                current_path = Path(current)
                for name in [*directories, *filenames]:
                    member = current_path / name
                    resolved = FileVoiceCollections._resolve_tree_member(path, member)
                    if resolved.is_file():
                        files.append(member)
            files.sort()
            base = path
        else:
            raise ValueError(f"Required artifact is missing: {path.name}")
        if not files or not any(item.stat().st_size > 0 for item in files):
            raise ValueError(f"Required artifact is empty: {path.name}")
        hashes: dict[str, str] = {}
        for item in files:
            digest = hashlib.sha256()
            with item.open("rb") as source:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
            hashes[item.relative_to(base).as_posix()] = digest.hexdigest()
        return hashes

    @staticmethod
    def _resolve_tree_member(root: Path, member: Path) -> Path:
        """Reject symlinks, junctions and children resolving outside the artifact root."""
        resolved_root = root.resolve(strict=True)
        resolved_member = member.resolve(strict=True)
        if resolved_member != resolved_root and resolved_root not in resolved_member.parents:
            raise ValueError("Artifact path escaped its root.")
        lexical_member = Path(os.path.abspath(member))
        if os.path.normcase(str(resolved_member)) != os.path.normcase(str(lexical_member)):
            raise ValueError("Artifact directory cannot contain symbolic links or junctions.")
        return resolved_member

    @staticmethod
    def _validate_project_id(project_id: str) -> None:
        if not _SAFE_SOURCE_ID.fullmatch(project_id):
            raise ValueError("Project ID is invalid.")

    def _archive_voice(self, project_root: Path, archive_root: Path, voice: ProjectVoice) -> ProjectVoice:
        if voice.kind == "clone":
            raise ValueError("Voice collections accept trained LoRA, full, or VC voices only.")
        reference = self._safe_relative_source(project_root, voice.reference_audio)
        if not reference.is_file():
            raise ValueError("Voice reference audio must be a file.")
        self._copy_tree(reference, archive_root.joinpath(*PurePosixPath(voice.reference_audio).parts))
        self._require_nonempty(archive_root, voice.reference_audio, "reference audio")
        if voice.kind == "lora":
            if not voice.adapter_path:
                raise ValueError("Trained LoRA voice has no adapter artifact.")
            self._copy_from_project(project_root, voice.adapter_path, archive_root)
            self._require_nonempty(archive_root, voice.adapter_path, "LoRA adapter")
        elif voice.kind == "full":
            if not voice.model_path:
                raise ValueError("Full voice has no model artifact.")
            self._copy_from_project(project_root, voice.model_path, archive_root)
            self._require_nonempty(archive_root, voice.model_path, "full model")
        elif voice.kind == "vc":
            if voice.engine != "rvc":
                raise ValueError("Voice conversion collection entries must use the RVC engine.")
            if not voice.model_path:
                raise ValueError("VC voice has no model artifact.")
            if not voice.adapter_path:
                raise ValueError("VC voice has no retrieval index artifact.")
            self._copy_from_project(project_root, voice.model_path, archive_root)
            self._require_nonempty(archive_root, voice.model_path, "VC model")
            self._copy_from_project(project_root, voice.adapter_path, archive_root)
            self._require_nonempty(archive_root, voice.adapter_path, "VC index")
            if not self._safe_relative_source(archive_root, voice.model_path).is_file():
                raise ValueError("VC model artifact must be a weights file.")
            if not self._safe_relative_source(archive_root, voice.adapter_path).is_file():
                raise ValueError("VC retrieval index artifact must be a file.")
        else:
            raise ValueError("Voice collections accept trained LoRA, full, or VC voices only.")
        return voice

    def _archive_speaker(self, project_root: Path, archive_root: Path, speaker: SpeakerProfile) -> SpeakerProfile:
        consent = speaker.voice_consent
        if consent and consent.evidence:
            self._copy_from_project(project_root, consent.evidence.path, archive_root)
            self._require_nonempty(archive_root, consent.evidence.path, "consent evidence")
        return speaker

    def _imported_speaker(
        self, project_root: Path, entry: VoiceCollectionEntry, voice: ProjectVoice,
    ) -> SpeakerProfile:
        speaker = entry.speaker.model_copy(update={"id": voice.speaker_profile_id})
        if speaker.voice_consent and speaker.voice_consent.evidence:
            evidence = speaker.voice_consent.evidence
            evidence_name = PurePosixPath(evidence.path).name
            evidence_path = f"assets/voices/{voice.id}/consent-evidence/{evidence_name}"
            self._safe_relative_source(project_root, evidence_path)
            evidence = evidence.model_copy(update={"path": evidence_path})
            speaker = speaker.model_copy(update={
                "voice_consent": speaker.voice_consent.model_copy(update={"evidence": evidence})
            })
        return speaker

    def _copy_from_project(self, project_root: Path, relative: str, archive_root: Path) -> None:
        source = self._safe_relative_source(project_root, relative)
        destination = archive_root.joinpath(*PurePosixPath(relative).parts)
        self._copy_tree(source, destination)

    def _copy_from_archive(self, archive_root: Path, relative: str, destination: Path) -> None:
        source = self._safe_relative_source(archive_root, relative)
        self._copy_tree(source, destination)

    @staticmethod
    def _safe_relative_source(root: Path, relative: str) -> Path:
        candidate = PurePosixPath(relative)
        if (not relative or not candidate.parts or "\\" in relative or ":" in relative or candidate.is_absolute()
                or any(part in {"", ".", ".."} for part in candidate.parts)):
            raise ValueError("Asset path must be a safe project-relative path.")
        source = root
        for part in candidate.parts:
            source = source / part
            FileVoiceCollections._resolve_tree_member(root, source)
        resolved_root = root.resolve()
        resolved = source.resolve(strict=True)
        if resolved != resolved_root and resolved_root not in resolved.parents:
            raise ValueError("Asset path escaped its project or archive root.")
        if not resolved.exists():
            raise FileNotFoundError(relative)
        return resolved

    def _copy_tree(self, source: Path, destination: Path) -> None:
        resolved_source = source.resolve(strict=True)
        resolved_destination = destination.resolve(strict=False)
        if (resolved_source.is_dir() and (
                resolved_destination == resolved_source or resolved_source in resolved_destination.parents
        )) or (resolved_source.is_file() and resolved_destination == resolved_source):
            raise ValueError("Artifact destination cannot be inside its source tree.")
        if source.is_file():
            self._resolve_tree_member(source.parent, source)
            if source.stat().st_size <= 0:
                raise ValueError(f"Required artifact is empty: {source.name}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            return
        if not source.is_dir():
            raise ValueError("Required artifact must be a file or directory.")
        found_nonempty = False
        for current, directories, filenames in os.walk(source, followlinks=False):
            current_path = Path(current)
            for name in [*directories, *filenames]:
                self._resolve_tree_member(source, current_path / name)
            relative = current_path.relative_to(source)
            target = destination / relative
            target.mkdir(parents=True, exist_ok=True)
            for filename in filenames:
                item = current_path / filename
                found_nonempty = found_nonempty or item.stat().st_size > 0
                shutil.copy2(item, target / filename)
        if not found_nonempty:
            raise ValueError(f"Required artifact directory is empty: {source.name}")

    @staticmethod
    def _require_nonempty(root: Path, relative: str, label: str) -> None:
        source = FileVoiceCollections._safe_relative_source(root, relative)
        if source.is_file() and source.stat().st_size > 0:
            return
        if source.is_dir() and any(path.is_file() and path.stat().st_size > 0 for path in source.rglob("*")):
            return
        raise ValueError(f"Required {label} artifact is missing or empty.")

    def _import_artifact(
        self,
        archive_root: Path,
        relative: str | None,
        destination_root: Path,
        stem: str,
        *,
        expect_directory: bool,
    ) -> str | None:
        if not relative:
            return None
        source = self._safe_relative_source(archive_root, relative)
        if source.is_dir() != expect_directory:
            expected = "directory" if expect_directory else "file"
            raise ValueError(f"{stem.title()} artifact must be a {expected}.")
        destination_name = stem if source.is_dir() else source.name
        destination = destination_root / destination_name
        self._copy_tree(source, destination)
        return destination_name

    @staticmethod
    def _write_json(path: Path, value: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    def _find_import(self, voices_root: Path, collection_id: str, entry_id: str) -> str | None:
        for marker in voices_root.glob("voice-*/collection-import.json"):
            if (marker.is_symlink() or marker.parent.is_symlink()
                    or marker.parent.resolve().parent != voices_root.resolve()):
                continue
            try:
                data = json.loads(marker.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if data.get("collectionId") == collection_id and data.get("entryId") == entry_id:
                return marker.parent.name
        return None

    @staticmethod
    def _validate_evidence(extension: str, content: bytes) -> None:
        valid = False
        if extension == ".pdf":
            valid = b"%PDF-" in content[:1024]
        elif extension == ".png":
            valid = content.startswith(b"\x89PNG\r\n\x1a\n")
        elif extension in {".jpg", ".jpeg"}:
            valid = content.startswith(b"\xff\xd8\xff")
        elif extension == ".webp":
            valid = content.startswith(b"RIFF") and content[8:12] == b"WEBP"
        elif extension == ".txt":
            try:
                content.decode("utf-8")
                valid = b"\x00" not in content
            except UnicodeDecodeError:
                valid = False
        if not valid:
            raise ValueError("Consent evidence content does not match its PDF, image, or text type.")
