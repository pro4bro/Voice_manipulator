from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.adapters.omnivoice_generator import file_digest
from app.domain.ports import ProjectRepository
from app.domain.reference_bindings import ReferenceAssignment, ReferenceBinding, ReferenceBindingDocument, ReferenceScope, ReferenceTarget


class FileReferenceBindings:
    """Portable requested property mappings. Assignment never claims synthesis."""

    _lock = threading.RLock()

    def __init__(self, projects: ProjectRepository, media: FileMediaLibrary, outputs: FileVoiceOutputs, scripts: FileVoiceScript):
        self.projects, self.media, self.outputs, self.scripts = projects, media, outputs, scripts

    def _path(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "scripts" / "reference-bindings.json"

    def get(self, project_id: str) -> ReferenceBindingDocument:
        with self._lock:
            path = self._path(project_id)
            document = ReferenceBindingDocument.model_validate_json(path.read_text(encoding="utf-8")) if path.is_file() else ReferenceBindingDocument()
            # Missing/unmarked inputs remain visible, without changing the stored intent.
            result = []
            hashes = {}
            paths = {}
            assets = {asset.id: asset for asset in self.media.list_metadata(project_id)}
            scope_cache = {}
            for binding in document.bindings:
                warnings = []
                status = "requested"
                for source in binding.sources:
                    try:
                        asset = assets[source.asset_id]
                        if source.asset_id not in paths:
                            paths[source.asset_id] = self.media.resolve_audio_path(project_id, source.asset_id)
                        if asset.deleted_at or not paths[source.asset_id].is_file():
                            raise KeyError(source.asset_id)
                        if not asset.reference_selected:
                            warnings.append(f"{source.name or source.asset_id}: không còn đánh dấu Reference.")
                        if asset.disabled:
                            if status != "missing": status = "stale"
                            warnings.append(f"{source.name or source.asset_id}: footage đang tắt.")
                        if source.asset_id not in hashes:
                            hashes[source.asset_id] = file_digest(paths[source.asset_id])
                        if source.audio_sha256 != hashes[source.asset_id]:
                            status = "stale" if status != "missing" else status
                            warnings.append(f"{source.name or source.asset_id}: audio reference đã thay đổi.")
                    except (OSError, KeyError, ValueError):
                        status = "missing"
                        warnings.append(f"{source.name or source.asset_id}: thiếu audio reference.")
                try:
                    text = self._target_text(project_id, binding.scope, binding.target, strict_revision=False, cache=scope_cache)
                    if text != binding.target.text:
                        raise ValueError("Target text changed.")
                except (OSError, KeyError, ValueError):
                    if status != "missing": status = "stale"
                    warnings.append("Vùng đích đã thay đổi hoặc không còn tồn tại.")
                result.append(binding.model_copy(update={"status": status, "warnings": warnings}))
            return document.model_copy(update={"bindings": result})

    @staticmethod
    def _key(scope: ReferenceScope, target: ReferenceTarget) -> str:
        # The logical target survives a save; revision remains validated provenance,
        # not a second assignment identity for the same sentence/span.
        payload = {"scope": {"kind": scope.kind, "id": scope.id}, "start": target.start, "end": target.end,
                   "rows": sorted(target.row_ids), "textRanges": [part.model_dump() for part in target.text_ranges]}
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    def assign(self, project_id: str, request: ReferenceAssignment) -> ReferenceBindingDocument:
        with self._lock:
            current = self.get(project_id)
            if current.revision != request.expected_revision:
                raise ScriptRevisionConflict("Reference đã thay đổi ở cửa sổ khác. Mở lại editor để gán.")
            if len({source.asset_id for source in request.sources}) != len(request.sources):
                raise ValueError("Mỗi reference footage chỉ xuất hiện một lần trong assignment.")
            sources = []
            assets = {asset.id: asset for asset in self.media.list_metadata(project_id)}
            for source in request.sources:
                asset = assets[source.asset_id]
                if not asset.reference_selected or asset.deleted_at or asset.disabled or asset.available_audio_tracks:
                    raise ValueError("Reference phải là audio footage/track đã đánh dấu và đang khả dụng.")
                if source.end > asset.duration + 0.000001:
                    raise ValueError("Reference span vượt quá thời lượng footage.")
                audio = self.media.resolve_audio_path(project_id, asset.id)
                if not audio.is_file():
                    raise ValueError("Thiếu audio reference. Kết nối lại footage trước khi gán.")
                sources.append(source.model_copy(update={"name": asset.name, "audio_sha256": file_digest(audio)}))
            candidates = []
            keys = set()
            scope_cache = {}
            existing = {self._key(binding.scope, binding.target): binding for binding in current.bindings}
            for target in request.targets:
                text = self._target_text(project_id, request.scope, target, strict_revision=True, cache=scope_cache)
                if text != target.text:
                    raise ScriptRevisionConflict("Nội dung vùng chọn đã đổi. Chọn lại vùng đích trước khi gán.")
                key = self._key(request.scope, target)
                if key in keys: raise ValueError("Vùng đích bị trùng trong assignment.")
                keys.add(key)
                previous = existing.get(key)
                candidates.append(ReferenceBinding(id=previous.id if previous else f"reference-{uuid4().hex[:12]}",
                    scope=request.scope, target=target, sources=sources,
                    created_at=previous.created_at if previous else datetime.now(timezone.utc)))
            saved = ReferenceBindingDocument(revision=current.revision + 1, bindings=[
                *[binding.model_copy(update={"status": "requested", "warnings": []}) for binding in current.bindings if self._key(binding.scope, binding.target) not in keys], *candidates])
            FileProjectRepository._atomic_write(self._path(project_id), saved.model_dump_json(by_alias=True, indent=2))
            return self.get(project_id)

    def delete(self, project_id: str, binding_id: str, expected_revision: int) -> ReferenceBindingDocument:
        with self._lock:
            current = self.get(project_id)
            if current.revision != expected_revision:
                raise ScriptRevisionConflict("Reference đã thay đổi. Làm mới trước khi bỏ gán.")
            if not any(binding.id == binding_id for binding in current.bindings):
                raise KeyError(binding_id)
            saved = current.model_copy(update={"revision": current.revision + 1, "bindings": [binding for binding in current.bindings if binding.id != binding_id]})
            FileProjectRepository._atomic_write(self._path(project_id), saved.model_dump_json(by_alias=True, indent=2))
            return self.get(project_id)

    def _scope_snapshot(self, project_id: str, scope: ReferenceScope, strict_revision: bool):
        row_texts: dict[str, str] = {}
        segments = []
        if scope.kind == "script":
            if scope.id != project_id: raise ValueError("Script không thuộc project này.")
            document = self.scripts.get(project_id)
            if strict_revision and scope.revision != str(document.revision):
                raise ScriptRevisionConflict("Script đang lưu hoặc đã thay đổi. Mở lại menu sau khi lưu.")
            row_texts = {row.id: row.text for row in document.rows}
            words, duration = [], 0
        elif scope.kind == "voice-output":
            output = self.outputs.get(project_id, scope.id)
            if not self.outputs.audio_path(project_id, scope.id).is_file(): raise ValueError("Thiếu audio của vùng đích.")
            if datetime.fromisoformat(scope.revision.replace("Z", "+00:00")) != output.created_at:
                raise ScriptRevisionConflict("Voice Output revision không còn khớp.")
            words, duration = output.words, output.duration
            row_texts = {segment.row_id: (segment.script_row or {}).get("text", segment.text) for segment in output.segments}
            segments = output.segments
        else:
            asset = self.media.get(project_id, scope.id)
            if asset.deleted_at or asset.disabled:
                raise ValueError("Vùng đích không còn khả dụng.")
            if strict_revision and datetime.fromisoformat(scope.revision.replace("Z", "+00:00")) != asset.updated_at:
                raise ScriptRevisionConflict("Footage đã thay đổi.")
            words, duration = asset.words, asset.duration
        return row_texts, words, duration, segments

    def _target_text(self, project_id: str, scope: ReferenceScope, target: ReferenceTarget, strict_revision: bool, cache: dict | None = None) -> str:
        cache = cache if cache is not None else {}
        revision = "" if scope.kind == "script" and not strict_revision else scope.revision
        key = (scope.kind, scope.id, revision, strict_revision)
        if key not in cache:
            cache[key] = self._scope_snapshot(project_id, scope, strict_revision)
        row_texts, words, duration, segments = cache[key]
        if scope.kind == "script" and target.start is not None:
            raise ValueError("Script chưa đọc không có timing audio.")
        if scope.kind == "voice-output":
            if target.start is None: raise ValueError("Voice Output cần vùng timing cụ thể.")
            for row_id in target.row_ids:
                segment = next((segment for segment in segments if segment.row_id == row_id), None)
                if segment is None or segment.end <= target.start or segment.start >= target.end:
                    raise ValueError("Câu không thuộc vùng audio đã chọn.")
        if scope.kind == "asset" and (target.start is None or target.row_ids):
            raise ValueError("Footage cần vùng audio cụ thể.")
        if target.start is not None and target.end > duration + 0.000001:
            raise ValueError("Vùng chọn vượt quá thời lượng audio.")
        for index in target.word_indexes:
            if index >= len(words) or (target.start is not None and
                (float(words[index]["end"]) <= target.start or float(words[index]["start"]) >= target.end)):
                raise ValueError("Word không thuộc source revision hoặc vùng chọn.")
        if any(row_id not in row_texts for row_id in target.row_ids): raise ValueError("Câu đã chọn không tồn tại.")
        if target.text_ranges:
            text = []
            for part in target.text_ranges:
                source = row_texts.get(part.row_id)
                if source is None or part.end > len(source.encode("utf-16-le")) // 2: raise ValueError("Text span không còn khớp.")
                text.append(source.encode("utf-16-le")[part.start * 2:part.end * 2].decode("utf-16-le"))
            return "\n".join(text)
        if target.word_indexes: return " ".join(str(words[index].get("text", "")) for index in target.word_indexes)
        if target.row_ids: return "\n".join(row_texts[row_id] for row_id in target.row_ids)
        return ""
