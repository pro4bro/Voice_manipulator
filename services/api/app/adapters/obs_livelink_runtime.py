"""Machine-local v3 lifecycle state and project-owned recording journal."""

from __future__ import annotations

import hashlib
import json
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from pydantic import ValidationError

from app.adapters.obs_livelink_connection import LiveLinkError, ObsLiveLinkConnection
from app.adapters.obs_livelink_deletions import deleted_recording_ids
from app.domain.obs_livelink_state import (
    ObsAppAction, ObsCaptureRecording, ObsChannel, ObsLifecycleEvent, ObsLiveLinkState,
    ObsResyncRequired, ObsStateConflict, ObsTargetLease, ObsTriggerPolicy,
    apply_app_action, apply_channel_ack, apply_obs_event,
)
from app.domain.ports import ProjectRepository
from app.domain.recording_name import recording_name


class ObsLiveLinkRuntime:
    """Coordinates the reducer with an authenticated OBS connection.

    Machine state survives an API restart for the same OBS process. Recording
    journals live under their owning project and use only relative paths.
    """

    CAPTURE_STALL_SECONDS = 3.0

    def __init__(self, connection: ObsLiveLinkConnection, projects: ProjectRepository,
                 data_root: Path) -> None:
        self.connection = connection
        self.projects = projects
        self.root = data_root / "obs-livelink-v3"
        self._lock = threading.RLock()
        self._state: ObsLiveLinkState | None = None
        self._capture_recording_id: str | None = None
        self._capture_stats: dict[str, dict] = {}
        self._policy = ObsTriggerPolicy()
        self._recording_folder_connected = False
        try:
            self._recording_folder_connected = bool(json.loads(
                self._recording_folder_setting().read_text(encoding="utf-8")).get("enabled"))
        except (OSError, ValueError):
            pass

    @staticmethod
    def _write(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".part")
        with temporary.open("wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)

    def _state_path(self, install_id: str) -> Path:
        return self.root / str(UUID(install_id)) / "state.json"

    def _policy_path(self, install_id: str, project_id: str) -> Path:
        digest = hashlib.sha256(f"{install_id}:{project_id}".encode()).hexdigest()
        return self.root / "policies" / f"{digest}.json"

    def _recording_folder_setting(self) -> Path:
        return self.root / "recording-folder.json"

    def _recording_folder_path(self, install_id: str) -> Path:
        return self.root / str(UUID(install_id)) / "recording-folder-path.json"

    def set_recording_folder_connected(self, enabled: bool) -> dict:
        with self._lock:
            self._recording_folder_connected = bool(enabled)
            self._write(self._recording_folder_setting(), json.dumps({"enabled": bool(enabled)}).encode())
            if not enabled:
                for path in self.root.glob("*/recording-folder-path.json"):
                    path.unlink(missing_ok=True)
            return self.status()

    def _locator_path(self, install_id: str, span_id: str) -> Path:
        key = hashlib.sha256(span_id.encode("utf-8")).hexdigest()
        return self.root / str(UUID(install_id)) / "video-locators" / f"{key}.json"

    def _read_locator(self, span_id: str) -> dict | None:
        state = self._state
        if state is None:
            return None
        try:
            return json.loads(self._locator_path(state.install_id, span_id).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def _effective_locator(self, state: ObsLiveLinkState, span) -> dict | None:
        locator = self._read_locator(span.span_id)
        if locator or not self._recording_folder_connected or span.ended_monotonic_ns is None:
            return locator
        try:
            folder = json.loads(self._recording_folder_path(state.install_id).read_text(encoding="utf-8"))["folder"]
            candidates = [path for path in Path(folder).glob("*.mkv") if path.is_file() and path.stat().st_size > 0]
            if not candidates:
                return None
            path = max(candidates, key=lambda item: item.stat().st_mtime_ns).resolve(strict=True)
            return {"path": str(path), "folder": str(path.parent), "fallback": True}
        except (OSError, KeyError, ValueError):
            return None

    def video_span(self, span_id: str):
        with self._lock:
            state = self._require_state()
            span = next((item for item in state.spans if item.span_id == span_id), None)
            if span is None:
                raise LiveLinkError("OBS video span was not found.", 404)
            return span, self._effective_locator(state, span)

    def link_video_asset(self, span_id: str, asset_id: str, sha256: str) -> None:
        with self._lock:
            state = self._require_state()
            index = next((i for i, item in enumerate(state.spans) if item.span_id == span_id), None)
            if index is None:
                raise LiveLinkError("OBS video span was not found.", 404)
            span = state.spans[index]
            if span.ended_monotonic_ns is None:
                raise LiveLinkError("OBS video span is still recording.", 409)
            if span.imported_video_asset_id:
                if span.video_sha256 == sha256:
                    return
                raise LiveLinkError("A different MKV is already linked to this OBS span.", 409)
            changed = span.model_copy(update={"imported_video_asset_id": asset_id, "video_sha256": sha256})
            spans = list(state.spans)
            spans[index] = changed
            self._state = state.model_copy(update={"spans": spans})
            self._persist()

    def _load_policy(self, install_id: str, project_id: str | None) -> ObsTriggerPolicy:
        if not project_id:
            return ObsTriggerPolicy()
        path = self._policy_path(install_id, project_id)
        try:
            return ObsTriggerPolicy.model_validate_json(path.read_bytes())
        except (OSError, ValueError):
            return ObsTriggerPolicy()

    def set_policy(self, project_id: str, policy: ObsTriggerPolicy) -> dict:
        self.projects.get(project_id)
        with self._lock:
            state = self._require_state()
            self._write(self._policy_path(state.install_id, project_id),
                        policy.model_dump_json(by_alias=True).encode())
            active_project = self.connection.status()["activeProject"]
            if ((active_project and active_project["id"] == project_id) or
                    (state.recording and state.recording.project_id == project_id)):
                self._policy = policy
            return self.status()

    def _require_state(self) -> ObsLiveLinkState:
        if self._state is None:
            raise LiveLinkError("OBS LiveLink is not initialized.")
        return self._state

    def recover_recording(self, authorization: str, *, install_id: str,
                          connection_id: str, epoch: str, recording_id: str) -> dict:
        """Reattach a stopped project journal when OBS restarts with PCM in its outbox."""
        self.connection.require_connection(authorization, install_id, connection_id, epoch)
        try:
            UUID(recording_id)
        except ValueError as exc:
            raise LiveLinkError("Invalid OBS recording ID.", 422) from exc
        with self._lock:
            state = self._require_state()
            if state.install_id != install_id:
                raise LiveLinkError("OBS installation does not own this recording.", 403)
            matches = []
            for project in self.projects.list():
                path = Path(project.project_path).resolve() / "assets" / "obs-livelink" / recording_id / "recording.json"
                try:
                    recorded = ObsCaptureRecording.model_validate(
                        json.loads(path.read_text(encoding="utf-8"))["recording"])
                except (OSError, ValueError, KeyError):
                    continue
                if (recorded.recording_id == recording_id and recorded.project_id == project.id and
                        recorded.status == "stopped" and recorded.ended_monotonic_ns is not None):
                    matches.append(recorded)
            if len(matches) != 1:
                raise LiveLinkError("Stopped OBS recording journal is missing or ambiguous.", 404 if not matches else 409)
            recorded = matches[0]
            root = Path(self.projects.get(recorded.project_id).project_path).resolve()
            if recording_id in deleted_recording_ids(root):
                raise LiveLinkError("OBS recording was permanently deleted.", 404)
            previous = [item for item in state.completed_recordings if item.recording_id != recording_id]
            recent_ids = {item.recording_id for item in previous[-4:]}
            retained = [item for item in previous if item.archive_status == "pending" or
                        item.recording_id in recent_ids]
            self._state = state.model_copy(update={"completed_recordings": [*retained, recorded]})
            self._persist()
            return {"recordingId": recording_id, "endedMonotonicNs": recorded.ended_monotonic_ns,
                    "archiveStatus": recorded.archive_status, "projectId": recorded.project_id}

    def sync(self, payload: dict, snapshot: dict, *, for_obs: bool = False) -> dict:
        install_id = payload["installId"]
        process_id = payload.get("processInstanceId")
        with self._lock:
            try:
                self._recording_folder_connected = bool(json.loads(
                    self._recording_folder_setting().read_text(encoding="utf-8")).get("enabled"))
            except (OSError, ValueError):
                self._recording_folder_connected = False
            if self._recording_folder_connected and payload.get("recordingFolder"):
                try:
                    folder = Path(payload["recordingFolder"]).expanduser().resolve(strict=True)
                    if folder.is_dir():
                        path = self._recording_folder_path(install_id)
                        try:
                            saved = json.loads(path.read_bytes())
                        except (OSError, ValueError):
                            saved = None
                        locator = {"folder": str(folder)}
                        # Heartbeats share the PCM ingress lock. Only a changed
                        # or missing locator needs another durable disk flush.
                        if saved != locator:
                            self._write(path, json.dumps(locator).encode())
                except (OSError, ValueError):
                    pass
            if self._state is None:
                try:
                    loaded = ObsLiveLinkState.model_validate_json(self._state_path(install_id).read_bytes())
                except (OSError, ValueError):
                    loaded = None
                self._state = loaded
                if loaded is not None:
                    refreshed = []
                    for item in loaded.completed_recordings:
                        try:
                            root = Path(self.projects.get(item.project_id).project_path).resolve()
                            if item.recording_id in deleted_recording_ids(root):
                                continue
                            path = root / "assets" / "obs-livelink" / item.recording_id / "recording.json"
                            recorded = ObsCaptureRecording.model_validate(
                                json.loads(path.read_text(encoding="utf-8"))["recording"])
                            if (recorded.archive_status == "ready" and recorded.source_archive and
                                    (root / recorded.source_archive.source_path).is_file()):
                                item = recorded
                        except (OSError, KeyError, ValueError):
                            pass
                        refreshed.append(item)
                    self._state = loaded.model_copy(update={"completed_recordings": refreshed})
            if self._state is None or (process_id and self._state.process_instance_id != process_id):
                # A new OBS process must not erase stopped project recordings.
                # Its connection/event cursor is new, while their durable PCM
                # may still be replaying from the plugin's SQLite outbox.
                completed = []
                if self._state and self._state.install_id == install_id:
                    previous = self._state.completed_recordings
                    recent_ids = {item.recording_id for item in previous[-5:]}
                    completed = [item for item in previous if item.archive_status == "pending" or
                                 item.recording_id in recent_ids]
                self._state = ObsLiveLinkState(
                    connection_id=snapshot["connectionId"], install_id=install_id,
                    process_instance_id=process_id or "unknown",
                    completed_recordings=completed,
                )
            project = snapshot["activeProject"]
            lease = None
            if project:
                lease = ObsTargetLease(
                    connection_id=snapshot["connectionId"], project_id=project["id"],
                    workspace_id="local-workspace", owner_id="current-owner", revision=1,
                    expires_at=datetime.now(timezone.utc) + timedelta(
                        seconds=snapshot["leaseExpiresInSeconds"]),
                )
            try:
                channels = [ObsChannel(
                    channel_id=item["channelId"], source_uuid=item["sourceUuid"],
                    native_name=item["nativeName"] or item["alias"],
                    relay_label=item["alias"], alias_revision=item["aliasRevision"],
                    slot=item["slot"], presence="missing" if item["missing"] else "active",
                    forward_desired=item["desiredForward"],
                    forward_applied=item["appliedForward"],
                ) for item in snapshot["channels"]]
            except ValidationError as exc:
                raise LiveLinkError("Invalid OBS channel inventory.", 422) from exc
            current = self._state
            # A new connection epoch does not change the owner of an already
            # active recording. Only future Starts use the current lease.
            next_state = current.model_copy(update={
                "connection_id": snapshot["connectionId"], "target_lease": lease,
                "channels": channels,
            })
            observed = snapshot.get("obsRecording")
            if observed in {"idle", "recording", "paused"}:
                next_state = next_state.model_copy(update={"obs_status": observed})
            self._state = next_state
            policy_project_id = project["id"] if project else (
                next_state.recording.project_id if next_state.recording else None)
            self._policy = self._load_policy(install_id, policy_project_id)
            if (current.connection_id != next_state.connection_id or
                    current.channels != next_state.channels):
                self._persist()
            return self.status(snapshot, for_obs=for_obs)

    def status(self, connection_snapshot: dict | None = None, *, for_obs: bool = False) -> dict:
        with self._lock:
            snapshot = dict(connection_snapshot or self.connection.status())
            state = self._state
            recording = state.recording if state else None
            if state:
                snapshot["obsRecording"] = state.obs_status
            snapshot["appRecording"] = recording.model_dump(mode="json", by_alias=True) if recording else None
            if not for_obs:
                stats = self._capture_for(recording) if recording else {}
                snapshot["channels"] = [
                    {**channel, "capture": self._channel_capture(channel, recording, snapshot, stats)}
                    for channel in snapshot["channels"]
                ]
            # OBS's obs_data JSON parser accepts signed 64-bit integers only.
            # Matroska TrackUID is uint64, so omit archive detail from plugin
            # heartbeat/hello snapshots; the app status and journal retain it.
            completed = state.completed_recordings[-5:] if state else []
            if state and for_obs:
                recent_ids = {item.recording_id for item in completed}
                completed = [item for item in state.completed_recordings if
                             item.archive_status == "pending" or item.recording_id in recent_ids]
            snapshot["recentRecordings"] = [item.model_dump(
                mode="json", by_alias=True,
                exclude={"source_archive"} if for_obs else None,
            ) for item in completed]
            snapshot["videoSpans"] = [span.model_dump(mode="json", by_alias=True) for span in state.spans] if state else []
            snapshot["lastTransitionMonotonicNs"] = state.last_transition_monotonic_ns if state else -1
            snapshot["triggerPolicy"] = self._policy.model_dump(mode="json", by_alias=True)
            snapshot["connectRecordingFolder"] = self._recording_folder_connected
            try:
                folder_record = (json.loads(self._recording_folder_path(state.install_id).read_text(encoding="utf-8"))
                                 if state and self._recording_folder_connected else {})
                snapshot["recordingFolder"] = folder_record.get("folder")
            except (OSError, ValueError):
                snapshot["recordingFolder"] = None
            locators = [self._effective_locator(state, span) for span in state.spans] if state else []
            snapshot["videoSpans"] = [
                {**span.model_dump(mode="json", by_alias=True),
                 "recordingFileName": Path(locator["path"]).name if locator else None,
                 "recordingFolder": locator.get("folder") if locator else None,
                 "recordingFileAvailable": bool(locator and Path(locator["path"]).is_file())}
                for span, locator in zip(state.spans, locators)
            ] if state else []
            return snapshot

    @staticmethod
    def _accumulate_capture(stats: dict[str, dict], channel_id: str, metadata: dict) -> None:
        previous = stats.get(channel_id)
        sequence = metadata["sequence"]
        if previous and sequence <= previous["lastDurableSequence"]:
            return
        first = metadata["firstSampleIndex"]
        gap = max(0, first - previous["lastDurableSampleIndexExclusive"]) if previous else 0
        stats[channel_id] = {
            "durableChunkCount": (previous["durableChunkCount"] if previous else 0) + 1,
            "lastDurableSequence": sequence,
            "lastDurableSampleIndexExclusive": first + metadata["frameCount"],
            "lastDurableAtUtc": metadata["receivedAtUtc"],
            "sampleGapCount": (previous["sampleGapCount"] if previous else 0) + bool(gap),
            "sampleGapFrames": (previous["sampleGapFrames"] if previous else 0) + gap,
        }

    def _capture_for(self, recording: ObsCaptureRecording) -> dict[str, dict]:
        if self._capture_recording_id == recording.recording_id:
            return self._capture_stats
        stats: dict[str, dict] = {}
        try:
            project_root = Path(self.projects.get(recording.project_id).project_path).resolve()
            channels_root = project_root / "assets" / "obs-livelink" / recording.recording_id / "channels"
            for channel_folder in channels_root.iterdir():
                if not channel_folder.is_dir():
                    continue
                checkpoint = channel_folder / "capture-evidence.json"
                sequence = 0
                try:
                    saved = json.loads(checkpoint.read_text(encoding="utf-8"))
                    saved_stats = saved["stats"]
                    if (saved.get("schemaVersion") == 1 and
                            saved["recordingId"] == recording.recording_id and
                            saved["channelId"] == channel_folder.name and
                            type(saved["lastDurableSequence"]) is int and
                            saved["lastDurableSequence"] >= 0 and
                            saved_stats["lastDurableSequence"] == saved["lastDurableSequence"] and
                            saved_stats["lastDurableSampleIndexExclusive"] ==
                            saved["lastDurableSampleIndexExclusive"]):
                        last_path = channel_folder / "chunks" / f"{saved['lastDurableSequence']:012d}.json"
                        last = json.loads(last_path.read_text(encoding="utf-8"))
                        if (last["firstSampleIndex"] + last["frameCount"] ==
                                saved["lastDurableSampleIndexExclusive"] and
                                last_path.with_suffix(".pcm").is_file() and
                                last_path.with_suffix(".pcm").stat().st_size ==
                                last["frameCount"] * last["channels"] * 2):
                            stats[channel_folder.name] = saved_stats
                            sequence = saved["lastDurableSequence"] + 1
                except (OSError, ValueError, KeyError, TypeError):
                    pass
                while True:
                    path = channel_folder / "chunks" / f"{sequence:012d}.json"
                    if not path.is_file():
                        break
                    metadata = json.loads(path.read_text(encoding="utf-8"))
                    pcm_path = path.with_suffix(".pcm")
                    if (not pcm_path.is_file() or pcm_path.stat().st_size !=
                            metadata["frameCount"] * metadata["channels"] * 2):
                        break
                    metadata.setdefault("receivedAtUtc", datetime.fromtimestamp(
                        path.stat().st_mtime, timezone.utc).isoformat())
                    self._accumulate_capture(stats, channel_folder.name, metadata)
                    sequence += 1
        except (OSError, ValueError, KeyError, TypeError):
            pass
        self._capture_recording_id = recording.recording_id
        self._capture_stats = stats
        return stats

    def note_durable_chunk(self, recording: ObsCaptureRecording, channel_id: str,
                           metadata: dict, *, duplicate: bool) -> None:
        with self._lock:
            stats = self._capture_for(recording)
            if not duplicate:
                self._accumulate_capture(stats, channel_id, metadata)
                current = stats.get(channel_id)
                if current and current["durableChunkCount"] % 16 == 0:
                    try:
                        project_root = Path(self.projects.get(recording.project_id).project_path).resolve()
                        checkpoint = (project_root / "assets" / "obs-livelink" / recording.recording_id /
                                      "channels" / channel_id / "capture-evidence.json")
                        self._write(checkpoint, json.dumps({
                            "schemaVersion": 1, "recordingId": recording.recording_id,
                            "channelId": channel_id, "lastDurableSequence": current["lastDurableSequence"],
                            "lastDurableSampleIndexExclusive": current["lastDurableSampleIndexExclusive"],
                            "stats": current,
                        }, separators=(",", ":")).encode())
                    except OSError:
                        # PCM and chunk metadata already passed the durable ACK boundary.
                        pass

    def _channel_capture(self, channel: dict, recording: ObsCaptureRecording | None,
                         snapshot: dict, stats: dict[str, dict]) -> dict:
        channel_id = channel["channelId"]
        durable = stats.get(channel_id)
        result = {
            "recordingId": recording.recording_id if recording else None,
            "projectId": recording.project_id if recording else None,
            "state": "idle",
            "durableChunkCount": durable["durableChunkCount"] if durable else 0,
            "lastDurableSequence": durable["lastDurableSequence"] if durable else None,
            "lastDurableSampleIndexExclusive": durable["lastDurableSampleIndexExclusive"] if durable else None,
            "lastDurableAtUtc": durable["lastDurableAtUtc"] if durable else None,
            "sampleGapCount": durable["sampleGapCount"] if durable else 0,
            "sampleGapFrames": durable["sampleGapFrames"] if durable else 0,
        }
        if recording is None:
            return result
        open_interval = next((part.reason for part in reversed(recording.channel_intervals)
                              if part.channel_id == channel_id and part.end_monotonic_ns is None), None)
        if snapshot["connectionState"] != "connected":
            result["state"] = "disconnected"
        elif channel["missing"] or open_interval == "source-missing":
            result["state"] = "missing"
        elif channel["pendingCommandId"] or open_interval == "forward-pending":
            result["state"] = "forward-pending"
        elif not channel["appliedForward"] or open_interval == "user-disabled":
            result["state"] = "disabled"
        elif recording.status == "paused":
            result["state"] = "paused"
        else:
            instant = durable["lastDurableAtUtc"] if durable else recording.started_at_utc
            if isinstance(instant, str):
                try:
                    instant = datetime.fromisoformat(instant)
                except ValueError:
                    instant = None
            age = (datetime.now(timezone.utc) - instant).total_seconds() if instant else float("inf")
            result["state"] = ("stalled" if age > self.CAPTURE_STALL_SECONDS else
                               "receiving" if durable else "pending")
        return result

    def _persist(self) -> None:
        state = self._require_state()
        completed = [item for item in state.completed_recordings if item.recording_id not in
                     deleted_recording_ids(Path(self.projects.get(item.project_id).project_path).resolve())]
        def named(recording: ObsCaptureRecording) -> ObsCaptureRecording:
            if recording.display_name:
                return recording
            return recording.model_copy(update={"display_name": recording_name(
                recording.started_at_utc, self.projects.get(recording.project_id).name,
                "LIV", recording.recording_id)})
        state = state.model_copy(update={
            "recording": named(state.recording) if state.recording else None,
            "completed_recordings": [named(item) for item in completed],
        })
        self._state = state
        self._write(self._state_path(state.install_id),
                    state.model_dump_json(by_alias=True, indent=2).encode())
        records = [*state.completed_recordings]
        if state.recording:
            records.append(state.recording)
        for recording in records:
            project_root = Path(self.projects.get(recording.project_id).project_path).resolve()
            folder = project_root / "assets" / "obs-livelink" / recording.recording_id
            spans = [span for span in state.spans if span.span_id in recording.video_span_ids]
            record = {"protocolVersion": 3,
                      "recording": recording.model_dump(mode="json", by_alias=True),
                      "videoSpans": [span.model_dump(mode="json", by_alias=True) for span in spans],
                      "channels": [channel.model_dump(mode="json", by_alias=True) for channel in state.channels]}
            path = folder / "recording.json"
            if path.is_file():
                previous = json.loads(path.read_text(encoding="utf-8"))
                if previous.get("liveSttRecoveryVersion") == 1:
                    record["liveSttRecoveryVersion"] = 1
                for key in ("sourceStems", "transportGaps", "archiveSha256"):
                    if key in previous:
                        record[key] = previous[key]
                known = {item["channelId"] for item in record["channels"]}
                record["channels"].extend(item for item in previous.get("channels", [])
                                          if item["channelId"] not in known)
            else:
                record["liveSttRecoveryVersion"] = 1
            self._write(path, json.dumps(record, indent=2).encode())

    def discard_deleted_recordings(self) -> None:
        """Drop newly deleted recordings from the current machine snapshot."""
        with self._lock:
            if self._state is not None:
                self._persist()

    def archive_ready(self, recording_id: str, archive: dict) -> None:
        with self._lock:
            state = self._require_state()
            changed = []
            for item in state.completed_recordings:
                changed.append(ObsCaptureRecording.model_validate({
                    **item.model_dump(by_alias=True), "archiveStatus": "ready",
                    "sourceArchive": archive,
                }) if item.recording_id == recording_id else item)
            if not any(item.recording_id == recording_id for item in changed):
                raise LiveLinkError("Stopped OBS recording is unknown.")
            self._state = state.model_copy(update={"completed_recordings": changed})
            self._persist()

    def archive_error(self, recording_id: str) -> None:
        with self._lock:
            state = self._require_state()
            changed = [item.model_copy(update={"archive_status": "error"})
                       if item.recording_id == recording_id else item
                       for item in state.completed_recordings]
            self._state = state.model_copy(update={"completed_recordings": changed})
            self._persist()

    def event(self, authorization: str, payload: dict) -> dict:
        self.connection.require_connection(authorization, payload.get("installId", ""),
                                           payload.get("connectionId", ""),
                                           payload.get("connectionEpoch", ""))
        with self._lock:
            state = self._require_state()
            raw = {**payload, "occurredAt": datetime.now(timezone.utc).isoformat()}
            if payload.get("kind") == "obs-start":
                raw["recordingId"] = str(uuid5(
                    NAMESPACE_URL, f"{state.install_id}/{state.process_instance_id}/{payload['eventId']}"))
            try:
                event = ObsLifecycleEvent.model_validate(raw)
            except ValidationError as exc:
                raise LiveLinkError("Invalid OBS lifecycle event.", 422) from exc
            try:
                next_state = apply_obs_event(state, event, self._policy)
            except ObsResyncRequired as exc:
                raise LiveLinkError(f"OBS event stream needs resync: {exc}") from exc
            except ObsStateConflict as exc:
                raise LiveLinkError(str(exc)) from exc
            if next_state is not state:
                self._state = next_state
                if (payload.get("kind") == "obs-stop" and self._recording_folder_connected
                        and payload.get("lastRecordingPath")):
                    try:
                        recording_path = Path(payload["lastRecordingPath"]).expanduser().resolve(strict=True)
                        folder = Path(payload.get("recordingFolder", "")).expanduser().resolve(strict=True)
                        if (recording_path.is_file() and recording_path.suffix.lower() == ".mkv"
                                and recording_path.parent == folder):
                            span_id = payload.get("spanId")
                            self._write(self._locator_path(state.install_id, span_id), json.dumps({
                                "path": str(recording_path), "folder": str(folder),
                                "size": recording_path.stat().st_size,
                                "mtimeNs": recording_path.stat().st_mtime_ns,
                            }).encode())
                    except (OSError, ValueError, TypeError):
                        pass
                self._persist()
            return self.status()

    def action(self, kind: str) -> dict:
        with self._lock:
            state = self._require_state()
            if kind == "start" and (state.recording is not None or state.target_lease is None):
                raise LiveLinkError("OBS recording is active or no project owns the target.")
            if kind in {"pause", "resume", "stop"} and state.recording is None:
                raise LiveLinkError("App recording is idle.")
            recording_id = str(uuid4()) if kind == "start" else state.recording.recording_id
            command = self.connection.queue_action(kind, recording_id)
            return {"commandId": command["commandId"], **self.status()}

    def sync_current(self, snapshot: dict) -> dict:
        with self._lock:
            if self._state is None:
                return self.status(snapshot)
            return self.sync({"installId": self._state.install_id}, snapshot)

    def applied_ack(self, command: dict | None, payload: dict) -> dict:
        if command is None or payload.get("error"):
            return self.status()
        with self._lock:
            state = self._require_state()
            at_ns = payload["appliedMonotonicNs"]
            if command["kind"] == "app-action":
                action = ObsAppAction(command_id=command["commandId"],
                                      kind=command["action"], monotonic_ns=at_ns,
                                      occurred_at=datetime.now(timezone.utc),
                                      recording_id=command["recordingId"])
                try:
                    self._state = apply_app_action(state, action)
                except ObsStateConflict as exc:
                    raise LiveLinkError(str(exc)) from exc
            elif command["kind"] == "set-channel-forward":
                try:
                    self._state = apply_channel_ack(
                        state, command["channelId"], command["sourceUuid"],
                        command["desiredState"], at_ns, payload.get("sampleIndex"),
                    )
                except ObsStateConflict as exc:
                    raise LiveLinkError(str(exc)) from exc
            self._persist()
            return self.status()
