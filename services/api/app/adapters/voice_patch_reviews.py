from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import Field

from app.adapters.file_project_repository import FileProjectRepository
from app.domain.models import DomainModel


Rating = Literal["unassessed", "acceptable", "needs-work"]


class VoicePatchReviewRatings(DomainModel):
    clarity: Rating = "unassessed"
    identity: Rating = "unassessed"
    delivery: Rating = "unassessed"
    transitions: Rating = "unassessed"


class VoicePatchReviewRequest(DomainModel):
    expected_revision: int = Field(ge=0)
    expected_key: str = Field(pattern=r"^[a-f0-9]{64}$")
    listened: Literal[True]
    ratings: VoicePatchReviewRatings = Field(default_factory=VoicePatchReviewRatings)
    notes: str = Field(default="", max_length=2000)


class VoicePatchReviewEntry(DomainModel):
    output_id: str
    key: str = Field(pattern=r"^[a-f0-9]{64}$")
    output_audio_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    output_metadata_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    comparison_key: str = Field(pattern=r"^[a-f0-9]{64}$")
    listened: Literal[True]
    ratings: VoicePatchReviewRatings
    notes: str = Field(max_length=2000)
    reviewed_at: datetime


class VoicePatchReviews:
    """Portable listening assessments pinned to validated accepted Patch audio."""

    _lock = threading.RLock()
    _DEFAULT = {"version": 1, "revision": 0, "reviews": []}

    def __init__(self, history) -> None:
        self.history = history

    def _root(self, project_id: str) -> Path:
        return Path(self.history.projects.get(project_id).project_path).resolve()

    def _path(self, project_id: str) -> Path:
        root = self._root(project_id)
        path = (root / "notes" / "voice-patch-reviews.json").resolve()
        if root not in path.parents:
            raise ValueError("Voice Patch review path escapes its project.")
        return path

    @staticmethod
    def _sha_json(value: Any) -> str:
        payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _metadata_sha(output) -> str:
        value = output.model_dump(mode="json", by_alias=True, exclude={"audio_available"})
        payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _identity(self, project_id: str, output_id: str) -> dict[str, Any]:
        packet = self.history.list(project_id)
        revision = next((item for item in packet["revisions"] if item["output"].id == output_id), None)
        if revision is None:
            raise KeyError(output_id)
        output = revision["output"]
        audio_path = self.history.outputs.audio_path(project_id, output.id).resolve()
        root = self._root(project_id)
        if root not in audio_path.parents or not audio_path.is_file():
            raise KeyError(output_id)
        digest = hashlib.sha256()
        with audio_path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        audio_sha = digest.hexdigest()
        report_sha = revision.get("report", {}).get("outputAudioSha256")
        if isinstance(report_sha, str) and audio_sha != report_sha:
            raise KeyError(output_id)
        metadata_sha = self._metadata_sha(output)
        material = {"version": 1, "outputId": output.id, "audioSha256": audio_sha,
            "metadataSha256": metadata_sha, "comparisonKey": revision["comparisonKey"]}
        return {"revision": revision, "outputAudioSha256": audio_sha,
            "outputMetadataSha256": metadata_sha, "key": self._sha_json(material)}

    def _load(self, project_id: str) -> dict[str, Any]:
        path = self._path(project_id)
        if not path.exists():
            return {**self._DEFAULT, "reviews": []}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ValueError("Voice Patch review file is corrupt; refusing to overwrite it.") from exc
        if (not isinstance(data, dict) or data.get("version") != 1
                or isinstance(data.get("revision"), bool) or not isinstance(data.get("revision"), int)
                or data["revision"] < 0 or not isinstance(data.get("reviews"), list)):
            raise ValueError("Voice Patch review file is invalid; refusing to overwrite it.")
        validated = []
        try:
            for item in data["reviews"]:
                validated.append(VoicePatchReviewEntry.model_validate(item).model_dump(mode="json", by_alias=True))
        except (TypeError, ValueError) as exc:
            raise ValueError("Voice Patch review entry is invalid; refusing to overwrite it.") from exc
        return {"version": 1, "revision": data["revision"], "reviews": validated}

    def get(self, project_id: str, output_id: str) -> dict[str, Any]:
        identity = self._identity(project_id, output_id)
        with self._lock:
            data = self._load(project_id)
        prior = next((item for item in reversed(data["reviews"]) if item["outputId"] == output_id), None)
        status = "unreviewed" if prior is None else "current" if prior["key"] == identity["key"] else "stale"
        return {"revision": data["revision"], "expectedKey": identity["key"], "status": status,
            "ratings": prior["ratings"] if status != "unreviewed" else VoicePatchReviewRatings().model_dump(by_alias=True),
            "notes": prior["notes"] if prior is not None else "",
            **({"review": prior} if prior is not None else {})}

    def save(self, project_id: str, output_id: str, request: VoicePatchReviewRequest) -> dict[str, Any]:
        identity = self._identity(project_id, output_id)
        if request.expected_key != identity["key"]:
            raise ValueError("Accepted Patch audio changed; refresh before saving the review.")
        with self._lock:
            current_identity = self._identity(project_id, output_id)
            if request.expected_key != current_identity["key"]:
                raise ValueError("Accepted Patch audio changed; refresh before saving the review.")
            identity = current_identity
            data = self._load(project_id)
            if request.expected_revision != data["revision"]:
                raise ValueError("Voice Patch reviews changed; refresh before saving.")
            entry = VoicePatchReviewEntry(
                output_id=output_id,
                key=identity["key"],
                output_audio_sha256=identity["outputAudioSha256"],
                output_metadata_sha256=identity["outputMetadataSha256"],
                comparison_key=identity["revision"]["comparisonKey"],
                listened=True,
                ratings=request.ratings,
                notes=request.notes,
                reviewed_at=datetime.now(timezone.utc),
            )
            data["revision"] += 1
            data["reviews"].append(entry.model_dump(mode="json", by_alias=True))
            FileProjectRepository._atomic_write(self._path(project_id), json.dumps(data, ensure_ascii=False, indent=2))
            saved = data
        return {"revision": saved["revision"], "expectedKey": identity["key"], "status": "current",
            "ratings": entry.ratings.model_dump(by_alias=True), "notes": entry.notes,
            "review": entry.model_dump(mode="json", by_alias=True)}
