"""OBS LiveLink v3 contract and pure recording state transitions.

This module has no I/O. The v2 receiver remains readable through its existing
adapter; v3 writers and transport endpoints will use this contract in later rounds.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Literal

from pydantic import AwareDatetime, Field, field_validator, model_validator

from app.domain.models import DomainModel, ObsLiveSession


PauseCause = Literal["manual", "obs-automation"]
PRE_ROLL_SOURCE_NS = 2_000_000_000
PRE_ROLL_CONNECTION_BYTES = 64 * 1024 * 1024
ObsEventKind = Literal[
    "obs-start", "obs-pause", "obs-resume", "obs-stop", "livelink-stop",
    "channel-forward-on", "channel-forward-off", "channel-missing",
    "channel-restored", "channel-removed",
]
AppActionKind = Literal["start", "pause", "resume", "stop"]


class ObsStateConflict(ValueError):
    """An event conflicts with the observed state or a previous event."""


class ObsResyncRequired(ObsStateConflict):
    """A missing event or clock reversal requires a full state snapshot."""


class ObsTargetLease(DomainModel):
    connection_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    workspace_id: str = Field(min_length=1)
    owner_id: str = Field(min_length=1)
    revision: int = Field(ge=0)
    expires_at: AwareDatetime

    def active_at(self, instant: datetime) -> bool:
        return instant < self.expires_at


class ObsChannel(DomainModel):
    channel_id: str = Field(min_length=1)
    source_uuid: str = Field(min_length=1)
    native_name: str = Field(min_length=1, max_length=200)
    relay_label: str = Field(min_length=1, max_length=80)
    alias_revision: int = Field(default=0, ge=0)
    slot: int | None = Field(default=None, ge=1)
    presence: Literal["active", "missing", "tombstone"] = "active"
    forward_desired: bool = False
    forward_applied: bool = False

    @field_validator("relay_label")
    @classmethod
    def safe_alias(cls, value: str) -> str:
        if not value.strip() or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("Relay label must be nonblank and have no control characters")
        return value.strip()


class ObsTimeInterval(DomainModel):
    start_monotonic_ns: int = Field(ge=0)
    end_monotonic_ns: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def valid_order(self) -> "ObsTimeInterval":
        if self.end_monotonic_ns is not None and self.end_monotonic_ns < self.start_monotonic_ns:
            raise ValueError("Interval end precedes start")
        return self


class ObsChannelInterval(ObsTimeInterval):
    channel_id: str = Field(min_length=1)
    reason: Literal["user-disabled", "source-missing", "forward-pending"]
    start_sample_index: int | None = Field(default=None, ge=0)
    end_sample_index: int | None = Field(default=None, ge=0)


class ObsVideoSpan(DomainModel):
    span_id: str = Field(min_length=1)
    started_monotonic_ns: int = Field(ge=0)
    start_reason: Literal["obs-start", "link-joined"] = "obs-start"
    ended_monotonic_ns: int | None = Field(default=None, ge=0)
    end_reason: Literal["obs-stop", "link-stopped"] | None = None
    pause_intervals: list[ObsTimeInterval] = Field(default_factory=list)
    # No machine-absolute OBS locator is stored in a portable project record.
    imported_video_asset_id: str | None = None
    video_sha256: str | None = None


class ObsArchiveTrack(DomainModel):
    channel_id: str = Field(min_length=1)
    source_uuid: str = Field(min_length=1)
    stream_index: int = Field(ge=0)
    track_uid: int = Field(gt=0)
    relay_label: str = Field(min_length=1, max_length=80)
    alias_revision: int = Field(ge=0)
    analysis_path: str | None = None

    @field_validator("analysis_path")
    @classmethod
    def portable_analysis_path(cls, value: str | None) -> str | None:
        if value is None:
            return None
        path = PurePosixPath(value)
        if (not value or "\\" in value or ":" in value or path.is_absolute()
                or ".." in path.parts or path.suffix.lower() != ".wav"):
            raise ValueError("Analysis WAV path must be project-relative")
        return value


class ObsSourceArchive(DomainModel):
    parent_asset_id: str = Field(min_length=1)
    source_path: str
    tracks: list[ObsArchiveTrack] = Field(default_factory=list)

    @field_validator("source_path")
    @classmethod
    def portable_mka_path(cls, value: str) -> str:
        path = PurePosixPath(value)
        if (not value or "\\" in value or ":" in value or path.is_absolute()
                or ".." in path.parts or path.suffix.lower() != ".mka"):
            raise ValueError("MKA source path must be project-relative")
        return value

    @model_validator(mode="after")
    def distinct_tracks(self) -> "ObsSourceArchive":
        indexes = [track.stream_index for track in self.tracks]
        uids = [track.track_uid for track in self.tracks]
        channels = [track.channel_id for track in self.tracks]
        if len(set(indexes)) != len(indexes) or len(set(uids)) != len(uids) or len(set(channels)) != len(channels):
            raise ValueError("MKA tracks need distinct stream indexes, UIDs and channel IDs")
        return self


class ObsCaptureRecording(DomainModel):
    recording_id: str = Field(min_length=1)
    connection_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    started_monotonic_ns: int = Field(ge=0)
    started_at_utc: AwareDatetime | None = None
    ended_monotonic_ns: int | None = Field(default=None, ge=0)
    status: Literal["recording", "paused", "stopped"] = "recording"
    archive_status: Literal["pending", "ready", "error"] = "pending"
    pause_causes: set[PauseCause] = Field(default_factory=set)
    capture_pause_intervals: list[ObsTimeInterval] = Field(default_factory=list)
    video_span_ids: list[str] = Field(default_factory=list)
    channel_intervals: list[ObsChannelInterval] = Field(default_factory=list)
    source_archive: ObsSourceArchive | None = None

    @model_validator(mode="after")
    def archive_requires_verified_reference(self) -> "ObsCaptureRecording":
        if self.archive_status == "ready" and (self.status != "stopped" or self.source_archive is None):
            raise ValueError("Ready MKA archive requires a stopped capture and source reference")
        return self


class ObsLifecycleEvent(DomainModel):
    install_id: str = Field(min_length=1)
    process_instance_id: str = Field(min_length=1)
    event_id: str = Field(min_length=1)
    sequence: int = Field(ge=0)
    kind: ObsEventKind
    monotonic_ns: int = Field(ge=0)
    occurred_at: AwareDatetime
    span_id: str | None = None
    channel_id: str | None = None
    source_uuid: str | None = None
    applied_sample_index: int | None = Field(default=None, ge=0)
    obs_audio_timestamp_ns: int | None = Field(default=None, ge=0)
    first_sample_index: int | None = Field(default=None, ge=0)
    # Supplied by the server when this Start will create an app recording.
    recording_id: str | None = None


class ObsAppAction(DomainModel):
    command_id: str = Field(min_length=1)
    kind: AppActionKind
    monotonic_ns: int = Field(ge=0)
    occurred_at: AwareDatetime
    recording_id: str | None = None


class ObsTriggerPolicy(DomainModel):
    ignore_start: bool = False
    ignore_pause: bool = False
    ignore_stop: bool = False


class ObsAudioEvidence(DomainModel):
    """A v3 chunk's clocks and sample boundary; receipt time is diagnostic."""

    connection_id: str = Field(min_length=1)
    connection_epoch: str = Field(min_length=1)
    recording_id: str = Field(min_length=1)
    channel_id: str = Field(min_length=1)
    source_uuid: str = Field(min_length=1)
    sequence: int = Field(ge=0)
    first_sample_index: int = Field(ge=0)
    frame_count: int = Field(gt=0)
    sample_rate: int = Field(ge=8000, le=192000)
    channels: int = Field(ge=1, le=8)
    obs_audio_timestamp_ns: int = Field(ge=0)
    plugin_monotonic_ns: int = Field(ge=0)
    received_at: AwareDatetime
    pcm_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    format: Literal["pcm_s16le"] = "pcm_s16le"


class ObsPreRollChunk(DomainModel):
    """Policy input for the future native ring buffer conformance test."""

    chunk_id: str = Field(min_length=1)
    channel_id: str = Field(min_length=1)
    plugin_monotonic_ns: int = Field(ge=0)
    frame_count: int = Field(gt=0)
    sample_rate: int = Field(ge=8000, le=192000)
    channels: int = Field(ge=1, le=8)
    owned: bool = False

    @property
    def duration_ns(self) -> int:
        return self.frame_count * 1_000_000_000 // self.sample_rate

    @property
    def pcm_bytes(self) -> int:
        return self.frame_count * self.channels * 2


class ObsPreRollDecision(DomainModel):
    retained_ids: list[str]
    discarded_ids: list[str]
    transport_gap_ids: list[str]


def plan_pre_roll_retention(chunks: list[ObsPreRollChunk]) -> ObsPreRollDecision:
    """Conformance oracle: oldest chunks leave first; owned loss is a gap."""
    if len({chunk.chunk_id for chunk in chunks}) != len(chunks):
        raise ValueError("Pre-roll chunk IDs must be unique")
    remaining = sorted(chunks, key=lambda chunk: (chunk.plugin_monotonic_ns, chunk.chunk_id))
    evicted: list[ObsPreRollChunk] = []
    for channel_id in {chunk.channel_id for chunk in remaining}:
        while sum(chunk.duration_ns for chunk in remaining
                  if chunk.channel_id == channel_id) > PRE_ROLL_SOURCE_NS:
            oldest = next(chunk for chunk in remaining if chunk.channel_id == channel_id)
            remaining.remove(oldest)
            evicted.append(oldest)
    while sum(chunk.pcm_bytes for chunk in remaining) > PRE_ROLL_CONNECTION_BYTES:
        evicted.append(remaining.pop(0))
    evicted.sort(key=lambda chunk: (chunk.plugin_monotonic_ns, chunk.chunk_id))
    return ObsPreRollDecision(
        retained_ids=[chunk.chunk_id for chunk in remaining],
        discarded_ids=[chunk.chunk_id for chunk in evicted if not chunk.owned],
        transport_gap_ids=[chunk.chunk_id for chunk in evicted if chunk.owned],
    )


class ObsCommandEnvelope(DomainModel):
    command_id: str = Field(min_length=1)
    idempotency_key: str = Field(min_length=1)
    connection_id: str = Field(min_length=1)
    connection_epoch: str = Field(min_length=1)
    revision: int = Field(ge=0)
    kind: Literal["channel-forward", "channel-alias", "app-start", "app-pause",
                  "app-resume", "app-stop", "refresh-inventory", "open-app"]
    recording_id: str | None = None
    channel_id: str | None = None
    desired_state: bool | str | None = None


class ObsCommandAck(DomainModel):
    command_id: str = Field(min_length=1)
    connection_epoch: str = Field(min_length=1)
    revision: int = Field(ge=0)
    applied_monotonic_ns: int | None = Field(default=None, ge=0)
    applied_sample_index: int | None = Field(default=None, ge=0)
    applied_state: bool | str | None = None
    error_code: str | None = None


def validate_command_ack(command: ObsCommandEnvelope, ack: ObsCommandAck) -> None:
    """Reject stale/mismatched ACKs before mutating applied state."""
    if (command.command_id != ack.command_id or
            command.connection_epoch != ack.connection_epoch or
            command.revision != ack.revision):
        raise ObsStateConflict("ACK does not match the pending command epoch/revision")
    if ack.error_code is None and ack.applied_monotonic_ns is None:
        raise ObsStateConflict("Successful ACK needs an applied clock boundary")


class ObsLiveLinkState(DomainModel):
    connection_id: str = Field(min_length=1)
    install_id: str = Field(min_length=1)
    process_instance_id: str = Field(min_length=1)
    linked: bool = True
    obs_status: Literal["idle", "recording", "paused", "unknown"] = "idle"
    active_span_id: str | None = None
    spans: list[ObsVideoSpan] = Field(default_factory=list)
    recording: ObsCaptureRecording | None = None
    completed_recordings: list[ObsCaptureRecording] = Field(default_factory=list)
    target_lease: ObsTargetLease | None = None
    channels: list[ObsChannel] = Field(default_factory=list)
    last_event_sequence: int = -1
    last_event_monotonic_ns: int = -1
    last_transition_monotonic_ns: int = -1
    event_fingerprints: dict[int, str] = Field(default_factory=dict)
    event_ids: dict[str, int] = Field(default_factory=dict)
    applied_commands: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def unique_channels(self) -> "ObsLiveLinkState":
        ids = [channel.channel_id for channel in self.channels]
        uuids = [channel.source_uuid for channel in self.channels]
        aliases = [channel.relay_label.casefold() for channel in self.channels
                   if channel.presence != "tombstone"]
        if len(ids) != len(set(ids)) or len(uuids) != len(set(uuids)):
            raise ValueError("LiveLink channel IDs and source UUIDs must be unique")
        if len(aliases) != len(set(aliases)):
            raise ValueError("Active LiveLink relay labels must be unique")
        return self


class ObsLegacyTrackView(DomainModel):
    """Read-only projection of a v2 per-source WAV; never claims to be MKA."""

    protocol_version: Literal[2] = 2
    session_id: str
    capture_id: str
    source_id: str
    source_label: str
    source_path: str | None
    analysis_path: str | None
    asset_id: str | None


def legacy_track_view(session: ObsLiveSession) -> ObsLegacyTrackView:
    return ObsLegacyTrackView(
        session_id=session.id, capture_id=session.capture_id,
        source_id=session.source_id, source_label=session.source_label,
        source_path=session.stem_path, analysis_path=session.analysis_path,
        asset_id=session.asset_id,
    )


def _event_fingerprint(event: ObsLifecycleEvent) -> str:
    # occurredAt is assigned when the API receives a retry; it is not part of
    # the OBS event identity and must not defeat idempotency after reconnect.
    return hashlib.sha256(event.model_dump_json(
        exclude_none=True, exclude={"occurred_at"},
    ).encode("utf-8")).hexdigest()


def _recording_with_pause(recording: ObsCaptureRecording, causes: set[PauseCause],
                          at_ns: int) -> ObsCaptureRecording:
    intervals = list(recording.capture_pause_intervals)
    if causes and not recording.pause_causes:
        intervals.append(ObsTimeInterval(start_monotonic_ns=at_ns))
    elif not causes and recording.pause_causes and intervals and intervals[-1].end_monotonic_ns is None:
        intervals[-1] = intervals[-1].model_copy(update={"end_monotonic_ns": at_ns})
    return recording.model_copy(update={
        "pause_causes": causes, "status": "paused" if causes else "recording",
        "capture_pause_intervals": intervals,
    })


def _finish_recording(state: ObsLiveLinkState, at_ns: int) -> ObsLiveLinkState:
    if state.recording is None:
        return state
    intervals = [
        interval if interval.end_monotonic_ns is not None else interval.model_copy(
            update={"end_monotonic_ns": at_ns},
        )
        for interval in state.recording.channel_intervals
    ]
    finished = state.recording.model_copy(update={
        "status": "stopped", "pause_causes": set(), "ended_monotonic_ns": at_ns,
        "channel_intervals": intervals,
        "capture_pause_intervals": [
            interval if interval.end_monotonic_ns is not None else
            interval.model_copy(update={"end_monotonic_ns": at_ns})
            for interval in state.recording.capture_pause_intervals
        ],
    })
    return state.model_copy(update={
        "recording": None, "completed_recordings": [*state.completed_recordings, finished],
    })


def _with_span(state: ObsLiveLinkState, changed: ObsVideoSpan) -> ObsLiveLinkState:
    return state.model_copy(update={
        "spans": [changed if span.span_id == changed.span_id else span for span in state.spans],
    })


def _active_span(state: ObsLiveLinkState, expected_id: str | None) -> ObsVideoSpan:
    if not expected_id or state.active_span_id != expected_id:
        raise ObsStateConflict("OBS event does not name the active video span")
    span = next((item for item in state.spans if item.span_id == expected_id), None)
    if span is None:
        raise ObsStateConflict("Active OBS video span is missing from state")
    return span


def _attach_span(recording: ObsCaptureRecording, span_id: str) -> ObsCaptureRecording:
    if span_id in recording.video_span_ids:
        return recording
    return recording.model_copy(update={"video_span_ids": [*recording.video_span_ids, span_id]})


def _new_recording(state: ObsLiveLinkState, recording_id: str | None,
                   at_ns: int, instant: datetime) -> ObsCaptureRecording:
    lease = state.target_lease
    if lease is None or lease.connection_id != state.connection_id or not lease.active_at(instant):
        raise ObsStateConflict("No active project-target lease")
    if not recording_id or any(item.recording_id == recording_id for item in state.completed_recordings):
        raise ObsStateConflict("A new unique app recording ID is required")
    initial_intervals = []
    for channel in state.channels:
        if channel.presence != "active":
            reason = "source-missing"
        elif not channel.forward_desired:
            reason = "user-disabled"
        elif not channel.forward_applied:
            reason = "forward-pending"
        else:
            continue
        initial_intervals.append(ObsChannelInterval(
            channel_id=channel.channel_id, reason=reason,
            start_monotonic_ns=at_ns,
        ))
    return ObsCaptureRecording(
        recording_id=recording_id, connection_id=state.connection_id,
        project_id=lease.project_id,
        started_monotonic_ns=at_ns,
        started_at_utc=instant,
        video_span_ids=[state.active_span_id] if state.active_span_id else [],
        channel_intervals=initial_intervals,
    )


def _apply_channel_event(state: ObsLiveLinkState, event: ObsLifecycleEvent) -> ObsLiveLinkState:
    channel = next((item for item in state.channels if item.channel_id == event.channel_id), None)
    if channel is None or channel.source_uuid != event.source_uuid:
        raise ObsStateConflict("Channel ID/source UUID mapping is unknown")
    if channel.presence == "tombstone":
        raise ObsStateConflict("Removed channel cannot be reused")

    kind = event.kind
    updates: dict[str, object] = {}
    opening: str | None = None
    closing: set[str] = set()
    if kind == "channel-forward-off":
        updates = {"forward_desired": False, "forward_applied": False}
        opening = "user-disabled"
        closing.add("forward-pending")
    elif kind == "channel-forward-on":
        if channel.presence != "active":
            raise ObsStateConflict("Missing channel cannot forward audio")
        updates = {"forward_desired": True, "forward_applied": True}
        closing.update({"user-disabled", "forward-pending"})
    elif kind == "channel-missing":
        updates = {"presence": "missing", "forward_applied": False}
        if channel.presence == "active":
            opening = "source-missing"
    elif kind == "channel-restored":
        if channel.presence != "missing":
            raise ObsStateConflict("Only a missing source can be restored")
        updates = {"presence": "active", "forward_applied": False}
        closing.add("source-missing")
        opening = "forward-pending" if channel.forward_desired else "user-disabled"
    elif kind == "channel-removed":
        updates = {"presence": "tombstone", "forward_desired": False,
                   "forward_applied": False}
        closing.update({"user-disabled", "forward-pending"})
        if channel.presence == "active":
            opening = "source-missing"
    updated = channel.model_copy(update=updates)
    next_state = state.model_copy(update={
        "channels": [updated if item.channel_id == channel.channel_id else item
                     for item in state.channels],
    })
    if state.recording is None:
        return next_state
    intervals = list(state.recording.channel_intervals)
    if closing:
        for index, interval in enumerate(intervals):
            if (interval.channel_id == channel.channel_id and interval.reason in closing
                    and interval.end_monotonic_ns is None):
                intervals[index] = interval.model_copy(update={
                    "end_monotonic_ns": event.monotonic_ns,
                    "end_sample_index": event.applied_sample_index,
                })
    if opening and not any(
        interval.channel_id == channel.channel_id and interval.reason == opening
        and interval.end_monotonic_ns is None for interval in intervals
    ):
        intervals.append(ObsChannelInterval(
            channel_id=channel.channel_id, reason=opening,
            start_monotonic_ns=event.monotonic_ns,
            start_sample_index=event.applied_sample_index,
        ))
    return next_state.model_copy(update={
        "recording": state.recording.model_copy(update={"channel_intervals": intervals}),
    })


def apply_channel_ack(state: ObsLiveLinkState, channel_id: str, source_uuid: str,
                      enabled: bool, at_ns: int,
                      sample_index: int | None) -> ObsLiveLinkState:
    """Apply a Forward ACK at its OBS boundary without consuming an event sequence."""
    if at_ns < state.last_transition_monotonic_ns:
        raise ObsResyncRequired("Channel ACK arrived before an applied transition")
    event = ObsLifecycleEvent(
        install_id=state.install_id, process_instance_id=state.process_instance_id,
        event_id=f"command-boundary-{at_ns}-{channel_id}", sequence=0,
        kind="channel-forward-on" if enabled else "channel-forward-off",
        monotonic_ns=at_ns, occurred_at=datetime.now(timezone.utc),
        channel_id=channel_id, source_uuid=source_uuid,
        applied_sample_index=sample_index,
    )
    changed = _apply_channel_event(state, event)
    return changed.model_copy(update={"last_transition_monotonic_ns": at_ns})


def apply_obs_event(state: ObsLiveLinkState, event: ObsLifecycleEvent,
                    policy: ObsTriggerPolicy) -> ObsLiveLinkState:
    """Apply one OBS event exactly once; gaps and clock reversals require resync."""
    if (event.install_id, event.process_instance_id) != (state.install_id, state.process_instance_id):
        raise ObsStateConflict("OBS process identity changed; hello again")
    fingerprint = _event_fingerprint(event)
    previous = state.event_fingerprints.get(event.sequence)
    if previous is not None:
        if previous == fingerprint:
            return state
        raise ObsStateConflict("OBS sequence was reused with different content")
    if event.event_id in state.event_ids:
        raise ObsStateConflict("OBS event ID was reused with a different sequence")
    if event.sequence != state.last_event_sequence + 1:
        raise ObsResyncRequired("OBS event sequence has a gap or stale event")
    if event.monotonic_ns < state.last_transition_monotonic_ns:
        raise ObsResyncRequired("OBS transition arrived before an applied boundary")
    if not state.linked:
        raise ObsStateConflict("LiveLink has stopped; hello again")

    next_state = state
    if event.kind.startswith("channel-"):
        next_state = _apply_channel_event(state, event)
    elif event.kind == "obs-start":
        if not event.span_id or state.active_span_id or any(
            span.span_id == event.span_id for span in state.spans
        ):
            raise ObsStateConflict("OBS Start needs a new video span ID")
        next_state = state.model_copy(update={
            "obs_status": "recording", "active_span_id": event.span_id,
            "spans": [*state.spans, ObsVideoSpan(
                span_id=event.span_id, started_monotonic_ns=event.monotonic_ns,
            )],
        })
        if state.recording is not None:
            next_state = next_state.model_copy(update={
                "recording": _attach_span(state.recording, event.span_id),
            })
        elif (not policy.ignore_start and state.target_lease
              and state.target_lease.connection_id == state.connection_id
              and state.target_lease.active_at(event.occurred_at)):
            next_state = next_state.model_copy(update={
                "recording": _new_recording(next_state, event.recording_id,
                                            event.monotonic_ns, event.occurred_at),
            })
    elif event.kind == "obs-pause":
        span = _active_span(state, event.span_id)
        if state.obs_status != "recording":
            raise ObsStateConflict("OBS Pause requires a recording video span")
        next_state = _with_span(state, span.model_copy(update={
            "pause_intervals": [*span.pause_intervals, ObsTimeInterval(
                start_monotonic_ns=event.monotonic_ns,
            )],
        })).model_copy(update={"obs_status": "paused"})
        if state.recording and not policy.ignore_pause:
            next_state = next_state.model_copy(update={
                "recording": _recording_with_pause(
                    state.recording, state.recording.pause_causes | {"obs-automation"},
                    event.monotonic_ns,
                ),
            })
    elif event.kind == "obs-resume":
        span = _active_span(state, event.span_id)
        if state.obs_status != "paused" or not span.pause_intervals or span.pause_intervals[-1].end_monotonic_ns is not None:
            raise ObsStateConflict("OBS Resume requires an open pause interval")
        intervals = [*span.pause_intervals]
        intervals[-1] = intervals[-1].model_copy(update={"end_monotonic_ns": event.monotonic_ns})
        next_state = _with_span(state, span.model_copy(update={
            "pause_intervals": intervals,
        })).model_copy(update={"obs_status": "recording"})
        # An Unpause releases only the cause OBS previously created. This holds
        # even when the user changed the Ignore Pause policy while paused.
        if state.recording:
            next_state = next_state.model_copy(update={
                "recording": _recording_with_pause(
                    state.recording, state.recording.pause_causes - {"obs-automation"},
                    event.monotonic_ns,
                ),
            })
    elif event.kind in {"obs-stop", "livelink-stop"}:
        if state.active_span_id:
            span = _active_span(state, event.span_id)
            intervals = [*span.pause_intervals]
            if intervals and intervals[-1].end_monotonic_ns is None:
                intervals[-1] = intervals[-1].model_copy(update={"end_monotonic_ns": event.monotonic_ns})
            next_state = _with_span(state, span.model_copy(update={
                "ended_monotonic_ns": event.monotonic_ns,
                "end_reason": "obs-stop" if event.kind == "obs-stop" else "link-stopped",
                "pause_intervals": intervals,
            }))
        elif event.kind == "obs-stop":
            raise ObsStateConflict("OBS Stop requires an active video span")
        next_state = next_state.model_copy(update={
            "obs_status": "idle" if event.kind == "obs-stop" else "unknown",
            "active_span_id": None,
        })
        if event.kind == "livelink-stop":
            next_state = _finish_recording(next_state, event.monotonic_ns).model_copy(update={"linked": False})
        elif state.recording and not policy.ignore_stop:
            next_state = _finish_recording(next_state, event.monotonic_ns)

    return next_state.model_copy(update={
        "last_event_sequence": event.sequence,
        "last_event_monotonic_ns": event.monotonic_ns,
        "last_transition_monotonic_ns": event.monotonic_ns,
        "event_fingerprints": {**state.event_fingerprints, event.sequence: fingerprint},
        "event_ids": {**state.event_ids, event.event_id: event.sequence},
    })


def apply_app_action(state: ObsLiveLinkState, action: ObsAppAction) -> ObsLiveLinkState:
    """Apply a backend-owned command after its plugin sample-boundary ACK."""
    previous = state.applied_commands.get(action.command_id)
    fingerprint = hashlib.sha256(action.model_dump_json(exclude_none=True).encode("utf-8")).hexdigest()
    if previous is not None:
        if previous == fingerprint:
            return state
        raise ObsStateConflict("App command ID was reused with different content")
    if not state.linked:
        raise ObsStateConflict("LiveLink is disconnected")
    if action.monotonic_ns < state.last_transition_monotonic_ns:
        raise ObsResyncRequired("App command boundary arrived before an applied transition")
    if (state.recording is not None and
            action.monotonic_ns < state.recording.started_monotonic_ns):
        raise ObsStateConflict("App action precedes the recording start boundary")

    next_state = state
    if action.kind == "start":
        if state.recording is not None:
            raise ObsStateConflict("App recording is already active")
        next_state = state.model_copy(update={
            "recording": _new_recording(
                state, action.recording_id, action.monotonic_ns, action.occurred_at,
            ),
        })
    elif action.kind in {"pause", "resume"}:
        if state.recording is None:
            raise ObsStateConflict("App recording is idle")
        causes = set(state.recording.pause_causes)
        if action.kind == "pause":
            causes.add("manual")
        else:
            causes.discard("manual")
        next_state = state.model_copy(update={
            "recording": _recording_with_pause(state.recording, causes, action.monotonic_ns),
        })
    elif action.kind == "stop":
        if state.recording is None:
            raise ObsStateConflict("App recording is idle")
        next_state = _finish_recording(state, action.monotonic_ns)
    return next_state.model_copy(update={
        "last_transition_monotonic_ns": action.monotonic_ns,
        "applied_commands": {**state.applied_commands, action.command_id: fingerprint},
    })
