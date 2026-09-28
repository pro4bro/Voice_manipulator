from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.domain.models import ObsLiveSession
from app.domain.obs_livelink_state import (
    ObsAppAction,
    ObsArchiveTrack,
    ObsAudioEvidence,
    ObsChannel,
    ObsCommandAck,
    ObsCommandEnvelope,
    ObsCaptureRecording,
    ObsLifecycleEvent,
    ObsLiveLinkState,
    ObsPreRollChunk,
    ObsResyncRequired,
    ObsSourceArchive,
    ObsStateConflict,
    ObsTargetLease,
    ObsTriggerPolicy,
    ObsVideoSpan,
    apply_app_action,
    apply_channel_ack,
    apply_obs_event,
    legacy_track_view,
    plan_pre_roll_retention,
    validate_command_ack,
)


NOW = datetime(2026, 9, 26, tzinfo=timezone.utc)


def state(*, armed: bool = True) -> ObsLiveLinkState:
    return ObsLiveLinkState(
        connection_id="connection-1", install_id="install-1",
        process_instance_id="obs-process-1",
        target_lease=ObsTargetLease(
            connection_id="connection-1", project_id="project-1",
            workspace_id="workspace-1", owner_id="owner-1",
            revision=1, expires_at=NOW + timedelta(minutes=5),
        ) if armed else None,
    )


def event(sequence: int, kind: str, *, span: str | None = "span-1",
          recording: str | None = None, at: int | None = None,
          channel: str | None = None, source: str | None = None,
          sample: int | None = None) -> ObsLifecycleEvent:
    return ObsLifecycleEvent(
        install_id="install-1", process_instance_id="obs-process-1",
        event_id=f"event-{sequence}", sequence=sequence, kind=kind,
        span_id=span, recording_id=recording,
        channel_id=channel, source_uuid=source, applied_sample_index=sample,
        monotonic_ns=at if at is not None else (sequence + 1) * 1_000_000_000,
        occurred_at=NOW + timedelta(seconds=sequence),
    )


def action(command_id: str, kind: str, *, recording: str | None = None,
           at: int = 1_500_000_000) -> ObsAppAction:
    return ObsAppAction(
        command_id=command_id, kind=kind, recording_id=recording,
        monotonic_ns=at, occurred_at=NOW,
    )


def test_livelink_can_be_active_while_app_idle_and_lease_is_required():
    linked = state(armed=False)
    linked = apply_obs_event(linked, event(0, "obs-start", recording="rec-1"),
                             ObsTriggerPolicy())
    assert linked.linked and linked.obs_status == "recording"
    assert linked.recording is None
    assert linked.active_span_id == "span-1"
    with pytest.raises(ObsStateConflict, match="lease"):
        apply_app_action(linked, action("start-1", "start", recording="rec-1"))


def test_manual_pause_survives_obs_unpause_and_ignore_change():
    current = state()
    current = apply_obs_event(current, event(0, "obs-start", recording="rec-1"),
                              ObsTriggerPolicy())
    current = apply_app_action(current, action("pause-manual", "pause"))
    current = apply_obs_event(current, event(1, "obs-pause"), ObsTriggerPolicy())
    assert current.recording.status == "paused"
    assert current.recording.pause_causes == {"manual", "obs-automation"}
    current = apply_obs_event(current, event(2, "obs-resume"),
                              ObsTriggerPolicy(ignore_pause=True))
    assert current.recording.status == "paused"
    assert current.recording.pause_causes == {"manual"}
    assert len(current.recording.capture_pause_intervals) == 1
    assert current.recording.capture_pause_intervals[0].end_monotonic_ns is None
    assert current.spans[0].pause_intervals[0].end_monotonic_ns == 3_000_000_000
    current = apply_app_action(current, action("resume-manual", "resume",
                                                at=3_500_000_000))
    assert current.recording.status == "recording"
    assert current.recording.capture_pause_intervals[0].end_monotonic_ns == 3_500_000_000


def test_ignore_pause_keeps_app_recording_but_observes_video_pause():
    current = apply_obs_event(state(), event(0, "obs-start", recording="rec-1"),
                              ObsTriggerPolicy())
    current = apply_obs_event(current, event(1, "obs-pause"),
                              ObsTriggerPolicy(ignore_pause=True))
    assert current.recording.status == "recording"
    assert current.obs_status == "paused"
    assert current.spans[0].pause_intervals[0].end_monotonic_ns is None


def test_ignore_stop_keeps_one_app_recording_across_two_obs_video_spans():
    policy = ObsTriggerPolicy(ignore_stop=True)
    current = apply_obs_event(state(), event(0, "obs-start", recording="rec-1"), policy)
    current = apply_obs_event(current, event(1, "obs-stop"), policy)
    assert current.recording.recording_id == "rec-1"
    assert current.obs_status == "idle"
    current = apply_obs_event(current, event(2, "obs-start", span="span-2"), policy)
    assert current.recording.video_span_ids == ["span-1", "span-2"]
    current = apply_obs_event(current, event(3, "obs-stop", span="span-2"),
                              ObsTriggerPolicy())
    assert current.recording is None
    assert current.completed_recordings[0].video_span_ids == ["span-1", "span-2"]
    assert current.completed_recordings[0].archive_status == "pending"


def test_manual_start_mid_obs_span_and_manual_stop_do_not_stop_obs():
    current = apply_obs_event(state(), event(0, "obs-start"),
                              ObsTriggerPolicy(ignore_start=True))
    current = apply_app_action(current, action("manual-start", "start",
                                                recording="rec-1"))
    assert current.recording.video_span_ids == ["span-1"]
    current = apply_app_action(current, action("manual-stop", "stop", at=2_000_000_000))
    assert current.recording is None
    assert current.obs_status == "recording"
    assert current.active_span_id == "span-1"


def test_joining_an_already_recording_obs_span_preserves_unknown_head():
    joined = state().model_copy(update={
        "obs_status": "recording", "active_span_id": "span-joined",
        "spans": [ObsVideoSpan(span_id="span-joined",
                               started_monotonic_ns=1_000_000_000,
                               start_reason="link-joined")],
    })
    current = apply_app_action(joined, action("manual-start", "start",
                                               recording="rec-1"))
    assert current.recording.video_span_ids == ["span-joined"]
    assert current.spans[0].start_reason == "link-joined"


def test_duplicate_stale_conflicting_and_missing_obs_events():
    first = event(0, "obs-start", recording="rec-1")
    current = apply_obs_event(state(), first, ObsTriggerPolicy())
    assert apply_obs_event(current, first, ObsTriggerPolicy()) is current
    with pytest.raises(ObsStateConflict, match="reused"):
        apply_obs_event(current, event(0, "obs-pause"), ObsTriggerPolicy())
    with pytest.raises(ObsResyncRequired, match="gap"):
        apply_obs_event(current, event(2, "obs-stop"), ObsTriggerPolicy())
    with pytest.raises(ObsResyncRequired, match="before an applied boundary"):
        apply_obs_event(current, event(1, "obs-pause", at=1), ObsTriggerPolicy())
    with pytest.raises(ObsStateConflict, match="process identity"):
        apply_obs_event(current, first.model_copy(update={
            "process_instance_id": "another-process",
        }), ObsTriggerPolicy())


def test_duplicate_manual_command_is_idempotent():
    current = apply_obs_event(state(), event(0, "obs-start", recording="rec-1"),
                              ObsTriggerPolicy())
    pause = action("pause-1", "pause")
    current = apply_app_action(current, pause)
    assert apply_app_action(current, pause) is current
    with pytest.raises(ObsStateConflict, match="reused"):
        apply_app_action(current, action("pause-1", "stop"))


def test_v3_state_roundtrips_with_sequence_history_and_project_ownership():
    current = apply_obs_event(state(), event(0, "obs-start", recording="rec-1"),
                              ObsTriggerPolicy())
    loaded = ObsLiveLinkState.model_validate_json(current.model_dump_json(by_alias=True))
    assert loaded.recording.connection_id == "connection-1"
    assert loaded.recording.project_id == "project-1"
    assert loaded.event_fingerprints[0] == current.event_fingerprints[0]
    assert apply_obs_event(loaded, event(0, "obs-start", recording="rec-1"),
                           ObsTriggerPolicy()) is loaded


def test_livelink_stop_closes_app_capture_without_claiming_obs_stopped():
    current = apply_obs_event(state(), event(0, "obs-start", recording="rec-1"),
                              ObsTriggerPolicy())
    current = apply_obs_event(current, event(1, "livelink-stop"),
                              ObsTriggerPolicy(ignore_stop=True))
    assert not current.linked
    assert current.obs_status == "unknown"
    assert current.recording is None
    assert current.spans[0].end_reason == "link-stopped"
    with pytest.raises(ObsStateConflict, match="hello again"):
        apply_obs_event(current, event(2, "obs-stop"), ObsTriggerPolicy())


def test_channel_toggle_creates_disabled_interval_with_applied_sample_boundaries():
    current = state().model_copy(update={"channels": [
        ObsChannel(channel_id="ch-1", source_uuid="uuid-1", native_name="Mic",
                   relay_label="Mic", forward_desired=True, forward_applied=True),
    ]})
    policy = ObsTriggerPolicy()
    current = apply_obs_event(current, event(0, "obs-start", recording="rec-1"), policy)
    current = apply_obs_event(current, event(1, "channel-forward-off",
                                             channel="ch-1", source="uuid-1",
                                             sample=48_000), policy)
    assert not current.channels[0].forward_applied
    assert current.recording.channel_intervals[0].reason == "user-disabled"
    current = apply_obs_event(current, event(2, "channel-forward-on",
                                             channel="ch-1", source="uuid-1",
                                             sample=96_000), policy)
    assert current.recording.channel_intervals[0].start_sample_index == 48_000
    assert current.recording.channel_intervals[0].end_sample_index == 96_000
    assert current.recording.channel_intervals[0].end_monotonic_ns == 3_000_000_000


def test_forward_ack_records_disabled_interval_after_heartbeat_updated_channel():
    current = state().model_copy(update={"channels": [
        ObsChannel(channel_id="ch-1", source_uuid="uuid-1", native_name="Mic",
                   relay_label="Mic", forward_desired=True, forward_applied=True),
    ]})
    current = apply_app_action(current, action("start-1", "start", recording="rec-1"))
    channel = current.channels[0].model_copy(update={"forward_desired": False})
    current = current.model_copy(update={"channels": [channel]})
    current = apply_channel_ack(current, "ch-1", "uuid-1", False, 2_000_000_000, 48_000)
    assert current.recording.channel_intervals[0].reason == "user-disabled"
    assert current.recording.channel_intervals[0].start_sample_index == 48_000
    current = apply_channel_ack(current, "ch-1", "uuid-1", True, 3_000_000_000, 96_000)
    assert current.recording.channel_intervals[0].end_sample_index == 96_000


def test_channel_aliases_are_trimmed_and_unique_case_insensitively():
    first = ObsChannel(channel_id="ch-1", source_uuid="uuid-1",
                       native_name="Mic", relay_label=" Mic ")
    second = ObsChannel(channel_id="ch-2", source_uuid="uuid-2",
                        native_name="Mic 2", relay_label="mic")
    assert first.relay_label == "Mic"
    with pytest.raises(ValidationError, match="relay labels must be unique"):
        ObsLiveLinkState(connection_id="connection-1", install_id="install-1",
                         process_instance_id="obs-process-1",
                         channels=[first, second])


def test_missing_source_keeps_identity_and_tombstone_blocks_reuse():
    current = state().model_copy(update={"channels": [
        ObsChannel(channel_id="ch-1", source_uuid="uuid-1", native_name="Mic",
                   relay_label="Mic", slot=1, forward_desired=True,
                   forward_applied=True),
    ]})
    policy = ObsTriggerPolicy()
    current = apply_obs_event(current, event(0, "obs-start", recording="rec-1"), policy)
    current = apply_obs_event(current, event(1, "channel-missing",
                                             channel="ch-1", source="uuid-1"), policy)
    assert current.channels[0].presence == "missing"
    assert current.recording.channel_intervals[0].reason == "source-missing"
    with pytest.raises(ObsStateConflict, match="mapping"):
        apply_obs_event(current, event(2, "channel-restored",
                                       channel="ch-1", source="new-uuid"), policy)
    current = apply_obs_event(current, event(2, "channel-removed",
                                             channel="ch-1", source="uuid-1"), policy)
    assert current.channels[0].presence == "tombstone"
    assert current.channels[0].slot == 1
    with pytest.raises(ObsStateConflict, match="cannot be reused"):
        apply_obs_event(current, event(3, "channel-restored",
                                       channel="ch-1", source="uuid-1"), policy)


def test_restored_source_waits_for_forward_ack_before_claiming_audio():
    current = state().model_copy(update={"channels": [
        ObsChannel(channel_id="ch-1", source_uuid="uuid-1", native_name="Mic",
                   relay_label="Mic", forward_desired=True, forward_applied=True),
    ]})
    policy = ObsTriggerPolicy()
    current = apply_obs_event(current, event(0, "obs-start", recording="rec-1"), policy)
    current = apply_obs_event(current, event(1, "channel-missing",
                                             channel="ch-1", source="uuid-1"), policy)
    current = apply_obs_event(current, event(2, "channel-restored",
                                             channel="ch-1", source="uuid-1"), policy)
    assert current.channels[0].forward_desired
    assert not current.channels[0].forward_applied
    assert [item.reason for item in current.recording.channel_intervals] == [
        "source-missing", "forward-pending",
    ]
    current = apply_obs_event(current, event(3, "channel-forward-on",
                                             channel="ch-1", source="uuid-1"), policy)
    assert current.channels[0].forward_applied
    assert all(item.end_monotonic_ns is not None
               for item in current.recording.channel_intervals)


def test_audio_evidence_requires_sample_and_clock_units():
    chunk = ObsAudioEvidence(
        connection_id="connection-1", connection_epoch="epoch-1",
        recording_id="rec-1", channel_id="ch-1", source_uuid="uuid-1",
        sequence=0, first_sample_index=0, frame_count=48000,
        sample_rate=48000, channels=2, obs_audio_timestamp_ns=1_000_000_000,
        plugin_monotonic_ns=1_001_000_000, received_at=NOW,
        pcm_sha256="a" * 64,
    )
    assert chunk.format == "pcm_s16le"
    with pytest.raises(ValidationError):
        ObsAudioEvidence.model_validate({
            **chunk.model_dump(), "pcm_sha256": "not-a-sha256",
        })


def test_pre_roll_keeps_at_most_two_seconds_per_source():
    chunks = [
        ObsPreRollChunk(chunk_id=f"chunk-{index}", channel_id="mic",
                        plugin_monotonic_ns=index * 1_000_000_000,
                        frame_count=48000, sample_rate=48000, channels=1)
        for index in range(3)
    ]
    result = plan_pre_roll_retention(chunks)
    assert result.retained_ids == ["chunk-1", "chunk-2"]
    assert result.discarded_ids == ["chunk-0"]
    assert result.transport_gap_ids == []


def test_global_pre_roll_cap_marks_owned_eviction_as_transport_gap():
    chunks = [
        ObsPreRollChunk(chunk_id=f"chunk-{index}", channel_id=f"source-{index}",
                        plugin_monotonic_ns=index, frame_count=192000,
                        sample_rate=192000, channels=8, owned=index == 0)
        for index in range(22)
    ]
    result = plan_pre_roll_retention(chunks)
    assert len(result.retained_ids) == 21
    assert result.transport_gap_ids == ["chunk-0"]
    assert result.discarded_ids == []


def test_command_ack_rejects_stale_epoch_and_missing_applied_boundary():
    command = ObsCommandEnvelope(
        command_id="cmd-1", idempotency_key="toggle-ch-1-1",
        connection_id="connection-1", connection_epoch="epoch-1",
        revision=3, kind="channel-forward", channel_id="ch-1",
        desired_state=False,
    )
    valid = ObsCommandAck(
        command_id="cmd-1", connection_epoch="epoch-1", revision=3,
        applied_monotonic_ns=123, applied_sample_index=48000,
        applied_state=False,
    )
    validate_command_ack(command, valid)
    with pytest.raises(ObsStateConflict, match="epoch/revision"):
        validate_command_ack(command, valid.model_copy(update={
            "connection_epoch": "old-epoch",
        }))
    with pytest.raises(ObsStateConflict, match="boundary"):
        validate_command_ack(command, valid.model_copy(update={
            "applied_monotonic_ns": None,
        }))


def test_mka_track_reference_is_portable_and_does_not_mix_sources():
    first = ObsArchiveTrack(channel_id="ch-1", source_uuid="uuid-1",
                            stream_index=0, track_uid=11, relay_label="Mic",
                            alias_revision=1)
    second = ObsArchiveTrack(channel_id="ch-2", source_uuid="uuid-2",
                             stream_index=1, track_uid=12, relay_label="Meeting",
                             alias_revision=1)
    archive = ObsSourceArchive(parent_asset_id="asset-1",
                               source_path="assets/media/asset-1/source.mka",
                               tracks=[first, second])
    assert ObsSourceArchive.model_validate_json(archive.model_dump_json()).tracks[1].channel_id == "ch-2"
    with pytest.raises(ValidationError, match="project-relative"):
        ObsSourceArchive(parent_asset_id="asset-1", source_path="C:/capture/source.mka")
    with pytest.raises(ValidationError, match="distinct"):
        ObsSourceArchive(parent_asset_id="asset-1", source_path="source.mka",
                         tracks=[first, first])
    with pytest.raises(ValidationError, match="Ready MKA archive"):
        ObsCaptureRecording(
            recording_id="rec-1", connection_id="connection-1",
            project_id="project-1", started_monotonic_ns=0,
            status="stopped", archive_status="ready",
        )


def test_v2_wav_session_stays_readable_without_fake_mka_conversion():
    old = ObsLiveSession(
        id="live-123", obs_version="32.2.2", capture_id="capture-1",
        source_id="mic-1", source_label="Mic", sample_rate=48000, channels=1,
        started_timestamp_ns=1, created_at=NOW, updated_at=NOW,
        status="stopped", stem_path="assets/media/asset-1/source.wav",
        analysis_path="assets/media/asset-1/analysis.wav", asset_id="asset-1",
    )
    loaded = ObsLiveSession.model_validate_json(old.model_dump_json(by_alias=True))
    view = legacy_track_view(loaded)
    assert view.protocol_version == 2
    assert view.source_path.endswith("source.wav")
    assert view.asset_id == "asset-1"
