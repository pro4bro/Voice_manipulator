"""Machine-local OBS connection and single-owner project target lease."""

from __future__ import annotations

import hmac
import json
import math
import threading
import time
import uuid
from pathlib import Path


class LiveLinkError(ValueError):
    def __init__(self, message: str, status: int = 409) -> None:
        super().__init__(message)
        self.status = status


class ObsLiveLinkConnection:
    LEASE_SECONDS = 15.0
    CONNECTION_SECONDS = 15.0

    def __init__(self, pairing_file: Path) -> None:
        self.pairing_file = pairing_file
        self._lock = threading.RLock()
        self._changed = threading.Condition(self._lock)
        self._server_epoch = str(uuid.uuid4())
        self._connection: dict | None = None
        self._lease: dict | None = None
        self._channels: dict[str, dict] = {}
        self._scene_collection = ""
        self._command_revision = 0
        self._status_revision = 0
        self._pending: dict[str, dict] = {}
        self._action_pending: dict[str, dict] = {}
        self._acked: dict[str, dict] = {}

    def _identity(self, authorization: str, install_id: str) -> None:
        try:
            pairing = json.loads(self.pairing_file.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise LiveLinkError("OBS pairing is unavailable; Repair the plugin in Preferences.", 503) from exc
        token = pairing.get("token")
        expected_id = pairing.get("installId")
        supplied = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
        if not isinstance(token, str) or len(token) < 32 or not isinstance(expected_id, str) or not (
            hmac.compare_digest(supplied, token) and hmac.compare_digest(install_id, expected_id)
        ):
            raise LiveLinkError("OBS pairing was rejected.", 401)

    def _snapshot(self) -> dict:
        now = time.monotonic()
        if self._lease and self._lease["deadline"] <= now:
            self._lease = None
        connection = self._connection
        online = bool(connection and connection["deadline"] > now)
        lease = self._lease
        return {
            "connectionState": "connected" if online else "disconnected",
            "connectionId": connection["id"] if online else None,
            "connectionEpoch": connection["epoch"] if online else None,
            "serverEpoch": self._server_epoch,
            "commandRevision": self._command_revision,
            "pendingAction": next(iter(self._action_pending.values()))["action"] if self._action_pending else None,
            "statusRevision": self._status_revision,
            "sceneCollection": self._scene_collection,
            "channels": [dict(channel) for channel in sorted(self._channels.values(), key=lambda item: item["slot"])],
            "obsRecording": (
                "paused" if connection["recordingPaused"] else
                "recording" if connection["recordingActive"] else "idle"
            ) if online else "unknown",
            "activeProject": {"id": lease["projectId"], "name": lease["projectName"]} if lease else None,
            "leaseExpiresInSeconds": max(0, int(lease["deadline"] - now + 0.99)) if lease else 0,
        }

    def status(self) -> dict:
        with self._lock:
            return self._snapshot()

    def _sync_channels(self, payload: dict) -> None:
        if "channels" not in payload:
            return
        incoming = payload["channels"]
        if not isinstance(incoming, list) or len(incoming) > 128:
            raise LiveLinkError("Invalid OBS channel inventory.", 422)
        seen_ids: set[str] = set()
        seen_sources: set[str] = set()
        updated: dict[str, dict] = {}
        for item in incoming:
            if not isinstance(item, dict):
                raise LiveLinkError("Invalid OBS channel inventory.", 422)
            channel_id, source_uuid = item.get("channelId"), item.get("sourceUuid")
            try:
                uuid.UUID(channel_id)
                uuid.UUID(source_uuid)
            except (TypeError, ValueError, AttributeError) as exc:
                raise LiveLinkError("Invalid OBS channel identity.", 422) from exc
            if channel_id in seen_ids or source_uuid in seen_sources:
                raise LiveLinkError("Duplicate OBS channel identity.", 422)
            seen_ids.add(channel_id)
            seen_sources.add(source_uuid)
            alias, name = item.get("alias"), item.get("nativeName")
            slot, alias_revision = item.get("slot"), item.get("aliasRevision")
            peak = item.get("meterPeak", 0)
            sample_rate = item.get("sampleRate", 0)
            audio_channels = item.get("audioChannels", 0)
            muted = item.get("muted", False)
            if (not isinstance(alias, str) or not alias.strip() or len(alias) > 80 or
                not isinstance(name, str) or len(name) > 200 or
                type(slot) is not int or not 1 <= slot <= 10000 or
                type(alias_revision) is not int or alias_revision < 0 or
                type(item.get("forward")) is not bool or type(item.get("missing")) is not bool or
                not isinstance(peak, (int, float)) or not math.isfinite(peak) or not 0 <= peak <= 100 or
                type(sample_rate) is not int or not 0 <= sample_rate <= 384000 or
                type(audio_channels) is not int or not 0 <= audio_channels <= 8 or
                type(muted) is not bool):
                raise LiveLinkError("Invalid OBS channel inventory.", 422)
            previous = self._channels.get(channel_id)
            pending = self._pending.get(channel_id)
            applied = previous["appliedForward"] if pending and previous else item["forward"]
            updated[channel_id] = {
                "channelId": channel_id, "sourceUuid": source_uuid, "nativeName": name,
                "alias": alias, "aliasRevision": alias_revision, "slot": slot,
                "missing": item["missing"], "meterPeak": peak,
                "sampleRate": sample_rate, "audioChannels": audio_channels, "muted": muted,
                "desiredForward": pending["desiredState"] if pending else item["forward"],
                "appliedForward": applied, "pendingCommandId": pending["commandId"] if pending else None,
            }
            if previous and previous.get("appliedForward") == applied:
                for field in ("appliedMonotonicNs", "appliedSampleIndex", "lastError"):
                    if field in previous:
                        updated[channel_id][field] = previous[field]
        if len({channel["slot"] for channel in updated.values()}) != len(updated):
            raise LiveLinkError("Duplicate OBS channel slot.", 422)
        scene = payload.get("sceneCollection", self._scene_collection)
        if not isinstance(scene, str) or len(scene) > 200:
            raise LiveLinkError("Invalid OBS scene collection.", 422)
        if scene != self._scene_collection:
            self._pending.clear()
            for channel in updated.values():
                channel["desiredForward"] = channel["appliedForward"]
                channel["pendingCommandId"] = None
        self._scene_collection = scene
        if updated != self._channels:
            self._channels = updated
            self._status_revision += 1
            self._changed.notify_all()

    def _require_connection(self, authorization: str, install_id: str, connection_id: str, epoch: str) -> dict:
        self._identity(authorization, install_id)
        connection = self._connection
        if not connection or connection["deadline"] <= time.monotonic() or (
            connection_id, epoch
        ) != (connection["id"], connection["epoch"]):
            raise LiveLinkError("OBS connection expired; send hello again.")
        return connection

    def hello(self, authorization: str, payload: dict) -> dict:
        self._identity(authorization, payload.get("installId", ""))
        if not (payload.get("protocolMin", 4) <= 3 <= payload.get("protocolMax", 2)):
            raise LiveLinkError("OBS LiveLink protocol v3 is required.", 426)
        try:
            uuid.UUID(payload["processInstanceId"])
        except (KeyError, ValueError, TypeError) as exc:
            raise LiveLinkError("Invalid OBS process instance.", 422) from exc
        with self._lock:
            previous = self._connection
            if previous and previous["processInstanceId"] == payload["processInstanceId"] and previous["deadline"] > time.monotonic():
                previous["deadline"] = time.monotonic() + self.CONNECTION_SECONDS
                recording = (payload.get("recordingActive", False), payload.get("recordingPaused", False))
                if recording != (previous["recordingActive"], previous["recordingPaused"]):
                    self._status_revision += 1
                previous["recordingActive"], previous["recordingPaused"] = recording
            else:
                self._connection = {
                    "id": str(uuid.uuid4()), "epoch": str(uuid.uuid4()),
                    "processInstanceId": payload["processInstanceId"],
                    "recordingActive": payload.get("recordingActive", False),
                    "recordingPaused": payload.get("recordingPaused", False),
                    "deadline": time.monotonic() + self.CONNECTION_SECONDS,
                }
                self._channels.clear()
                self._scene_collection = ""
                self._pending.clear()
                self._action_pending.clear()
                self._acked.clear()
                self._command_revision = 0
                self._status_revision += 1
            self._sync_channels(payload)
            self._changed.notify_all()
            return {**self._snapshot(), "negotiatedVersion": 3}

    def heartbeat(self, authorization: str, payload: dict) -> dict:
        with self._lock:
            connection = self._require_connection(
                authorization, payload.get("installId", ""), payload.get("connectionId", ""),
                payload.get("connectionEpoch", ""),
            )
            connection["deadline"] = time.monotonic() + self.CONNECTION_SECONDS
            recording = (payload.get("recordingActive", False), payload.get("recordingPaused", False))
            if recording != (connection["recordingActive"], connection["recordingPaused"]):
                self._status_revision += 1
            connection["recordingActive"], connection["recordingPaused"] = recording
            self._sync_channels(payload)
            return self._snapshot()

    def set_forward(self, channel_id: str, enabled: bool) -> dict:
        with self._lock:
            if self._snapshot()["connectionState"] != "connected":
                raise LiveLinkError("OBS LiveLink is disconnected.")
            channel = self._channels.get(channel_id)
            if not channel or channel["missing"]:
                raise LiveLinkError("OBS channel is unavailable.")
            if channel["desiredForward"] == enabled:
                return self._snapshot()
            self._command_revision += 1
            command = {
                "commandId": str(uuid.uuid4()), "idempotencyKey": str(uuid.uuid4()),
                "connectionId": self._connection["id"], "connectionEpoch": self._connection["epoch"],
                "revision": self._command_revision, "kind": "set-channel-forward",
                "channelId": channel_id, "sourceUuid": channel["sourceUuid"], "desiredState": enabled,
            }
            self._pending[channel_id] = command
            channel["desiredForward"] = enabled
            channel["pendingCommandId"] = command["commandId"]
            channel.pop("lastError", None)
            self._status_revision += 1
            self._changed.notify_all()
            return self._snapshot()

    def queue_action(self, kind: str, recording_id: str | None = None) -> dict:
        if kind not in {"start", "pause", "resume", "stop"}:
            raise LiveLinkError("Invalid app recording action.", 422)
        with self._lock:
            if self._snapshot()["connectionState"] != "connected":
                raise LiveLinkError("OBS LiveLink is disconnected.")
            if self._action_pending:
                raise LiveLinkError("An app recording action is awaiting OBS ACK.")
            self._command_revision += 1
            command = {
                "commandId": str(uuid.uuid4()), "idempotencyKey": str(uuid.uuid4()),
                "connectionId": self._connection["id"], "connectionEpoch": self._connection["epoch"],
                "revision": self._command_revision, "kind": "app-action",
                "action": kind, "recordingId": recording_id,
            }
            self._action_pending[command["commandId"]] = command
            self._status_revision += 1
            self._changed.notify_all()
            return dict(command)

    def pending_command(self, command_id: str) -> dict | None:
        with self._lock:
            command = self._action_pending.get(command_id)
            if command is None:
                command = next((item for item in self._pending.values()
                                if item["commandId"] == command_id), None)
            return dict(command) if command else None

    def require_connection(self, authorization: str, install_id: str,
                           connection_id: str, epoch: str) -> dict:
        with self._lock:
            return dict(self._require_connection(authorization, install_id, connection_id, epoch))

    def commands(self, authorization: str, install_id: str, connection_id: str, epoch: str,
                 after: int, wait_seconds: float) -> dict:
        if not 0 <= wait_seconds <= 20 or after < 0:
            raise LiveLinkError("Invalid command cursor.", 422)
        with self._changed:
            self._require_connection(authorization, install_id, connection_id, epoch)
            if after > self._command_revision:
                raise LiveLinkError("Command revision is ahead; send hello again.")
            deadline = time.monotonic() + wait_seconds
            while not self._pending and not self._action_pending and time.monotonic() < deadline:
                self._changed.wait(deadline - time.monotonic())
                self._require_connection(authorization, install_id, connection_id, epoch)
            return {"connectionEpoch": epoch, "commandRevision": self._command_revision,
                    "commands": sorted([*self._pending.values(), *self._action_pending.values()],
                                       key=lambda item: item["revision"])}

    def acknowledge(self, authorization: str, payload: dict) -> dict:
        with self._lock:
            self._require_connection(authorization, payload.get("installId", ""),
                                     payload.get("connectionId", ""), payload.get("connectionEpoch", ""))
            command_id = payload.get("commandId")
            if command_id in self._acked:
                if self._acked[command_id] != payload:
                    raise LiveLinkError("Conflicting OBS command ACK.")
                return self._snapshot()
            action_command = self._action_pending.get(command_id)
            command = action_command or next((item for item in self._pending.values()
                                              if item["commandId"] == command_id), None)
            if not command or payload.get("revision") != command["revision"]:
                raise LiveLinkError("Stale OBS command ACK.")
            applied_ns = payload.get("appliedMonotonicNs")
            sample_index = payload.get("sampleIndex")
            if (type(applied_ns) is not int or applied_ns <= 0 or
                (sample_index is not None and (type(sample_index) is not int or sample_index < 0))):
                raise LiveLinkError("OBS command ACK requires an applied boundary.", 422)
            if payload.get("error"):
                if action_command:
                    self._action_pending.pop(command_id)
                    self._acked[command_id] = dict(payload)
                    self._status_revision += 1
                    self._changed.notify_all()
                    return self._snapshot()
                channel = self._channels.get(command["channelId"])
                if channel:
                    channel["lastError"] = str(payload["error"])[:200]
                    channel["pendingCommandId"] = None
                self._pending.pop(command["channelId"])
                self._acked[command_id] = dict(payload)
                self._status_revision += 1
                self._changed.notify_all()
                return self._snapshot()
            if action_command:
                valid_state = payload.get("appliedState") == command["action"]
            else:
                valid_state = (type(payload.get("appliedState")) is bool and
                               payload["appliedState"] == command["desiredState"])
            if not valid_state:
                raise LiveLinkError("OBS command ACK does not match desired state.")
            if action_command:
                self._action_pending.pop(command_id)
                self._acked[command_id] = dict(payload)
                self._status_revision += 1
                self._changed.notify_all()
                return self._snapshot()
            channel = self._channels.get(command["channelId"])
            if not channel or channel["sourceUuid"] != command["sourceUuid"]:
                raise LiveLinkError("OBS channel identity changed before ACK.")
            channel["appliedForward"] = payload["appliedState"]
            channel["pendingCommandId"] = None
            channel["appliedMonotonicNs"] = applied_ns
            channel["appliedSampleIndex"] = payload.get("sampleIndex")
            self._pending.pop(command["channelId"])
            self._acked[command_id] = dict(payload)
            self._status_revision += 1
            self._changed.notify_all()
            return self._snapshot()

    def claim(self, *, project_id: str, project_name: str, owner_id: str) -> dict:
        if not owner_id or len(owner_id) > 100:
            raise LiveLinkError("Invalid workspace owner.", 422)
        with self._lock:
            self._snapshot()
            if self._lease and self._lease["ownerId"] != owner_id:
                raise LiveLinkError("Another workspace owns the OBS project target.")
            revision = self._lease["revision"] if self._lease else 0
            if self._lease and self._lease["projectId"] != project_id:
                revision += 1
            self._lease = {
                "projectId": project_id, "projectName": project_name,
                "ownerId": owner_id, "revision": revision + (0 if self._lease else 1),
                "deadline": time.monotonic() + self.LEASE_SECONDS,
            }
            self._status_revision += 1
            return self._snapshot()

    def release(self, owner_id: str) -> dict:
        with self._lock:
            if self._lease and self._lease["ownerId"] == owner_id:
                self._lease = None
                self._status_revision += 1
            return self._snapshot()
