"""Portable, source-bound subtitle proposals and reversible explicit application."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
from threading import BoundedSemaphore
from uuid import uuid4

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.subtitle_alignment_audio import LocalSubtitleAligner, pcm_envelope, sha256
from app.domain.subtitle_alignment import propose_alignment
from app.adapters.word_timing_quality import reconcile_word_timing_quality
from app.adapters.audio_waveform_envelope import AudioWaveformEnvelope
from app.adapters.subtitle_waveform_anchors import pcm_vector_landmarks


class AlignmentConflict(RuntimeError):
    pass


def fingerprint(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode("utf-8")).hexdigest()


def source_binding(snapshot):
    return fingerprint({"audioSha256": snapshot["audioSha256"], "asset": {
        k: v for k, v in snapshot["asset"].items() if k not in {"words", "text"}}})


def interval(word, duration):
    start, end = word.get("start"), word.get("end")
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (start, end)):
        return False
    return 0 <= start < end <= duration


def conflicts(words, duration):
    valid = sorted((w["start"], w["end"], i) for i, w in enumerate(words) if interval(w, duration))
    pairs = set()
    active = []
    for start, end, i in valid:
        active = [(e, j) for e, j in active if e > start + .0001]
        pairs.update(tuple(sorted((i, j))) for _, j in active)
        active.append((end, i))
    return pairs


class SubtitleAlignment:
    _cpu = BoundedSemaphore(1)

    def __init__(self, projects, media, runtime_root):
        self.projects, self.media = projects, media
        self.aligner = LocalSubtitleAligner(Path(runtime_root))
        self.waveforms = AudioWaveformEnvelope()

    def _root(self, project_id):
        return Path(self.projects.get(project_id).project_path).resolve()

    def _directory(self, project_id, asset_id):
        self.media.get(project_id, asset_id)
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", asset_id):
            raise KeyError(asset_id)
        return self._root(project_id) / "jobs/subtitle-alignment" / asset_id

    def _path(self, project_id, asset_id, identity):
        if not re.fullmatch(r"proposal-[0-9a-f]{24}", identity):
            raise KeyError(identity)
        return self._directory(project_id, asset_id) / f"{identity}.json"

    @staticmethod
    def _write(path, document):
        FileProjectRepository._atomic_write(path, json.dumps(document, ensure_ascii=False, allow_nan=False, indent=2))

    def _snapshot(self, project_id, asset_id):
        asset = self.media.get(project_id, asset_id)
        if asset.deleted_at or asset.disabled:
            raise AlignmentConflict("Footage đã tắt hoặc ở Recycle Bin.")
        if asset.growing_mkv_follow or asset.transcription_status != "complete":
            raise ValueError("Hoàn tất thu âm/STT trước khi căn subtitle.")
        if not asset.words:
            raise ValueError("Footage chưa có từ để căn chỉnh.")
        audio = self.media.resolve_audio_path(project_id, asset_id).resolve()
        audio.relative_to(self._root(project_id))
        value = asset.model_dump(mode="json", by_alias=True)
        # Bookkeeping changes alone do not invalidate a semantic input snapshot.
        state = {k: v for k, v in value.items() if k not in {
            "createdAt", "updatedAt", "revisions", "wordTimingNote", "wordTimingQuality", "wordTimingTrustVersion"}}
        return asset, audio, {"asset": state, "audioSha256": sha256(audio)}, value

    @staticmethod
    def _public(document, current_signature):
        expected = document.get("appliedSignature") if document["state"] == "applied" else document.get("restoredSignature") if document["state"] == "restored" else document["inputSignature"]
        result = {k: v for k, v in document.items() if k not in {"input", "application", "appliedSignature", "restoredSignature"}}
        result["stale"] = current_signature != expected
        return result

    def _read(self, project_id, asset_id, identity):
        path = self._path(project_id, asset_id, identity)
        document = json.loads(path.read_text(encoding="utf-8"))
        asset, audio, snapshot, _ = self._snapshot(project_id, asset_id)
        if document["state"] in {"applying", "restoring"}:
            operation = document["application"]
            # Recover a process interruption between the media write and receipt.
            if (asset.words == operation["targetWords"] and asset.text == operation["targetText"]
                    and source_binding(snapshot) == operation.get("sourceBinding")):
                document["state"] = "applied" if document["state"] == "applying" else "restored"
                document["appliedSignature" if document["state"] == "applied" else "restoredSignature"] = fingerprint(snapshot)
                self._write(path, document)
            elif fingerprint(snapshot) == operation["beforeSignature"]:
                document["state"] = operation["beforeState"]
                self._write(path, document)
        return path, document, asset, audio, snapshot

    def get(self, project_id, asset_id, identity):
        with self.media._lock(project_id):
            _, document, _, _, snapshot = self._read(project_id, asset_id, identity)
            return self._public(document, fingerprint(snapshot))

    def latest(self, project_id, asset_id):
        path = self._directory(project_id, asset_id) / "latest.json"
        if not path.is_file():
            return None
        return self.get(project_id, asset_id, json.loads(path.read_text(encoding="utf-8"))["id"])

    def _alignment_identity(self):
        weights = self.aligner.model / "pytorch_model.bin"
        if not weights.is_file() or not self.aligner.worker.is_file():
            return None
        runtime = self.aligner.python.parent.parent if self.aligner.python.parent.name.lower() == "scripts" else self.aligner.python.parent
        packages = runtime / "Lib/site-packages"
        dependencies = [path for name in ("whisperx", "torch", "transformers", "faster_whisper", "av") for path in packages.glob(f"{name}-*.dist-info/METADATA")]
        alignment_code = packages / "whisperx/alignment.py"
        if alignment_code.is_file():
            dependencies.append(alignment_code)
        return {"workerSha256": sha256(self.aligner.worker), "weightsSha256": sha256(weights),
                "modelConfigSha256": fingerprint({p.name: sha256(p) for p in self.aligner.model.glob("*.json")}),
                "runtimeSha256": fingerprint({p.relative_to(packages).as_posix(): sha256(p) for p in dependencies})}

    def _reuse_alignment(self, project_id, asset_id, directory, folder, snapshot, indexes, identity):
        if identity is None:
            return None
        try:
            latest_id = json.loads((directory / "acoustic-latest.json").read_text(encoding="utf-8"))["id"]
            previous = json.loads(self._path(project_id, asset_id, latest_id).read_text(encoding="utf-8"))
            if (previous["inputSignature"] != fingerprint(snapshot) or previous.get("alignmentIdentity") != identity
                    or previous.get("alignmentIndexes") != indexes or previous["aligner"]["status"] != "complete"):
                return None
            source = directory / latest_id
            request = json.loads((source / "alignment-input.json").read_text(encoding="utf-8"))
            result = json.loads((source / "alignment-output.json").read_text(encoding="utf-8"))
            if (request["words"] != snapshot["asset"]["words"] or request["audioSha256"] != snapshot["audioSha256"]
                    or result["audioSha256"] != snapshot["audioSha256"] or request["indexes"] != indexes
                    or len(result["words"]) != len(request["words"])
                    or any(a["text"] != b["text"] for a, b in zip(result["words"], request["words"]))):
                return None
            for name in ("alignment-input.json", "alignment-output.json", "alignment.log"):
                shutil.copy2(source / name, folder / name)
            return {**previous["aligner"], **result, "reused": True, "sourceProposalId": latest_id}
        except (OSError, KeyError, TypeError, ValueError):
            return None

    def analyze(self, project_id, asset_id, *, mode="auto", start_offset_ms=0, end_offset_ms=0, indexes=None, methods=None):
        with self.media._lock(project_id):
            asset, audio, snapshot, _ = self._snapshot(project_id, asset_id)
            directory = self._directory(project_id, asset_id)
            identity = "proposal-" + uuid4().hex[:24]
            folder = directory / identity
            folder.mkdir(parents=True, exist_ok=False)
        envelope = pcm_envelope(audio)
        if abs(envelope["duration"] - asset.duration) > .05:
            raise ValueError("Thời lượng analysis WAV không khớp footage; hãy kiểm tra nguồn.")
        landmarks = pcm_vector_landmarks(self.waveforms, audio, directory / "waveform.json", envelope["duration"])
        if indexes is not None and (len(indexes) != len(set(indexes)) or any(type(i) is not int or not 0 <= i < len(asset.words) for i in indexes)):
            raise ValueError("Phạm vi từ không hợp lệ.")
        scoped = list(range(len(asset.words))) if indexes is None else indexes
        scoped = [i for i in scoped if not interval(asset.words[i], asset.duration) or not any(asset.words[i]["start"] < r.end and asset.words[i]["end"] > r.start for r in asset.removed_ranges)]
        # Read-only diagnosis includes manual words; application still locks them.
        eligible = scoped
        alignment_identity = None
        aligned = {"status": "not-used", "words": None, "reason": "Bù offset theo giá trị đã chọn."}
        needs_acoustic = mode != "offset" and (methods is None or any(method["mode"] != "offset" for method in methods))
        if needs_acoustic:
            aligned = {**self.aligner.report(), "words": None}
            if eligible and aligned["status"] == "available" and max(envelope["rms"], default=0) > .0001:
                alignment_identity = self._alignment_identity()
                reused = self._reuse_alignment(project_id, asset_id, directory, folder, snapshot, eligible, alignment_identity)
                if reused is not None:
                    aligned = reused
                else:
                    if not self._cpu.acquire(blocking=False):
                        raise AlignmentConflict("Đang có tác vụ căn âm học khác. Thử lại sau khi tác vụ đó xong.")
                    try:
                        aligned = self.aligner.run(self._root(project_id), audio, asset.words, folder, eligible)
                    finally:
                        self._cpu.release()
        elif (directory / "acoustic-latest.json").is_file():
            # Manual offset never starts a model. Existing bound evidence can
            # still explain the source's drift without another inference run.
            alignment_identity = self._alignment_identity()
            reused = self._reuse_alignment(project_id, asset_id, directory, folder, snapshot, eligible, alignment_identity)
            if reused is not None:
                aligned = reused
        evidence = dict(rms=envelope["rms"], frame_seconds=envelope["frameSeconds"], indexes=scoped, waveform_landmarks=landmarks)
        if methods is not None:
            from app.domain.subtitle_refinement import compose_refinement
            result = compose_refinement(asset.words, aligned.get("words"), asset.duration, methods=methods, **evidence)
        else:
            result = propose_alignment(asset.words, aligned.get("words"), asset.duration,
                mode=mode, start_offset=start_offset_ms / 1000, end_offset=end_offset_ms / 1000, **evidence)
        result["diagnostics"]["waveform_source"] = "timeline-pcm-peak-vectors"
        document = {"id": identity, "assetId": asset_id, "createdAt": datetime.now(timezone.utc).isoformat(),
            "state": "proposed", "inputSignature": fingerprint(snapshot), "input": snapshot,
            "audioPath": audio.relative_to(self._root(project_id)).as_posix(),
            "mode": mode, "startOffsetMs": start_offset_ms, "endOffsetMs": end_offset_ms,
            "methods": methods,
            "alignmentIdentity": alignment_identity, "alignmentIndexes": eligible,
            "scope": indexes, "aligner": {k: v for k, v in aligned.items() if k not in {"words", "groups"}},
            "audio": {k: v for k, v in envelope.items() if k != "rms"}, **result}
        with self.media._lock(project_id):
            self._write(directory / f"{identity}.json", document)
            self._write(directory / "latest.json", {"id": identity})
            if aligned["status"] == "complete":
                self._write(directory / "acoustic-latest.json", {"id": identity})
            return self.get(project_id, asset_id, identity)

    def apply_preview(self, project_id, asset_id, identity):
        proposal = self.get(project_id, asset_id, identity)
        if proposal["mode"] != "pipeline":
            raise ValueError("Đây không phải Ghost Preview.")
        indexes = [row["index"] for row in proposal["rows"] if row["status"] != "locked" and row["before"] != row["after"]]
        return self.apply(project_id, asset_id, identity, indexes, [], reviewed_preview=True)

    def apply(self, project_id, asset_id, identity, indexes, edits, *, reviewed_preview=False):
        with self.media._lock(project_id):
            path, document, asset, _, snapshot = self._read(project_id, asset_id, identity)
            if document["state"] != "proposed" or fingerprint(snapshot) != document["inputSignature"]:
                raise AlignmentConflict("Text, timing hoặc audio đã đổi. Phân tích lại trước khi áp dụng.")
            if document["mode"] == "diagnose":
                raise ValueError("Kiểm tra độ lệch chỉ đọc dữ liệu. Chọn một phương pháp tinh chỉnh để áp dụng.")
            reviewed_preview = reviewed_preview and document["mode"] == "pipeline"
            if not indexes or len(set(indexes)) != len(indexes):
                raise ValueError("Chọn ít nhất một từ; không chọn trùng.")
            overrides = {e["index"]: e for e in edits}
            if len(overrides) != len(edits) or not set(overrides).issubset(indexes):
                raise ValueError("Các mốc review không thuộc từ được chọn.")
            rows = {r["index"]: r for r in document["rows"]}
            words = deepcopy(asset.words)
            for index in indexes:
                row = rows.get(index)
                if not row or row["status"] == "locked":
                    raise ValueError("Từ được khóa hoặc không thuộc đề xuất.")
                edit = overrides.get(index)
                if edit and edit.get("reviewed") is not True:
                    raise ValueError("Nghe và xác nhận mốc sửa trước khi áp dụng.")
                if row["status"] != "ready" and not edit and not reviewed_preview:
                    raise ValueError("Từ chưa chắc cần được nghe và xác nhận.")
                bounds = edit or row["after"]
                if not interval(bounds, asset.duration):
                    raise ValueError("Mốc từ phải có 0 ≤ IN < OUT ≤ thời lượng nguồn.")
                original = words[index]
                words[index] = {**original, "start": bounds["start"], "end": bounds["end"],
                    "sourceTiming": original.get("sourceTiming") or {"start": original["start"], "end": original["end"], "source": original.get("timingSource")},
                    "timingSource": "manual" if edit else "subtitle-alignment-" + row["method"],
                    "timingTrusted": True, "subtitleAlignmentId": identity}
                if edit:
                    words[index].update(reviewState="manual", selectedVariant="manual")
                if reviewed_preview:
                    words[index]["subtitleTimingConflict"] = index in document["diagnostics"]["conflictIndexes"]
            for i, j in conflicts(words, asset.duration):
                if (i in indexes or j in indexes) and not reviewed_preview:
                    raise ValueError("Các mốc được chọn chồng lên từ bên cạnh. Review các từ cùng đoạn trước.")
            return self._publish(project_id, asset_id, path, document, snapshot, words, asset.text, "apply")

    def restore(self, project_id, asset_id, identity):
        with self.media._lock(project_id):
            path, document, asset, _, snapshot = self._read(project_id, asset_id, identity)
            if document["state"] != "applied" or fingerprint(snapshot) != document.get("appliedSignature"):
                raise AlignmentConflict("Script đã đổi sau lần áp dụng. Khôi phục này không thể ghi đè thay đổi mới.")
            original = document["input"]["asset"]
            return self._publish(project_id, asset_id, path, document, snapshot, original["words"], original["text"], "restore")

    def _publish(self, project_id, asset_id, path, document, snapshot, words, text, operation):
        asset = self.media.get(project_id, asset_id)
        words = reconcile_word_timing_quality(asset.word_timing_quality, asset.word_timing_note, words,
            asset.duration, trust_version=asset.word_timing_trust_version).words
        document["application"] = {"beforeState": document["state"], "beforeSignature": fingerprint(snapshot),
                                   "sourceBinding": source_binding(snapshot),
                                   "targetWords": words, "targetText": text}
        document["state"] = "applying" if operation == "apply" else "restoring"
        self._write(path, document)
        saved = self.media.update_script(project_id, asset_id, text, "user", words)
        _, _, after, _ = self._snapshot(project_id, asset_id)
        document["state"] = "applied" if operation == "apply" else "restored"
        document["appliedSignature" if operation == "apply" else "restoredSignature"] = fingerprint(after)
        self._write(path, document)
        return {"asset": saved.model_dump(mode="json", by_alias=True), "proposal": self._public(document, fingerprint(after))}
