from __future__ import annotations

import json
import re
import threading
from pathlib import Path

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.omnivoice_generator import file_digest
from app.adapters.reference_resolver import digest
from app.domain.models import DatasetManifest, TrainingRun
from app.domain.reference_bindings import ReferenceSource
from app.domain.timing_plan import TimingPlanRequest, timing_template
from app.domain.voice_script_document import effective_settings


class FileTimingPlans:
    _lock = threading.RLock()

    def __init__(self, resolver):
        self.resolver, self.store = resolver, resolver.bindings

    def _path(self, project_id: str) -> Path:
        return Path(self.store.projects.get(project_id).project_path) / "scripts" / "timing-plans.json"

    def _read(self, project_id: str) -> dict:
        path = self._path(project_id)
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"version": 1, "revision": 0, "plans": []}

    def get(self, project_id: str) -> dict:
        with self._lock:
            document = self._read(project_id)
            script = self.store.scripts.get(project_id)
            result = []
            for plan in document["plans"]:
                row = next((row for row in script.rows if row.id == plan["rowId"]), None)
                state, reason = "ready", "Chưa áp dụng vào audio."
                try:
                    asset = self.store.media.get(project_id, plan["source"]["assetId"])
                    if asset.deleted_at or asset.disabled or file_digest(self.store.media.resolve_audio_path(project_id, asset.id)) != plan["audioSha256"]:
                        raise ValueError("Timing source đã thay đổi hoặc không còn khả dụng.")
                    if plan["source"]["kind"] == "reference" and not asset.reference_selected:
                        raise ValueError("Footage không còn đánh dấu Reference.")
                    if self._alignment_key(asset) != plan["alignmentRevision"]:
                        raise ValueError("Transcript/alignment source đã đổi. Lập lại timing plan.")
                    if plan.get("training"):
                        training = plan["training"]
                        root = self._path(project_id).parent.parent
                        archived = root / "jobs/training" / training["runId"] / "data/segments" / f"{training['segmentId']}.wav"
                        manifest = root / "assets/training/datasets" / f"{training['manifestId']}.json"
                        if file_digest(archived) != training["snapshotSha256"] or file_digest(manifest) != training["manifestHash"]:
                            raise ValueError("Training snapshot/manifest đã đổi.")
                    if row is None or digest([row.model_dump(by_alias=True), effective_settings(script, row)]) != plan["targetRevision"]:
                        raise ValueError("Câu/voice/cấu hình đã đổi. Lập lại timing plan.")
                except (KeyError, OSError, ValueError) as exc:
                    state, reason = "stale", str(exc)
                result.append({**plan, "state": state, "reason": reason})
            return {**document, "plans": result}

    @staticmethod
    def _alignment_key(asset) -> str:
        return digest([asset.text, asset.words, asset.word_timing_quality, asset.word_timing_trust_version])

    def save(self, project_id: str, request: TimingPlanRequest) -> dict:
        with self._lock:
            current = self._read(project_id)
            script = self.store.scripts.get(project_id)
            if current["revision"] != request.expected_revision or script.revision != request.expected_script_revision:
                raise ScriptRevisionConflict("Script/timing plan đã thay đổi. Làm mới và thử lại.")
            row = next((row for row in script.rows if row.id == request.row_id), None)
            if row is None: raise KeyError(request.row_id)
            source = request.source
            asset = self.store.media.get(project_id, source.asset_id)
            if asset.updated_at.isoformat().replace("+00:00", "Z") != source.revision.replace("+00:00", "Z"):
                # Compare timestamps rather than ISO formatting precision from JS/Python.
                from datetime import datetime
                if datetime.fromisoformat(source.revision.replace("Z", "+00:00")) != asset.updated_at:
                    raise ScriptRevisionConflict("Footage revision đã đổi.")
            if asset.deleted_at or asset.disabled: raise ValueError("Footage không khả dụng.")
            if source.kind == "reference" and not asset.reference_selected: raise ValueError("Footage chưa đánh dấu Reference.")
            audio = self.store.media.resolve_audio_path(project_id, asset.id)
            audio_hash = file_digest(audio)
            features = self.resolver.features(self._path(project_id).parent.parent, audio,
                ReferenceSource(asset_id=asset.id, start=source.start, end=source.end, audio_sha256=audio_hash, properties=["timing"]))
            training = None
            if source.kind == "training":
                root = self._path(project_id).parent.parent
                run_path = root / "jobs" / "training" / source.training_run_id / "run.json"
                run = TrainingRun.model_validate_json(run_path.read_text(encoding="utf-8"))
                if run.id != source.training_run_id or run.project_id != project_id or run.status != "complete" or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,119}", run.manifest_id):
                    raise ValueError("Training Run chưa hoàn tất hoặc lineage không hợp lệ.")
                manifest_path = root / "assets" / "training" / "datasets" / f"{run.manifest_id}.json"
                if not run.manifest_hash or file_digest(manifest_path) != run.manifest_hash:
                    raise ValueError("Training manifest không khớp hash của run.")
                manifest = DatasetManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
                segment = next((item for item in manifest.segments if item.asset_id == asset.id and item.start <= source.start and item.end >= source.end and item.speaker_profile_id == row.speaker_profile_id), None)
                if segment is None: raise ValueError("Span/identity không thuộc manifest của Training Run này.")
                if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,119}", segment.id): raise ValueError("Training segment ID không hợp lệ.")
                # Never call the import/training checkbox evidence of a historic audio snapshot.
                archived = root / "jobs" / "training" / source.training_run_id / "data" / "segments" / f"{segment.id}.wav"
                if not archived.is_file(): raise ValueError("Run không lưu audio segment để đối chiếu; chưa thể xác minh timing footage train.")
                from app.adapters.voice_script_speaker import read_pcm
                raw = read_pcm(audio, self.resolver.ffmpeg_path)
                expected = raw[round(segment.start * 24000) * 2:round(segment.end * 24000) * 2]
                if read_pcm(archived, self.resolver.ffmpeg_path) != expected:
                    raise ValueError("Audio hiện tại khác snapshot dùng train.")
                training = {"runId": run.id, "manifestId": run.manifest_id, "manifestHash": run.manifest_hash, "segmentId": segment.id, "snapshotSha256": file_digest(archived)}
            settings = effective_settings(script, row)
            template = timing_template(asset.words, source.start, source.end, row.text, request.reviewed_mapping)
            requested = row.settings.duration if row.settings.duration is not None else template["duration"]
            if "duration" in settings.get("locked", []) and row.settings.duration is None:
                # Parent duration budgets are resolved across siblings by the duration planner.
                requested = template["duration"]
            plan = {"rowId": row.id, "source": source.model_dump(by_alias=True), "audioSha256": audio_hash,
                    "alignmentRevision": self._alignment_key(asset), "template": template, "features": features,
                    "targetRevision": digest([row.model_dump(by_alias=True), settings]), "training": training,
                    "requestedDuration": requested, "durationOrigin": "sentence" if row.settings.duration is not None else "reference",
                    "anchorApplication": "pending", "identityVoiceId": row.voice_id, "identitySpeakerId": row.speaker_profile_id}
            plan["key"] = digest(plan)
            if self.store.scripts.get(project_id).revision != script.revision or file_digest(audio) != audio_hash:
                raise ScriptRevisionConflict("Source/Script đã đổi trong lúc lập timing plan.")
            saved = {"version": 1, "revision": current["revision"] + 1, "plans": [item for item in current["plans"] if item["rowId"] != row.id] + [plan]}
            FileProjectRepository._atomic_write(self._path(project_id), json.dumps(saved, ensure_ascii=False, indent=2))
            return self.get(project_id)

    def delete(self, project_id: str, row_id: str, expected_revision: int) -> dict:
        with self._lock:
            document = self._read(project_id)
            if document["revision"] != expected_revision: raise ScriptRevisionConflict("Timing plan đã đổi. Làm mới trước khi bỏ.")
            saved = {**document, "revision": document["revision"] + 1, "plans": [plan for plan in document["plans"] if plan["rowId"] != row_id]}
            FileProjectRepository._atomic_write(self._path(project_id), json.dumps(saved, ensure_ascii=False, indent=2))
            return self.get(project_id)
