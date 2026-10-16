from __future__ import annotations

import hashlib
import json
import os
import re
import wave
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.domain.models import VoiceOutput


_NAMESPACES = ("voice-patch", "context-patch", "hybrid-patch", "trained-media-patch")
_OUTPUT_ID = re.compile(r"^output-[A-Za-z0-9_-]{1,100}$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_GENERATOR_BY_NAMESPACE = {
    "voice-patch": None,
    "context-patch": "voice-patch-context",
    "hybrid-patch": "voice-patch-hybrid",
    "trained-media-patch": "voice-patch-trained-media",
}


class VoicePatchHistory:
    """Durable, read-only catalog of accepted Voice Patch output revisions."""

    def __init__(self, projects, outputs) -> None:
        self.projects = projects
        self.outputs = outputs

    def _root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path).resolve()

    @staticmethod
    def _hash_json(value: Any) -> str:
        payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @classmethod
    def _metadata_hash(cls, output: VoiceOutput) -> str:
        return cls._hash_json(output.model_dump(mode="json", by_alias=True, exclude={"audio_available"}))

    @staticmethod
    def _sha(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _contains_absolute_path(value: Any) -> bool:
        if isinstance(value, dict):
            for key, item in value.items():
                if isinstance(key, str) and "path" in key.casefold() and isinstance(item, str):
                    if (Path(item).is_absolute() or re.match(r"^[A-Za-z]:[\\/]", item)
                            or item.startswith("\\\\")):
                        return True
                if VoicePatchHistory._contains_absolute_path(item):
                    return True
            return False
        if isinstance(value, list):
            return any(VoicePatchHistory._contains_absolute_path(item) for item in value)
        return False

    def _output(self, project_id: str, output_id: Any) -> tuple[VoiceOutput, Path]:
        if not isinstance(output_id, str) or not _OUTPUT_ID.fullmatch(output_id):
            raise ValueError("Invalid Voice Patch output id.")
        root = self._root(project_id)
        folder = (root / "assets" / "voice-output" / output_id).resolve()
        if root not in folder.parents:
            raise ValueError("Voice Patch output path escapes its project.")
        output = self.outputs.get(project_id, output_id)
        if output.id != output_id:
            raise ValueError("Voice Patch output id differs from its project folder.")
        audio_path = self.outputs.audio_path(project_id, output_id).resolve()
        if root not in audio_path.parents:
            raise ValueError("Voice Patch audio path escapes its project.")
        return output, audio_path

    def _validate(self, project_id: str, namespace: str, receipt: dict[str, Any]) -> dict[str, Any]:
        if namespace not in _NAMESPACES or not isinstance(receipt, dict):
            raise ValueError("Unknown Voice Patch receipt namespace or shape.")
        if self._contains_absolute_path(receipt):
            raise ValueError("Voice Patch receipts must not persist absolute paths.")
        output_id = receipt.get("outputId")
        output, audio_path = self._output(project_id, output_id)
        report = receipt.get("report")
        if not isinstance(report, dict):
            raise ValueError("Accepted Voice Patch receipt report is invalid.")
        lineage = output.parameters.get("voicePatch")
        if not isinstance(lineage, dict):
            raise ValueError("Output has no Voice Patch lineage.")
        if (receipt.get("version") != 1 or lineage.get("sourceOutputId") != receipt.get("sourceOutputId")
                or lineage.get("sourceAudioSha256") != receipt.get("sourceAudioSha256")
                or lineage.get("sourceMetadataSha256") != receipt.get("sourceMetadataSha256")
                or lineage.get("jobId") != receipt.get("jobId")
                or lineage.get("jobKey") != receipt.get("key")
                or lineage.get("rowId") is None):
            raise ValueError("Receipt does not match the immutable Voice Patch output lineage.")
        if not isinstance(receipt.get("sourceOutputId"), str) or not receipt["sourceOutputId"]:
            raise ValueError("Receipt has no source output association.")
        if not _SHA256.fullmatch(str(receipt.get("sourceAudioSha256", ""))) or not _SHA256.fullmatch(
                str(receipt.get("sourceMetadataSha256", ""))):
            raise ValueError("Receipt source hashes are invalid.")
        if not isinstance(receipt.get("jobId"), str) or not receipt["jobId"] or not _SHA256.fullmatch(
                str(receipt.get("key", ""))):
            raise ValueError("Receipt job identity is invalid.")
        expected_generator = _GENERATOR_BY_NAMESPACE[namespace]
        if expected_generator is not None and output.generator_id != expected_generator:
            raise ValueError("Output generator does not match its Voice Patch strategy.")
        if namespace == "voice-patch" and output.generator_id in {
                "voice-patch-context", "voice-patch-hybrid", "voice-patch-trained-media"}:
            raise ValueError("Output generator does not match its Voice Patch strategy.")
        if not audio_path.is_file() or self._sha(audio_path) != receipt.get("outputAudioSha256"):
            raise ValueError("Accepted Voice Patch audio is missing or has changed.")
        if self._metadata_hash(output) != receipt.get("outputMetadataSha256"):
            raise ValueError("Accepted Voice Patch metadata has changed.")
        with wave.open(str(audio_path), "rb") as audio:
            frames = audio.getnframes()
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 24000, "NONE"):
                raise ValueError("Accepted Voice Patch audio is not PCM16 mono 24 kHz.")
        if frames <= 0 or frames != receipt.get("frames"):
            raise ValueError("Accepted Voice Patch frame count differs from its receipt.")
        if lineage.get("sampleRate") != 24000:
            raise ValueError("Accepted Voice Patch lineage has an unsupported sample rate.")
        start = report.get("startFrame")
        end = report.get("endFrame")
        if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start:
            raise ValueError("Accepted Voice Patch target frame range is invalid.")
        row_id = lineage.get("rowId")
        patched_segment = next((item for item in output.segments if item.row_id == row_id), None)
        delta = lineage.get("durationDeltaFrames")
        if patched_segment is None or not isinstance(delta, int):
            raise ValueError("Accepted Voice Patch target is missing from output lineage.")
        output_start = round(patched_segment.start * 24000)
        replacement_frames = round((patched_segment.end - patched_segment.start) * 24000)
        source_end = output_start + replacement_frames - delta
        if (report.get("rowId") != row_id or report.get("replacementFrames") != replacement_frames
                or report.get("deltaFrames") != delta or start != output_start or end != source_end):
            raise ValueError("Accepted Voice Patch report target differs from immutable output lineage.")
        duration_policy = lineage.get("durationPolicy") or lineage.get("duration_policy") or "ripple"
        if report.get("durationPolicy", duration_policy) != duration_policy:
            raise ValueError("Accepted Voice Patch duration policy differs from immutable output lineage.")
        comparison_material = {
            "sourceAudioSha256": receipt["sourceAudioSha256"],
            "sourceMetadataSha256": receipt["sourceMetadataSha256"],
            "startFrame": start,
            "endFrame": end,
            "replacementText": lineage.get("replacementText"),
            "durationPolicy": duration_policy,
        }
        comparison_key = self._hash_json(comparison_material)
        created_at = receipt.get("createdAt")
        if not isinstance(created_at, str):
            raise ValueError("Accepted Voice Patch receipt has no creation time.")
        return {
            "output": output,
            "audioUrl": f"/api/projects/{project_id}/voice-outputs/{output.id}/audio",
            "sourceOutputId": lineage["sourceOutputId"],
            "strategy": namespace,
            "key": receipt["key"],
            "jobId": receipt["jobId"],
            "report": receipt.get("report", {}),
            "comparisonKey": comparison_key,
            "createdAt": created_at,
        }

    def record(self, project_id: str, namespace: str, receipt: dict[str, Any]) -> Path:
        """Persist one validated accepted receipt without replacing an existing revision."""
        accepted = self._validate(project_id, namespace, receipt)
        output_id = accepted["output"].id
        root = self._root(project_id)
        path = (root / "jobs" / namespace / "history" / f"{output_id}.json").resolve()
        if root not in path.parents:
            raise ValueError("Voice Patch history path escapes its project.")
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(receipt, ensure_ascii=False, indent=2)
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as exc:
                raise ValueError("Existing Voice Patch history entry is unreadable; refusing to replace it.") from exc
            if existing != receipt:
                raise ValueError("Voice Patch output already has a different immutable history receipt.")
            return path
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            with temporary.open("x", encoding="utf-8") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, path)
            except FileExistsError:
                existing = json.loads(path.read_text(encoding="utf-8"))
                if existing != receipt:
                    raise ValueError("Voice Patch output already has a different immutable history receipt.")
            return path
        finally:
            temporary.unlink(missing_ok=True)

    def list(self, project_id: str, source_id: str | None = None) -> dict[str, Any]:
        """Return integrity-checked accepted revisions; current drafts and jobs are ignored."""
        root = self._root(project_id) / "jobs"
        project_root = self._root(project_id)
        if root.resolve() != project_root and project_root not in root.resolve().parents:
            return {"revisions": [], "invalidCount": 1}
        candidates: dict[str, tuple[int, str, Path]] = {}
        invalid_count = 0
        for namespace in _NAMESPACES:
            for rank, folder_name in ((0, "history"), (1, "applied")):
                folder = root / namespace / folder_name
                if not folder.is_dir():
                    continue
                if project_root not in folder.resolve().parents:
                    invalid_count += 1
                    continue
                for path in folder.glob("*.json"):
                    try:
                        if project_root not in path.resolve().parents:
                            raise ValueError("Voice Patch receipt path escapes its project.")
                        receipt = json.loads(path.read_text(encoding="utf-8"))
                        output_id = receipt.get("outputId") if isinstance(receipt, dict) else None
                        if not isinstance(output_id, str) or not _OUTPUT_ID.fullmatch(output_id):
                            raise ValueError("Receipt output id is invalid.")
                        prior = candidates.get(output_id)
                        if prior is None or rank < prior[0]:
                            candidates[output_id] = (rank, namespace, path)
                    except (OSError, ValueError, TypeError):
                        invalid_count += 1
        revisions = []
        for output_id, (_rank, namespace, path) in candidates.items():
            try:
                receipt = json.loads(path.read_text(encoding="utf-8"))
                revision = self._validate(project_id, namespace, receipt)
                if source_id is None or revision["sourceOutputId"] == source_id:
                    revisions.append(revision)
            except (OSError, ValueError, KeyError, TypeError, wave.Error):
                invalid_count += 1
        revisions.sort(key=lambda item: (item["createdAt"], item["output"].id))
        return {"revisions": revisions, "invalidCount": invalid_count}
