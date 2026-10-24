"""Portable Version snapshots; source audio is immutable and never overwritten."""
import copy
import hashlib
import json
import re
import shutil
import threading
import wave
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.domain.models import VoiceOutput
from app.domain.voice_edits import VoiceEditDocument
from app.domain.voice_script_document import VoiceScriptDocument
from app.domain.voice_versions import VoiceVersionState
from app.domain.output_lifecycle import (normalize_recycle, find_slot, recycle_slot, restore_slot,
    recycled_entry, output_ids, slot_versions)
from app.adapters.output_artifacts import checked_path, purge_owned, export_owned

_SIDECARS = ("reference-bindings.json", "timing-plans.json")


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


class FileVoiceOutputSessions:
    _lock = threading.RLock()

    def __init__(self, outputs, scripts=None):
        self.outputs = outputs
        self.scripts = scripts or FileVoiceScript(outputs.projects)
        self._checking_out = False
        self.is_busy = lambda _project_id: False

    def root(self, project_id):
        return Path(self.outputs.projects.get(project_id).project_path)

    def _path(self, project_id):
        return self.root(project_id) / "scripts/voice-output-sessions.json"

    def _write(self, project_id, book):
        book["schemaVersion"] = 2
        book["revision"] += 1
        FileProjectRepository._atomic_write(self._path(project_id), encode(book))
        return book

    @staticmethod
    def _version(output_id, index, parent=None):
        return {"id": uuid4().hex, "name": f"Version {index}", "outputId": output_id,
            "parentVersionId": parent, "createdAt": datetime.now(timezone.utc).isoformat(), "disabled": False}

    @staticmethod
    def _next_index(slots, prefix):
        index = len(slots) + 1
        names = {slot["name"] for slot in slots}
        while f"{prefix} {index}" in names:
            index += 1
        return index

    def _script_from_output(self, output):
        rows, segments = [], []
        for segment in output.segments:
            row = copy.deepcopy(segment.script_row or {})
            sid = row.get("segmentId") or f"segment-{segment.row_id}"
            if sid not in {s["id"] for s in segments}:
                segments.append({"id": sid})
            rows.append({**row, "id": segment.row_id, "text": segment.text, "voiceId": segment.voice_id,
                "speakerProfileId": segment.speaker_profile_id, "segmentId": sid})
        return VoiceScriptDocument.model_validate({"segments": segments, "rows": rows})

    def base_composition(self, project_id, output_id):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,119}", output_id):
            raise ValueError("Voice Output ID không hợp lệ.")
        with wave.open(str(self.outputs.audio_path(project_id, output_id)), "rb") as pcm:
            frames = pcm.getnframes()
            if ((pcm.getnchannels(), pcm.getsampwidth(), pcm.getframerate(), pcm.getcomptype()) != (1, 2, 24000, "NONE")
                    or frames <= 0 or len(pcm.readframes(frames)) != frames * 2):
                raise ValueError("Voice Output cần WAV PCM16 mono 24 kHz đầy đủ.")
        return {"revision": 0, "durationFrames": frames, "layers": [{"id": uuid4().hex, "name": "Full", "enabled": True,
            "clips": [{"id": uuid4().hex, "outputId": output_id, "startFrame": 0, "sourceStartFrame": 0, "frameCount": frames, "enabled": True}]}]}

    def _initial_state(self, project_id, output_id):
        state = VoiceVersionState()
        if output_id:
            output = self.outputs.get(project_id, output_id)
            original_id = output_id
            # Preserve any existing non-destructive stretch when upgrading the
            # flat output to an editable layer base.
            edits_path = self.outputs.audio_path(project_id, output_id).parent / "edits.json"
            if edits_path.is_file():
                from app.adapters.file_voice_edits import FileVoiceEdits
                from app.adapters.voice_edit_preview import VoiceEditPreview
                edits = FileVoiceEdits(self.outputs, self.scripts)
                document = edits.get(project_id, output_id)
                if document.cursor:
                    preview = VoiceEditPreview(edits)
                    url, _ = preview.render(project_id, output_id, document)
                    key = url.split("/")[-2]
                    new_id, audio = self.outputs.reserve(project_id)
                    try:
                        shutil.copy2(preview.path(project_id, output_id, key), audio)
                        output = edits.mapped_output(project_id, output_id, document).model_copy(update={"id": new_id,
                            "audio_path": f"assets/voice-output/{new_id}/audio.wav",
                            "parameters": {**output.parameters, "voiceVersionMigration": {"sourceOutputId": output_id}}})
                        self.outputs.save(project_id, output)
                        output_id = new_id
                    except Exception:
                        self.outputs.discard(project_id, new_id)
                        raise
            script = self._script_from_output(output)
            config = {"generatorParameters": output.parameters.get("generators", {}), "speed": 1, "gain": 0, "generationEngine": None}
            try:
                composition = self.base_composition(project_id, output_id)
            except (OSError, ValueError, wave.Error, EOFError):
                composition = None
            state = VoiceVersionState(script=script, generated_script=script, full_generated_script=script, config=config,
                generated_config=config, composition=composition, generated_composition=composition,
                output_id=output_id, owned_output_ids=list(dict.fromkeys([original_id, output_id])))
        return state.model_dump(by_alias=True, mode="json")

    def _sync(self, project_id):
        path = self._path(project_id)
        exists = path.is_file()
        book = json.loads(path.read_text(encoding="utf-8")) if exists else {
            "schemaVersion": 2, "revision": 0, "activeSessionId": None, "activeVersionId": None, "sessions": [], "recycle": []}
        prior_recycle = encode(book.get("recycle", []))
        normalize_recycle(book)
        changed = prior_recycle != encode(book["recycle"])
        migrating = not exists or book.get("schemaVersion", 1) < 2
        # Migrate once. Later generated artifacts are explicitly committed to a
        # captured Version, never assigned by timestamp/list order.
        if not exists:
            for output in reversed(self.outputs.list(project_id)):
                version = self._version(output.id, 1)
                session = {"id": uuid4().hex, "name": f"Session {len(book['sessions']) + 1}", "versions": [version], "disabled": False}
                book["sessions"].append(session)
                book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]
                changed = True
            if not book["sessions"]:
                version = self._version(None, 1)
                session = {"id": uuid4().hex, "name": "Session 1", "versions": [version], "disabled": False}
                book["sessions"].append(session)
                book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]
                changed = True
        for session in book["sessions"]:
            for version in session["versions"]:
                if "state" not in version:
                    try:
                        version["state"] = self._initial_state(project_id, version.get("outputId"))
                        version["outputId"] = version["state"]["outputId"]
                    except KeyError:
                        version["state"] = self._initial_state(project_id, None)
                    changed = True
                elif "generatedComposition" not in version["state"]:
                    state = VoiceVersionState.model_validate(version["state"])
                    version["state"] = state.model_dump(by_alias=True, mode="json")
                    changed = True
        if migrating and book.get("activeVersionId"):
            _, active = self.find(book, book["activeVersionId"])
            current = self.scripts.get(project_id)
            if current.rows:
                active["state"]["script"] = current.model_dump(by_alias=True, mode="json")
            active["state"]["sidecars"] = self._capture_sidecars(project_id)
        if changed:
            self._write(project_id, book)
        return book

    @staticmethod
    def find(book, version_id):
        for session in book["sessions"]:
            for version in session["versions"]:
                if version["id"] == version_id:
                    return session, version
        raise KeyError(version_id)

    def get(self, project_id):
        with self._lock:
            return self._sync(project_id)

    def _current(self, project_id, revision):
        book = self._sync(project_id)
        if book["revision"] != revision:
            raise ScriptRevisionConflict("Danh sách Session/Version đã đổi; tải lại.")
        return book

    def _capture_sidecars(self, project_id):
        return {name: json.loads(path.read_text(encoding="utf-8")) for name in _SIDECARS
            if (path := self.root(project_id) / "scripts" / name).is_file()}

    def _checkout(self, project_id, version):
        state = VoiceVersionState.model_validate(version["state"])
        # Validate the sidecars before changing the shared workspace projection.
        priors = self._capture_sidecars(project_id)
        with self.scripts._lock:
            current = self.scripts.get(project_id)
            self._checking_out = True
            try:
                state.script = self.scripts.save(project_id, state.script.model_copy(update={"revision": current.revision}))
            finally:
                self._checking_out = False
            for name in _SIDECARS:
                path = self.root(project_id) / "scripts" / name
                prior = priors.get(name, {})
                sidecar = copy.deepcopy(state.sidecars.get(name, {"bindings": []} if name.startswith("reference") else {"plans": []}))
                sidecar["revision"] = prior.get("revision", 0) + 1
                for binding in sidecar.get("bindings", []):
                    scope = binding.get("scope", {})
                    if scope.get("kind") == "script" and scope.get("id") == project_id:
                        scope["revision"] = str(state.script.revision)
                    elif scope.get("kind") == "voice-output":
                        try:
                            scope["revision"] = self.outputs.get(project_id, scope["id"]).created_at.isoformat()
                        except KeyError:
                            pass
                FileProjectRepository._atomic_write(path, encode(sidecar))
                state.sidecars[name] = sidecar
        version["state"] = state.model_dump(by_alias=True, mode="json")

    def capture_active_script(self, project_id, script):
        with self._lock:
            if self._checking_out or not self._path(project_id).is_file():
                return
            if self.scripts.get(project_id) != script:
                return
            book = self._sync(project_id)
            if not book.get("activeVersionId"):
                return
            _, version = self.find(book, book["activeVersionId"])
            state = VoiceVersionState.model_validate(version["state"])
            if {**script.model_dump(), "revision": 0} != {**state.script.model_dump(), "revision": 0}:
                state.history = (state.history + [{"at": datetime.now(timezone.utc).isoformat(), "script": state.script.model_dump(by_alias=True, mode="json")}])[-32:]
            state.script = script
            version["state"] = state.model_dump(by_alias=True, mode="json")
            FileProjectRepository._atomic_write(self._path(project_id), encode(book))

    def save_state(self, project_id, version_id, revision, script, config):
        with self._lock:
            book = self._sync(project_id)
            _, version = self.find(book, version_id)
            state = VoiceVersionState.model_validate(version["state"])
            if state.revision != revision:
                raise ScriptRevisionConflict("Version đã đổi; tải lại trước khi lưu.")
            script = VoiceScriptDocument.model_validate(script)
            if book["activeVersionId"] != version_id or self.scripts.get(project_id) != script:
                raise ScriptRevisionConflict("Script chưa lưu hoặc Version không còn được chọn.")
            sidecars = self._capture_sidecars(project_id)
            if ({**script.model_dump(), "revision": 0} == {**state.script.model_dump(), "revision": 0}
                    and config == state.config and sidecars == state.sidecars):
                return book
            if {**script.model_dump(), "revision": 0} != {**state.script.model_dump(), "revision": 0}:
                state.history = (state.history + [{"at": datetime.now(timezone.utc).isoformat(), "script": state.script.model_dump(by_alias=True, mode="json")}])[-32:]
            state.script, state.config, state.sidecars = script, config, sidecars
            state.revision += 1
            version["state"] = state.model_dump(by_alias=True, mode="json")
            return self._write(project_id, book)

    def create_session(self, project_id, revision):
        with self._lock:
            book = self._current(project_id, revision)
            version = self._version(None, 1)
            version["state"] = self._initial_state(project_id, None)
            session = {"id": uuid4().hex, "name": f"Session {self._next_index(book['sessions'], 'Session')}", "versions": [version], "disabled": False}
            book["sessions"].append(session)
            book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]
            self._checkout(project_id, version)
            return self._write(project_id, book)

    def adopt_output(self, project_id, revision, output_id):
        """Select an already-managed output or adopt this exact external result."""
        with self._lock:
            # Validate the requested artifact before _sync can migrate or create
            # any Session state. Do not discover neighboring/raw outputs here.
            self.base_composition(project_id, output_id)
            book = self._current(project_id, revision)
            mapped = None
            for session in book["sessions"]:
                for version in session["versions"]:
                    state = version.get("state", {})
                    composition = state.get("composition") or {}
                    source_ids = {
                        clip.get("outputId")
                        for layer in composition.get("layers", [])
                        for clip in layer.get("clips", [])
                    }
                    owned_ids = set(state.get("ownedOutputIds", []))
                    if (version.get("outputId") == output_id or output_id in source_ids or output_id in owned_ids):
                        mapped = (session, version)
                        break
                if mapped:
                    break

            if mapped:
                session, version = mapped
                if session.get("disabled") or version.get("disabled"):
                    raise ValueError("Bật lại slot trước khi mở Voice Output này.")
                book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]
            else:
                version = self._version(output_id, 1)
                version["state"] = self._initial_state(project_id, output_id)
                session = {"id": uuid4().hex, "name": f"Session {self._next_index(book['sessions'], 'Session')}",
                    "versions": [version], "disabled": False}
                book["sessions"].append(session)
                book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]

            self._checkout(project_id, version)
            committed = self._write(project_id, book)
            selected_id = version.get("outputId") or output_id
            return committed, self.outputs.get(project_id, selected_id)

    def select(self, project_id, revision, version_id):
        with self._lock:
            book = self._current(project_id, revision)
            session, version = self.find(book, version_id)
            if session.get("disabled") or version.get("disabled"):
                raise ValueError("Slot đang bị Disable.")
            book["activeSessionId"], book["activeVersionId"] = session["id"], version_id
            self._checkout(project_id, version)
            return self._write(project_id, book)

    def _copy_output(self, project_id, output_id, suffix, version_id):
        source = self.outputs.get(project_id, output_id)
        try:
            self.base_composition(project_id, output_id)
        except (wave.Error, EOFError) as exc:
            raise ValueError("Voice Output nguồn không phải WAV hợp lệ.") from exc
        new_id, audio = self.outputs.reserve(project_id)
        try:
            original = self.outputs.audio_path(project_id, output_id)
            shutil.copytree(original.parent, audio.parent, dirs_exist_ok=True)
            edits_path = audio.parent / "edits.json"
            if edits_path.is_file():
                edits = VoiceEditDocument.model_validate_json(edits_path.read_text(encoding="utf-8"))
                if edits.source_sha256 != hashlib.sha256(original.read_bytes()).hexdigest():
                    raise ValueError("Lịch sử chỉnh sửa không khớp WAV nguồn.")
                FileProjectRepository._atomic_write(edits_path, edits.model_copy(update={"output_id": new_id, "revision": 0}).model_dump_json(by_alias=True))
            data = json.loads(encode(source.model_dump(by_alias=True, mode="json")).replace(f"assets/voice-output/{output_id}/", f"assets/voice-output/{new_id}/"))
            data.update(id=new_id, name=f"{source.name} · {suffix}", createdAt=datetime.now(timezone.utc).isoformat())
            data["parameters"]["voiceOutputVersion"] = {"sourceOutputId": output_id, "versionId": version_id}
            return self.outputs.save(project_id, VoiceOutput.model_validate(data))
        except Exception:
            self.outputs.discard(project_id, new_id)
            raise

    def create_version(self, project_id, revision, source_output_id=None, source_version_id=None):
        with self._lock:
            book = self._current(project_id, revision)
            if source_version_id:
                session, source = self.find(book, source_version_id)
            else:
                match = next(((s, v) for s in book["sessions"] for v in s["versions"] if v.get("outputId") == source_output_id), None)
                if match is None:
                    raise KeyError(source_output_id)
                session, source = match
            if session.get("disabled") or source.get("disabled"):
                raise ValueError("Bật lại slot trước khi tạo Version.")
            index = self._next_index(session["versions"], "Version")
            version = self._version(None, index, source["id"])
            state = copy.deepcopy(source["state"])
            ids = {c["outputId"] for layer in (state.get("composition") or {}).get("layers", []) for c in layer["clips"]}
            ids.update(c["outputId"] for layer in (state.get("generatedComposition") or {}).get("layers", [])
                       for c in layer["clips"])
            if state.get("outputId"):
                ids.add(state["outputId"])
            copied, mapping = [], {}
            try:
                for output_id in ids:
                    output = self._copy_output(project_id, output_id, f"v{index}", version["id"])
                    copied.append(output)
                    mapping[output_id] = output.id
                for old, new in mapping.items():
                    state = json.loads(encode(state).replace(f'"{old}"', f'"{new}"'))
                state.update(revision=0, history=[], ownedOutputIds=list(mapping.values()))
                version["state"], version["outputId"] = state, state.get("outputId")
                session["versions"].append(version)
                book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]
                self._checkout(project_id, version)
                self._write(project_id, book)
                return book, next((o for o in copied if o.id == version["outputId"]), None)
            except Exception:
                for output in copied:
                    self.outputs.discard(project_id, output.id)
                raise

    def state(self, project_id, version_id):
        with self._lock:
            return VoiceVersionState.model_validate(self.find(self._sync(project_id), version_id)[1]["state"])

    def publish(self, project_id, version_id, expected_revision, output, script, config, composition=None, full=False,
                expected_script=None, allow_script_edits=False, expected_composition=None, expected_output_id=None,
                successful_generation=False):
        with self._lock:
            book = self._sync(project_id)
            session, version = self.find(book, version_id)
            if session.get("disabled") or version.get("disabled"):
                raise ScriptRevisionConflict("Slot đã bị Disable; không thay audio hiện tại.")
            state = VoiceVersionState.model_validate(version["state"])
            if state.revision != expected_revision and not allow_script_edits:
                raise ScriptRevisionConflict("Version đã đổi trong lúc tạo audio; kết quả chưa được áp dụng.")
            if allow_script_edits:
                if expected_output_id is None or state.output_id != expected_output_id:
                    raise ScriptRevisionConflict("Audio nền đã đổi trong lúc Generate Fix; kết quả chưa được áp dụng.")
                if expected_composition is None or state.composition != expected_composition:
                    raise ScriptRevisionConflict("Layer đã đổi trong lúc Generate Fix; kết quả chưa được áp dụng.")
            if expected_script is not None and not allow_script_edits and ({**state.script.model_dump(by_alias=True, mode="json"), "revision": 0}
                    != {**VoiceScriptDocument.model_validate(expected_script).model_dump(by_alias=True, mode="json"), "revision": 0}):
                raise ScriptRevisionConflict("Script đã đổi trong lúc tạo audio; kết quả chưa được áp dụng.")
            state.composition = self.base_composition(project_id, output.id) if full else composition
            state.output_id, state.generated_script, state.generated_config = output.id, VoiceScriptDocument.model_validate(script), copy.deepcopy(config)
            if full:
                state.full_generated_script = VoiceScriptDocument.model_validate(script)
            if full or successful_generation:
                state.generated_composition = copy.deepcopy(state.composition)
            state.owned_output_ids = list(dict.fromkeys([*state.owned_output_ids, output.id,
                *[c["outputId"] for layer in (state.composition or {}).get("layers", []) for c in layer["clips"]]]))
            state.revision += 1
            version["state"], version["outputId"] = state.model_dump(by_alias=True, mode="json"), output.id
            return self._write(project_id, book)

    def edit_composition(self, project_id, version_id, expected_revision, command):
        from app.domain.voice_composition import VoiceComposition, VoiceCompositionCommand, apply_voice_composition_command
        from app.adapters.voice_layer_compositor import VoiceLayerCompositor
        with self._lock:
            state = self.state(project_id, version_id)
            if state.revision != expected_revision or not state.composition or not state.output_id:
                raise ScriptRevisionConflict("Layer đã đổi; tải lại Version.")
            current = VoiceComposition.model_validate(state.composition)
            action = VoiceCompositionCommand.model_validate(command)
            if action.action == "reset-composition":
                if state.generated_composition is None:
                    raise ValueError("Version chưa có composition từ lần Generate thành công nào để Reset.")
                baseline = VoiceComposition.model_validate(state.generated_composition)
                composition = baseline.model_copy(update={"revision": current.revision + 1})
            else:
                composition = apply_voice_composition_command(current, action)
            output = VoiceLayerCompositor(self.outputs).render(project_id, composition, state.output_id)
            output = output.model_copy(update={"name": f"{self.find(self._sync(project_id), version_id)[1]['name']} · audio"})
            self.outputs.save(project_id, output)
            try:
                book = self.publish(project_id, version_id, state.revision, output, state.generated_script or state.script,
                    state.generated_config, composition.model_dump(by_alias=True, mode="json"))
                return book, output
            except Exception:
                self.outputs.discard(project_id, output.id)
                raise

    def slot_action(self, project_id, revision, slot_id, kind, name=None):
        with self._lock:
            book = self._current(project_id, revision)
            if kind in {"remove", "restore", "purge", "empty-bin"}:
                if self.is_busy(project_id):
                    raise ScriptRevisionConflict("Đợi Generate kết thúc trước khi thay đổi Recycle Bin.")
                if kind == "restore":
                    restore_slot(book, slot_id)
                elif kind in {"purge", "empty-bin"}:
                    entries = list(book["recycle"]) if kind == "empty-bin" else [recycled_entry(book, slot_id)]
                    if any(entry is None for entry in entries):
                        raise KeyError(slot_id)
                    deleting = set().union(*(output_ids(e["snapshot"]) for e in entries)) if entries else set()
                    remaining = [e for e in book["recycle"] if e not in entries]
                    retained = set().union(*(output_ids(s) for s in book["sessions"]), *(output_ids(e["snapshot"]) for e in remaining))
                    if deleting & (retained | self._lipsync_output_references(project_id)):
                        raise ScriptRevisionConflict("Thành phẩm đang được Version khác sử dụng. Xóa Version liên quan trước khi xóa hẳn.")
                    paths = [checked_path(self.outputs.root(project_id), self.outputs.root(project_id) / oid) for oid in deleting]
                    book["recycle"] = remaining
                    result = purge_owned(self.root(project_id), paths, lambda: self._write(project_id, book))
                    self.outputs.prune_clips(project_id, keep_recent_seconds=0)
                    return result
                else:
                    previous = book.get("activeVersionId")
                    recycle_slot(book, slot_id)
                    if previous and not book.get("activeVersionId"):
                        self._checkout(project_id, {"state": VoiceVersionState().model_dump(by_alias=True, mode="json")})
                return self._write(project_id, book)
            _, target = find_slot(book, slot_id)
            if kind == "rename" and name and name.strip():
                target["name"] = name.strip()
            elif kind == "disable":
                target["disabled"] = not target.get("disabled", False)
                if target["disabled"] and (slot_id == book["activeVersionId"] or slot_id == book["activeSessionId"]):
                    book["activeVersionId"], book["activeSessionId"] = None, None
            else:
                raise ValueError("Thao tác slot không hợp lệ.")
            return self._write(project_id, book)

    def _lipsync_output_references(self, project_id):
        references = set()
        root = self.root(project_id)
        # Recycled LipSync Versions retain their state files until permanent
        # deletion, so they protect referenced Voice Outputs too.
        paths = [root / "scripts/lipsync-composition.json", *(root / "scripts/lipsync/versions").glob("*.json")]
        for path in paths:
            if not path.is_file():
                continue
            state = json.loads(path.read_text(encoding="utf-8"))
            for document in [state.get("document", state), *state.get("past", []), *state.get("future", [])]:
                if document.get("audio"):
                    references.add(document["audio"]["outputId"])
        return references

    def export_slot(self, project_id, kind, slot_id):
        with self._lock:
            book = self._sync(project_id)
            parent, slot = find_slot(book, slot_id)
            if kind != ("version" if parent else "session"):
                raise ValueError("Loại slot không khớp.")
            paths = []
            for oid in output_ids(slot):
                self.base_composition(project_id, oid)
                paths.append(checked_path(self.outputs.root(project_id), self.outputs.root(project_id) / oid))
                output = self.outputs.get(project_id, oid)
                for segment in output.segments:
                    if segment.clip:
                        clip = checked_path(self.outputs.clips_root(project_id), self.outputs.clips_root(project_id) / segment.clip)
                        if clip.is_dir():
                            paths.append(clip)
                if output.segments:
                    from app.adapters.subtitle_exporter import SubtitleExporter
                    paths.append(SubtitleExporter().export_voice_output_lines(self.outputs.projects.get(project_id), output))
            session = slot if parent is None else {**parent, "versions": [slot]}
            manifest = {"format": "pro4bro-output-slot", "version": 1, "module": "voice", "kind": kind,
                "sessions": [session]}
            return export_owned(self.root(project_id), kind, slot["name"], manifest, paths)
