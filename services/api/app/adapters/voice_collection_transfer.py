from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import shutil
import stat
import unicodedata
import zipfile
from uuid import uuid4

from app.adapters.file_voice_collections import FileVoiceCollections
from app.adapters.collection_voice_preview import verified_preview
from app.domain.models import VoiceCollectionEntry, VoiceCollectionProperties


MAX_EXPANDED_BYTES = 8 * 1024 * 1024 * 1024
MAX_UPLOAD_BYTES = MAX_EXPANDED_BYTES + 80 * 1024 * 1024
MAX_FILES = 20_000
MAX_MANIFEST_BYTES = 16 * 1024 * 1024
_CHUNK_SIZE = 1024 * 1024
_SHA256 = re.compile(r"^[a-f0-9]{64}$")


class FileVoiceCollectionTransfer:
    """Create and validate portable, single-entry Voice Collection packages."""

    def __init__(self, collections: FileVoiceCollections) -> None:
        self.collections = collections

    def export_entry(self, collection_id: str, entry_id: str, destination: Path) -> VoiceCollectionEntry:
        store = self.collections
        with store._lock:
            collection = store.get(collection_id)
            entry = store._read_entry(collection_id, entry_id)
            lineage = store._verified_entry_lineage(collection_id, entry_id, entry)
            entry_folder = store._entry_folder(collection_id, entry_id)
            payload_root = entry_folder / "payload"
            if payload_root.is_symlink() or not payload_root.is_dir():
                raise ValueError("Collection entry payload is missing or unsafe.")

            sources: list[tuple[str, Path]] = []
            for name in ("entry.json", "lineage.json"):
                path = entry_folder / name
                if path.is_symlink() or not path.is_file():
                    raise ValueError("Collection entry metadata is missing or unsafe.")
                if path.stat().st_size > MAX_MANIFEST_BYTES:
                    raise ValueError("Voice package metadata exceeds the size limit.")
                self._strict_json_loads(path.read_bytes())
                sources.append((name, path))

            payload_sources: dict[str, Path] = {}
            for relative in self._artifact_paths(entry):
                artifact = store._safe_relative_source(payload_root, relative)
                if artifact.is_file():
                    payload_sources[f"payload/{PurePosixPath(relative).as_posix()}"] = artifact
                elif artifact.is_dir():
                    for current, directories, filenames in os.walk(artifact, followlinks=False):
                        current_path = Path(current)
                        for name in [*directories, *filenames]:
                            store._resolve_tree_member(artifact, current_path / name)
                        for filename in filenames:
                            path = current_path / filename
                            if not path.is_file():
                                raise ValueError("Collection payload can contain regular files only.")
                            member = path.relative_to(payload_root).as_posix()
                            payload_sources[f"payload/{member}"] = path
                else:
                    raise ValueError("Collection payload must contain regular files and directories only.")
            sources.extend(payload_sources.items())
            # Samples travel with the trained model when already generated.
            # A queued/error job is not an artifact and is never exported.
            cached = verified_preview(entry_folder, entry, lineage)
            if cached:
                sources.extend((f"preview/{name}", entry_folder / "preview" / name)
                               for name in ("preview.json", "sample.wav"))

            if len(sources) > MAX_FILES:
                raise ValueError("Voice package contains too many files.")
            inventory: list[dict[str, object]] = []
            total_size = 0
            for package_path, source in sorted(sources):
                self._safe_package_path(package_path)
                size, digest = self._hash_file(source)
                if package_path in {"entry.json", "lineage.json"} and size > MAX_MANIFEST_BYTES:
                    raise ValueError("Voice package metadata exceeds the size limit.")
                total_size += size
                if total_size > MAX_EXPANDED_BYTES:
                    raise ValueError("Voice package exceeds the expanded size limit.")
                inventory.append({"path": package_path, "sizeBytes": size, "sha256": digest})

            for relative in self._artifact_paths(entry):
                store._safe_relative_source(payload_root, relative)
            self._reject_absolute_metadata_paths(entry.model_dump(mode="json", by_alias=True))
            self._reject_absolute_metadata_paths(lineage)

            manifest = {
                "schemaVersion": 1,
                "kind": "pro4bro-voice-collection-entry",
                "sourceCollection": {
                    "id": collection.id,
                    "name": collection.name,
                    "properties": collection.properties.model_dump(mode="json", by_alias=True),
                },
                "entryId": entry.id,
                "inventory": inventory,
            }
            manifest_bytes = json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            if len(manifest_bytes) > MAX_MANIFEST_BYTES:
                raise ValueError("Voice package manifest exceeds the size limit.")
            self._strict_json_loads(manifest_bytes)

            destination.parent.mkdir(parents=True, exist_ok=True)
            try:
                with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
                    archive.writestr("manifest.json", manifest_bytes)
                    for package_path, source in sorted(sources):
                        archive.write(source, package_path)
                self._verify_written_package(destination, manifest, sources)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
            return entry

    def import_package(self, collection_id: str, package: Path) -> VoiceCollectionEntry:
        store = self.collections
        stage: Path | None = None
        with store._lock:
            store.get(collection_id)
            entries_root = store._contained_dir(store._folder(collection_id), "entries")
            try:
                try:
                    with zipfile.ZipFile(package, "r") as archive:
                        infos, info_by_name = self._validate_archive_members(archive)
                        manifest = self._read_manifest(archive, info_by_name)
                        expected = self._validate_inventory(manifest, info_by_name)
                        new_entry_id = f"entry-{uuid4().hex[:12]}"
                        stage = entries_root / f".{new_entry_id}.tmp"
                        stage.mkdir()
                        for name, info in info_by_name.items():
                            if name == "manifest.json":
                                continue
                            expected_size, expected_hash = expected[name]
                            destination = stage.joinpath(*PurePosixPath(name).parts)
                            destination.parent.mkdir(parents=True, exist_ok=True)
                            self._extract_member(archive, info, destination, expected_size, expected_hash)
                except zipfile.BadZipFile as exc:
                    raise ValueError("Voice package is not a valid ZIP file.") from exc
                except (KeyError, OSError, RuntimeError) as exc:
                    if isinstance(exc, KeyError):
                        raise ValueError("Voice package is missing required files.") from exc
                    raise ValueError("Voice package could not be safely extracted.") from exc

                entry_record = stage / "entry.json"
                lineage_record = stage / "lineage.json"
                if entry_record.is_symlink() or lineage_record.is_symlink():
                    raise ValueError("Voice package metadata cannot be symbolic links.")
                entry_data = self._strict_json_loads(entry_record.read_bytes())
                entry = VoiceCollectionEntry.model_validate(entry_data)
                if entry.id != manifest["entryId"]:
                    raise ValueError("Voice package entry identity does not match its manifest.")
                store._validate_project_id(entry.source_project_id)
                store._validate_project_id(entry.voice.id)
                if entry.speaker.id != entry.voice.speaker_profile_id:
                    raise ValueError("Voice package Speaker Profile identity does not match its voice.")
                lineage = self._strict_json_loads(lineage_record.read_bytes())
                if not isinstance(lineage, dict):
                    raise ValueError("Voice package lineage metadata is invalid.")
                self._reject_absolute_metadata_paths(entry.model_dump(mode="json", by_alias=True))
                self._reject_absolute_metadata_paths(lineage)

                payload_root = stage / "payload"
                if payload_root.is_symlink() or not payload_root.is_dir():
                    raise ValueError("Voice package payload directory is missing.")
                for relative in self._artifact_paths(entry):
                    store._safe_relative_source(payload_root, relative)
                self._require_artifact_shapes(entry, payload_root)
                verified = store._verified_entry_lineage_at(stage, entry)
                if verified != lineage:
                    raise ValueError("Voice package lineage could not be verified.")
                verified_preview(stage, entry, lineage)

                duplicate = next((item for item in store.get(collection_id).entries
                                  if item.source_project_id == entry.source_project_id
                                  and item.voice.id == entry.voice.id), None)
                if duplicate:
                    store._verified_entry_lineage(collection_id, duplicate.id, duplicate)
                    return duplicate

                published = entry.model_copy(update={"id": new_entry_id})
                temporary_record = stage / ".entry.json.tmp"
                store._write_json(temporary_record, published.model_dump(mode="json", by_alias=True))
                temporary_record.replace(entry_record)
                destination = entries_root / new_entry_id
                stage.replace(destination)
                stage = None
                return published
            finally:
                if stage and stage.exists():
                    shutil.rmtree(stage, ignore_errors=True)

    def _validate_archive_members(
        self, archive: zipfile.ZipFile,
    ) -> tuple[list[zipfile.ZipInfo], dict[str, zipfile.ZipInfo]]:
        infos = archive.infolist()
        if not infos or len(infos) > MAX_FILES + 1:
            raise ValueError("Voice package contains too many or too few files.")
        info_by_name: dict[str, zipfile.ZipInfo] = {}
        folded_names: set[str] = set()
        expanded = 0
        for info in infos:
            name = self._safe_package_path(info.filename)
            folded = self._path_collision_key(name)
            if folded in folded_names:
                raise ValueError("Voice package contains duplicate paths.")
            folded_names.add(folded)
            if info.is_dir():
                raise ValueError("Voice package must contain files, not directory entries.")
            if info.flag_bits & 0x1:
                raise ValueError("Encrypted voice packages are not supported.")
            mode = info.external_attr >> 16
            file_type = stat.S_IFMT(mode)
            if file_type not in (0, stat.S_IFREG):
                raise ValueError("Voice package contains a link or non-regular file.")
            if info.file_size < 0:
                raise ValueError("Voice package contains an invalid file size.")
            expanded += info.file_size
            if expanded > MAX_EXPANDED_BYTES:
                raise ValueError("Voice package exceeds the expanded size limit.")
            info_by_name[name] = info
        if "manifest.json" not in info_by_name:
            raise ValueError("Voice package manifest is missing.")
        if info_by_name["manifest.json"].file_size > MAX_MANIFEST_BYTES:
            raise ValueError("Voice package manifest exceeds the size limit.")
        return infos, info_by_name

    def _read_manifest(self, archive: zipfile.ZipFile, info_by_name: dict[str, zipfile.ZipInfo]) -> dict:
        info = info_by_name["manifest.json"]
        try:
            with archive.open(info, "r") as source:
                content = source.read(MAX_MANIFEST_BYTES + 1)
        except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
            raise ValueError("Voice package manifest cannot be read.") from exc
        if len(content) > MAX_MANIFEST_BYTES or len(content) != info.file_size:
            raise ValueError("Voice package manifest exceeds the size limit.")
        try:
            manifest = self._strict_json_loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Voice package manifest is invalid JSON.") from exc
        if (not isinstance(manifest, dict) or type(manifest.get("schemaVersion")) is not int
                or manifest.get("schemaVersion") != 1
                or manifest.get("kind") != "pro4bro-voice-collection-entry"):
            raise ValueError("Voice package format or schema version is not supported.")
        source_collection = manifest.get("sourceCollection")
        if (not isinstance(source_collection, dict) or not isinstance(source_collection.get("name"), str)
                or len(source_collection["name"]) > 120 or not isinstance(source_collection.get("id"), str)):
            raise ValueError("Voice package source collection metadata is missing.")
        self.collections._validate_project_id(source_collection["id"])
        try:
            VoiceCollectionProperties.model_validate(source_collection.get("properties", {}))
        except ValueError as exc:
            raise ValueError("Voice package collection properties are invalid.") from exc
        if (not isinstance(manifest.get("entryId"), str) or not manifest["entryId"].startswith("entry-")):
            raise ValueError("Voice package source entry ID is invalid.")
        self.collections._validate_project_id(manifest["entryId"])
        self._reject_absolute_metadata_paths(manifest)
        return manifest

    def _validate_inventory(
        self, manifest: dict, info_by_name: dict[str, zipfile.ZipInfo],
    ) -> dict[str, tuple[int, str]]:
        inventory = manifest.get("inventory")
        if not isinstance(inventory, list) or not inventory or len(inventory) > MAX_FILES:
            raise ValueError("Voice package inventory is invalid.")
        expected: dict[str, tuple[int, str]] = {}
        folded: set[str] = set()
        for item in inventory:
            if not isinstance(item, dict) or set(item) != {"path", "sizeBytes", "sha256"}:
                raise ValueError("Voice package inventory entry is invalid.")
            name = self._safe_package_path(item["path"])
            normalized = self._path_collision_key(name)
            if name == "manifest.json" or normalized in folded:
                raise ValueError("Voice package inventory contains a duplicate or reserved path.")
            folded.add(normalized)
            size = item["sizeBytes"]
            digest = item["sha256"]
            if isinstance(size, bool) or not isinstance(size, int) or size < 0:
                raise ValueError("Voice package inventory file size is invalid.")
            if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
                raise ValueError("Voice package inventory SHA256 is invalid.")
            if name in {"entry.json", "lineage.json"} and size > MAX_MANIFEST_BYTES:
                raise ValueError("Voice package metadata exceeds the size limit.")
            info = info_by_name.get(name)
            if info is None or info.file_size != size:
                raise ValueError("Voice package has missing files or inventory size mismatches.")
            expected[name] = (size, digest)
        if set(expected) != set(info_by_name) - {"manifest.json"}:
            raise ValueError("Voice package has missing or unlisted files.")
        if not {"entry.json", "lineage.json"}.issubset(expected):
            raise ValueError("Voice package must include entry and lineage metadata.")
        return expected

    def _extract_member(
        self,
        archive: zipfile.ZipFile,
        info: zipfile.ZipInfo,
        destination: Path,
        expected_size: int,
        expected_hash: str,
    ) -> None:
        digest = hashlib.sha256()
        written = 0
        try:
            with archive.open(info, "r") as source, destination.open("xb") as target:
                while chunk := source.read(_CHUNK_SIZE):
                    written += len(chunk)
                    if written > expected_size or written > MAX_EXPANDED_BYTES:
                        raise ValueError("Voice package expanded beyond its declared size.")
                    digest.update(chunk)
                    target.write(chunk)
        except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
            raise ValueError("Voice package member is corrupt or unreadable.") from exc
        if written != expected_size or digest.hexdigest() != expected_hash:
            raise ValueError("Voice package file hash or size does not match its inventory.")

    def _verify_written_package(self, package: Path, manifest: dict, sources: list[tuple[str, Path]]) -> None:
        expected = {item["path"]: (item["sizeBytes"], item["sha256"]) for item in manifest["inventory"]}
        with zipfile.ZipFile(package, "r") as archive:
            if set(archive.namelist()) != {"manifest.json", *expected}:
                raise ValueError("Exported voice package inventory changed during creation.")
            for name, (size, digest) in expected.items():
                actual_digest = hashlib.sha256()
                actual_size = 0
                with archive.open(name, "r") as source:
                    while chunk := source.read(_CHUNK_SIZE):
                        actual_size += len(chunk)
                        actual_digest.update(chunk)
                if actual_size != size or actual_digest.hexdigest() != digest:
                    raise ValueError("Exported voice package changed while being created.")

    @staticmethod
    def _safe_package_path(value: object) -> str:
        if not isinstance(value, str) or not value or "\\" in value or ":" in value or "\x00" in value:
            raise ValueError("Voice package paths must be safe relative POSIX paths.")
        path = PurePosixPath(value)
        if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
            raise ValueError("Voice package path traversal is not allowed.")
        if path.as_posix() != value or PureWindowsPath(value).is_absolute():
            raise ValueError("Voice package paths must be canonical relative paths.")
        for part in path.parts:
            normalized_part = unicodedata.normalize("NFKC", part).casefold()
            if part.rstrip(" .") != part or normalized_part.split(".", 1)[0] in {
                "con", "prn", "aux", "nul", *(f"com{number}" for number in range(1, 10)),
                *(f"lpt{number}" for number in range(1, 10)),
            }:
                raise ValueError("Voice package path contains a Windows-reserved component.")
        return value

    @staticmethod
    def _path_collision_key(value: str) -> str:
        return "/".join(unicodedata.normalize("NFKC", part).casefold() for part in PurePosixPath(value).parts)

    @staticmethod
    def _strict_json_loads(content: bytes) -> object:
        if re.search(rb"(?i)(?:[A-Z]:[\\/]|\\\\)", content):
            raise ValueError("Voice package metadata cannot contain Windows-absolute paths.")

        def object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
            result: dict[str, object] = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError(f"Duplicate JSON property: {key}")
                result[key] = value
            return result

        try:
            return json.loads(content.decode("utf-8"), object_pairs_hook=object_without_duplicate_keys)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Voice package JSON metadata is invalid.") from exc

    @staticmethod
    def _hash_file(path: Path) -> tuple[int, str]:
        digest = hashlib.sha256()
        size = 0
        with path.open("rb") as source:
            while chunk := source.read(_CHUNK_SIZE):
                size += len(chunk)
                digest.update(chunk)
        return size, digest.hexdigest()

    @staticmethod
    def _artifact_paths(entry: VoiceCollectionEntry) -> list[str]:
        paths = [entry.voice.reference_audio]
        if entry.voice.adapter_path:
            paths.append(entry.voice.adapter_path)
        if entry.voice.model_path:
            paths.append(entry.voice.model_path)
        if entry.speaker.voice_consent and entry.speaker.voice_consent.evidence:
            paths.append(entry.speaker.voice_consent.evidence.path)
        return paths

    @staticmethod
    def _require_artifact_shapes(entry: VoiceCollectionEntry, payload_root: Path) -> None:
        reference = FileVoiceCollectionTransfer._safe_path(payload_root, entry.voice.reference_audio)
        if not reference.is_file():
            raise ValueError("Voice reference artifact must be a file.")
        if entry.voice.kind == "lora":
            if not entry.voice.adapter_path or not FileVoiceCollectionTransfer._safe_path(payload_root, entry.voice.adapter_path).is_dir():
                raise ValueError("Trained LoRA adapter artifact must be a directory.")
        elif entry.voice.kind == "full":
            if not entry.voice.model_path or not FileVoiceCollectionTransfer._safe_path(payload_root, entry.voice.model_path).is_dir():
                raise ValueError("Full voice model artifact must be a directory.")
        elif entry.voice.kind == "vc":
            if entry.voice.engine != "rvc" or not entry.voice.model_path or not entry.voice.adapter_path:
                raise ValueError("Voice conversion packages must contain RVC weights and index files.")
            if (not FileVoiceCollectionTransfer._safe_path(payload_root, entry.voice.model_path).is_file()
                    or not FileVoiceCollectionTransfer._safe_path(payload_root, entry.voice.adapter_path).is_file()):
                raise ValueError("RVC weights and index artifacts must be files.")
        else:
            raise ValueError("Voice packages accept trained LoRA, full, or RVC voices only.")

    @staticmethod
    def _safe_path(root: Path, relative: str) -> Path:
        return FileVoiceCollections._safe_relative_source(root, relative)

    @staticmethod
    def _reject_absolute_metadata_paths(value: object, key: str = "") -> None:
        if isinstance(value, dict):
            for child_key, child in value.items():
                FileVoiceCollectionTransfer._reject_absolute_metadata_paths(child, str(child_key).casefold())
            return
        if isinstance(value, list):
            for child in value:
                FileVoiceCollectionTransfer._reject_absolute_metadata_paths(child, key)
            return
        if not isinstance(value, str):
            return
        path_keys = {"path", "filepath", "referenceaudio", "modelpath", "adapterpath", "outputdir", "outputpath"}
        if key in path_keys or key.endswith(("path", "dir", "folder")):
            if PurePosixPath(value).is_absolute() or PureWindowsPath(value).is_absolute():
                raise ValueError("Voice package metadata cannot contain machine-absolute paths.")

