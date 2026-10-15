from __future__ import annotations

import hashlib
import json
import random
from typing import Literal

from pydantic import Field, model_validator

from app.domain.models import DomainModel
from app.domain.reference_bindings import ReferenceBinding, ReferenceProperty
from app.domain.voice_script_document import VoiceScriptDocument, effective_settings


PROPERTY_SETTING = {
    "timing": "duration",
    "intonation": "mood",
    "volume": "gainDb",
    "emotion": "emotion",
    "shout": "delivery",
    "whisper": "delivery",
}
POLICY = "reference-schedule-v1"
MIN_SPAN_SECONDS = 0.25
MAX_EVENTS = 32


class ReferenceScheduleConflict(ValueError):
    pass


class ReferenceScheduleRequest(DomainModel):
    binding_id: str = Field(min_length=1, max_length=160)
    seed: int = Field(ge=0, le=2**63 - 1)
    random_values: bool = False
    random_times: bool = False


class ReferenceScheduleApplyRequest(ReferenceScheduleRequest):
    expected_revision: int = Field(ge=0)
    expected_key: str = Field(pattern=r"^[a-f0-9]{64}$")


class ReferenceScheduleEvent(DomainModel):
    id: str
    property: ReferenceProperty
    target_start: float = Field(ge=0)
    target_end: float = Field(gt=0)
    source_asset_id: str
    source_start: float = Field(ge=0)
    source_end: float = Field(gt=0)
    strength: float = Field(ge=0, le=1)
    priority: int = Field(ge=0, le=100)
    capability: Literal["unsupported"] = "unsupported"
    blocker: str
    applied: Literal[False] = False


class ReferenceSchedule(DomainModel):
    key: str
    binding_id: str
    binding_fingerprint: str
    source_fingerprint: str
    edit_fingerprint: str
    settings_fingerprint: str
    seed: int
    random_values: bool
    random_times: bool
    target_start: float
    target_end: float
    events: list[ReferenceScheduleEvent] = Field(max_length=MAX_EVENTS)
    events_fingerprint: str
    notices: list[str] = Field(default_factory=list)
    applied: Literal[False] = False
    status: Literal["ready", "stale", "conflict"] = "ready"
    status_reason: str | None = None

    @model_validator(mode="after")
    def check_saved_events(self):
        if self.events_fingerprint != _digest([event.model_dump(by_alias=True) for event in self.events]):
            raise ValueError("Saved reference events failed their integrity check.")
        return self


class ReferenceScheduleDocument(DomainModel):
    version: Literal[1] = 1
    revision: int = Field(default=0, ge=0)
    schedules: list[ReferenceSchedule] = Field(default_factory=list, max_length=10000)


def _digest(value: object) -> str:
    serialized = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _source_payload(binding: ReferenceBinding) -> list[dict]:
    sources = []
    for source in binding.sources:
        value = source.model_dump(by_alias=True, exclude={"name"})
        value["properties"] = sorted(value["properties"])
        sources.append(value)
    return sorted(sources, key=lambda item: (item["assetId"], item["start"], item["end"]))


def binding_fingerprint(binding: ReferenceBinding) -> str:
    return _digest({
        "bindingId": binding.id,
        "scope": binding.scope.model_dump(by_alias=True),
        "target": binding.target.model_dump(by_alias=True),
        "sources": _source_payload(binding),
    })


def _seed_for(seed: int, binding_id: str, property_name: str, purpose: str) -> int:
    raw = f"{POLICY}|{seed}|{binding_id}|{property_name}|{purpose}".encode()
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")


def _intervals(start: float, end: float, count: int, rng: random.Random) -> list[tuple[float, float]]:
    duration = end - start
    if duration < MIN_SPAN_SECONDS - 1e-9:
        raise ReferenceScheduleConflict("Target spans must be at least 0.25 seconds.")
    count = max(1, min(count, MAX_EVENTS))
    extra = max(0.0, duration - count * MIN_SPAN_SECONDS)
    weights = [max(rng.random(), 1e-9) for _ in range(count)]
    total_weight = sum(weights)
    lengths = [MIN_SPAN_SECONDS + extra * weight / total_weight for weight in weights]
    result = []
    cursor = start
    for length in lengths[:-1]:
        next_cursor = cursor + length
        result.append((cursor, next_cursor))
        cursor = next_cursor
    result.append((cursor, end))
    if any(right - left < MIN_SPAN_SECONDS - 1e-8 for left, right in result):
        raise ReferenceScheduleConflict("Cannot partition target without a span below 0.25 seconds.")
    return result


def _guard_settings(
    script: VoiceScriptDocument,
    row_ids: list[str],
    properties: list[ReferenceProperty],
    random_values: bool,
    random_times: bool,
) -> dict[str, dict]:
    rows = {row.id: row for row in script.rows}
    snapshot: dict[str, dict] = {}
    if not (random_values or random_times):
        return snapshot
    for row_id in sorted(set(row_ids)):
        row = rows.get(row_id)
        if row is None:
            raise ReferenceScheduleConflict("Target Script row is missing; reassign the reference.")
        settings = effective_settings(script, row)
        for property_name in properties:
            setting = PROPERTY_SETTING[property_name]
            value = settings.get(setting)
            locked = setting in settings.get("locked", [])
            snapshot.setdefault(row_id, {})[setting] = {"value": value, "locked": locked}
            if locked or value is not None:
                raise ReferenceScheduleConflict(
                    f"Random {property_name} schedule conflicts with configured or locked Script setting '{setting}' on row '{row_id}'."
                )
    return snapshot


def binding_properties(binding: ReferenceBinding) -> list[ReferenceProperty]:
    return sorted({prop for source in binding.sources if source.strength > 0 for prop in source.properties})


def script_settings_fingerprint(
    script: VoiceScriptDocument,
    row_ids: list[str],
    properties: list[ReferenceProperty],
    random_values: bool,
    random_times: bool,
) -> str:
    return _digest(_guard_settings(script, row_ids, properties, random_values, random_times))


def plan_reference_schedule(
    binding: ReferenceBinding,
    request: ReferenceScheduleRequest,
    script: VoiceScriptDocument,
    *,
    target_start: float,
    target_end: float,
    row_ids: list[str],
    edit_fingerprint: str,
) -> ReferenceSchedule:
    if binding.id != request.binding_id:
        raise ReferenceScheduleConflict("Schedule request does not match the reference binding.")
    if target_end - target_start < MIN_SPAN_SECONDS - 1e-9:
        raise ReferenceScheduleConflict("Target spans must be at least 0.25 seconds.")

    sources = _source_payload(binding)
    properties = binding_properties(binding)
    if not properties:
        raise ReferenceScheduleConflict("No positive-strength sources are assigned to properties.")

    settings_guard = _guard_settings(script, row_ids, properties, request.random_values, request.random_times)
    settings_key = _digest(settings_guard)
    binding_key = binding_fingerprint(binding)
    source_key = _digest(sources)
    key_payload = {
        "policy": POLICY,
        "bindingFingerprint": binding_key,
        "sourceFingerprint": source_key,
        "randomValues": request.random_values,
        "randomTimes": request.random_times,
        "seed": request.seed,
        "editFingerprint": edit_fingerprint,
        "settingsFingerprint": settings_key,
    }
    key = _digest(key_payload)

    per_property_event_limit = max(1, MAX_EVENTS // len(properties))
    events: list[ReferenceScheduleEvent] = []
    notices: list[str] = []
    for property_name in properties:
        candidates = sorted(
            [source for source in binding.sources if property_name in source.properties and source.strength > 0],
            key=lambda source: (source.asset_id, source.start, source.end, source.priority, source.strength),
        )
        if not candidates:
            continue
        fixed_source = max(candidates, key=lambda source: (source.priority, source.strength, source.asset_id))
        value_rng = random.Random(_seed_for(request.seed, binding.id, property_name, "value"))
        time_rng = random.Random(_seed_for(request.seed, binding.id, property_name, "time"))
        selected_count = 1
        if request.random_times:
            duration = target_end - target_start
            selected_count = min(per_property_event_limit, max(1, int(duration / 0.5)))
            if selected_count == 1:
                notices.append("Target is too short for multiple time events; one full-coverage event was emitted.")
        intervals = (
            _intervals(target_start, target_end, selected_count, time_rng)
            if request.random_times
            else [(target_start, target_end)]
        )
        chosen_sources = [
            value_rng.choice(candidates) if request.random_values else fixed_source
            for _ in intervals
        ]
        target_duration = target_end - target_start
        for index, ((event_start, event_end), source) in enumerate(zip(intervals, chosen_sources)):
            source_duration = source.end - source.start
            relative_start = (event_start - target_start) / target_duration
            relative_end = (event_end - target_start) / target_duration
            events.append(ReferenceScheduleEvent(
                id=f"{property_name}-{index + 1}",
                property=property_name,
                target_start=event_start,
                target_end=event_end,
                source_asset_id=source.asset_id,
                source_start=source.start + source_duration * relative_start,
                source_end=source.start + source_duration * relative_end,
                strength=source.strength,
                priority=source.priority,
                blocker=f"No verified processor applies reference {property_name} conditioning; this schedule remains preview-only.",
            ))
    if not events or len(events) > MAX_EVENTS:
        raise ReferenceScheduleConflict("Reference schedule exceeds the 32-event limit or has no events.")
    return ReferenceSchedule(
        key=key,
        binding_id=binding.id,
        binding_fingerprint=binding_key,
        source_fingerprint=source_key,
        edit_fingerprint=edit_fingerprint,
        settings_fingerprint=settings_key,
        seed=request.seed,
        random_values=request.random_values,
        random_times=request.random_times,
        target_start=target_start,
        target_end=target_end,
        events=events,
        events_fingerprint=_digest([event.model_dump(by_alias=True) for event in events]),
        notices=sorted(set(notices)),
    )
