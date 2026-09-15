from __future__ import annotations

import wave
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.gpu_lease import GpuBusy, GpuLease
from app.adapters.training_model_catalog import FileTrainingModelCatalog, TrainingModelUnavailable
from app.adapters.voice_changer import FileChangerRecordings, VoiceChanger, VoiceChangerError, is_virtual_cable
from app.domain.models import DatasetSegment, ProjectCreate, VoiceChangerStartRequest
from app.settings import Settings

SETTINGS = Settings.from_env()
API_ROOT = Path(__file__).resolve().parents[1]


class ReadyRuntime:
    python = Path("python.exe")

    def __init__(self, missing=None):
        self._missing = missing or []

    def missing(self):
        return self._missing


class FakeWorker:
    """Answers like voice_changer_worker.py, without devices."""

    def __init__(self):
        self.requests: list[dict] = []
        self.recording = False
        self.running = False

    def request(self, payload):
        self.requests.append(payload)
        command = payload["command"]
        if command == "devices":
            return {"ok": True, "devices": [
                {"index": 0, "name": "Microphone (SmallRig U50)", "hostApi": "MME", "maxInputChannels": 1, "maxOutputChannels": 0, "defaultSampleRate": 48000},
                {"index": 5, "name": "CABLE Input (VB-Audio Virtual Cable)", "hostApi": "MME", "maxInputChannels": 0, "maxOutputChannels": 2, "defaultSampleRate": 48000},
            ]}
        if command == "start":
            if payload["inputDevice"] == 99:
                return {"ok": False, "error": "PortAudioError: Invalid device"}
            self.running = True
            return {"ok": True, "status": self.status()}
        if command == "status":
            return {"ok": True, "status": self.status() if self.running else {"state": "idle"}}
        if command == "record_start":
            self.recording = True
            return {"ok": True, "status": self.status()}
        if command in {"record_stop", "stop"}:
            recording = None
            if payload.get("path") and self.recording:
                with wave.open(payload["path"], "wb") as handle:
                    handle.setnchannels(2)
                    handle.setsampwidth(2)
                    handle.setframerate(48000)
                    handle.writeframes(b"\x00\x00" * 2 * 48000)
                recording = {"path": payload["path"], "seconds": 1.0, "sampleRate": 48000, "delayMs": 40.0, "refinedMs": 3.0}
            self.recording = False
            if command == "stop":
                self.running = False
                return {"ok": True, "status": {"state": "idle"}, "recording": recording}
            return {"ok": True, "recording": recording}
        raise AssertionError(command)

    def status(self):
        return {"state": "running", "sampleRate": 48000, "blockMs": 40, "algorithmicLatencyMs": 40, "deviceLatencyMs": 60,
                "inputLevelDb": -20, "outputLevelDb": -22, "inputSpectrum": [0.5] * 48, "outputSpectrum": [0.4] * 48,
                "underruns": 2, "recording": self.recording, "recordingSeconds": 1.0 if self.recording else 0}

    def shutdown(self):
        self.running = False


def copy_slicer(source: Path, destination: Path, start: float, end: float) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(source.read_bytes())


def fixture(tmp_path, runtime=None):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Changer", location=str(tmp_path / "projects")))
    audio = Path(project.project_path) / "assets" / "media" / "asset-1" / "analysis.wav"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"RIFF")
    voices = FileProjectVoices(projects, copy_slicer)
    voice = voices.publish(project.id, name="Khoa · nhái giọng", speaker_profile_id="speaker-khoa", kind="clone", language="vi",
                           reference=DatasetSegment(id="s", asset_id="asset-1", audio_path="assets/media/asset-1/analysis.wav", start=0, end=8, text="mẫu", speaker_profile_id="speaker-khoa"))
    engines = FileTrainingModelCatalog(SETTINGS.voice_changers_root, {"pro4bro": API_ROOT, "research": tmp_path / "research"})
    worker = FakeWorker()
    lease = GpuLease(tmp_path / "gpu.json")
    recordings = FileChangerRecordings(projects)
    changer = VoiceChanger(projects, runtime or ReadyRuntime(), engines, voices, recordings, lease, worker=worker, endpoints=lambda: ["CABLE Output (VB-Audio Virtual Cable)"])  # type: ignore[arg-type]
    return project, voice, worker, lease, recordings, changer


def test_only_the_flow_check_runs_until_a_converter_passes_the_gate(tmp_path):
    project, *_, changer = fixture(tmp_path)
    options = {option.id: option for option in changer.engines.options()}

    assert options["passthrough-check"].available
    assert not options["rvc-live"].available and not options["meanvc2-live"].available
    with pytest.raises(TrainingModelUnavailable):
        changer.start(project.id, VoiceChangerStartRequest(engine_id="rvc-live", input_device=0, virtual_device=5))


def test_preflight_lists_devices_and_finds_the_virtual_cable(tmp_path):
    *_, changer = fixture(tmp_path)

    found = changer.preflight()

    assert found.runtime_ready and [device.index for device in found.devices] == [0, 5]
    assert found.devices[1].virtual_cable and not found.devices[0].virtual_cable
    assert found.virtual_cable == "CABLE Input (VB-Audio Virtual Cable)"
    assert is_virtual_cable("Speakers (VB-Audio Virtual Cable)") and not is_virtual_cable("Speakers (USB2.0 Device)")


def test_a_missing_runtime_is_reported_before_any_device_is_opened(tmp_path):
    project, *_, changer = fixture(tmp_path, runtime=ReadyRuntime(missing=["sounddevice"]))

    preflight = changer.preflight()
    assert not preflight.runtime_ready and preflight.missing == ["sounddevice"]
    assert preflight.virtual_cable == "CABLE Output (VB-Audio Virtual Cable)"
    with pytest.raises(VoiceChangerError, match="sounddevice"):
        changer.start(project.id, VoiceChangerStartRequest(engine_id="passthrough-check", input_device=0, virtual_device=5))


def test_a_session_runs_to_the_virtual_mic_and_records_two_aligned_channels(tmp_path):
    project, voice, worker, lease, recordings, changer = fixture(tmp_path)

    status = changer.start(project.id, VoiceChangerStartRequest(engine_id="passthrough-check", voice_id=voice.id, input_device=0, virtual_device=5, speaker_device=1, parameters={"block_ms": 20}))

    start = next(request for request in worker.requests if request["command"] == "start")
    assert [(output["role"], output["device"]) for output in start["outputs"]] == [("virtual", 5)]  # the speaker stays silent until monitoring is asked for
    assert start["parameters"]["block_ms"] == 20 and start["target"]["referenceAudio"].endswith("reference.wav")
    assert status.state == "running" and status.voice_id == voice.id and status.underruns == 2
    assert lease.holder() is None  # the flow check needs no GPU

    changer.record_start(project.id)
    recording = changer.record_stop(project.id)

    assert recording.channels == 2 and recording.duration == 1.0 and recording.delay_ms == 40.0 and recording.refined_delay_ms == 3.0
    assert recording.voice_name == "Khoa · nhái giọng" and recording.audio_path == f"assets/voice-changer/{recording.id}/recording.wav"
    assert recordings.list(project.id) == [recording]

    changer.record_start(project.id)
    _status, saved = changer.stop()
    assert saved is not None and len(recordings.list(project.id)) == 2
    assert changer.status().state == "idle"


def test_a_device_the_worker_cannot_open_is_an_error_and_holds_nothing(tmp_path):
    project, _voice, _worker, lease, _recordings, changer = fixture(tmp_path)

    with pytest.raises(VoiceChangerError, match="Invalid device"):
        changer.start(project.id, VoiceChangerStartRequest(engine_id="passthrough-check", input_device=99, virtual_device=5))
    with pytest.raises(ValueError, match="ít nhất một đầu ra"):
        changer.start(project.id, VoiceChangerStartRequest(engine_id="passthrough-check", input_device=0))
    assert changer.status().state == "idle" and lease.holder() is None


def test_recording_requires_a_running_session_of_the_same_project(tmp_path):
    project, *_rest, changer = fixture(tmp_path)

    with pytest.raises(VoiceChangerError, match="chưa chạy"):
        changer.record_start(project.id)
    changer.start(project.id, VoiceChangerStartRequest(engine_id="passthrough-check", input_device=0, virtual_device=5))
    with pytest.raises(VoiceChangerError, match="project khác"):
        changer.record_start("another-project")


def test_the_worker_scripts_share_the_reply_prefix():
    from app.adapters.engine_worker import REPLY_PREFIX
    from app.workers import voice_changer_worker

    assert voice_changer_worker.REPLY_PREFIX == REPLY_PREFIX


def test_a_converter_only_wears_the_voice_of_a_profile_whose_owner_agreed(tmp_path, monkeypatch):
    from app.adapters.file_training_catalog import FileTrainingCatalog
    from app.domain.models import SpeakerProfile, TrainingCatalog, VoiceConsent
    from app.adapters.voice_changer import VoiceConsentRequired

    project, voice, worker, _lease, _recordings, changer = fixture(tmp_path)
    catalogs = FileTrainingCatalog(changer.projects)
    catalogs.save(project.id, TrainingCatalog(speakers=[SpeakerProfile(id="speaker-khoa", name="Khoa")]))
    changer.catalogs = catalogs
    option = changer.engines.get("passthrough-check")
    monkeypatch.setattr(changer.engines, "get", lambda _id: option.model_copy(update={"engine": "meanvc2"}))
    monkeypatch.setattr(changer.gpu_lease, "acquire", lambda label: type("Holder", (), {"token": "t"})())
    monkeypatch.setattr(changer.gpu_lease, "release", lambda token: True)
    request = VoiceChangerStartRequest(engine_id="passthrough-check", voice_id=voice.id, input_device=0, virtual_device=5)

    with pytest.raises(ValueError, match="Chọn giọng giả"):
        changer.start(project.id, request.model_copy(update={"voice_id": None}))
    with pytest.raises(VoiceConsentRequired, match="chưa có xác nhận đồng ý"):
        changer.start(project.id, request)
    assert not any(item["command"] == "start" for item in worker.requests)

    catalogs.save(project.id, TrainingCatalog(speakers=[SpeakerProfile(id="speaker-khoa", name="Khoa", voice_consent=VoiceConsent(granted_by="Khoa Trịnh", note="Tin nhắn 15/09"))]))
    assert changer.start(project.id, request).state == "running"


def test_the_rvc_engine_only_takes_a_trained_rvc_voice(tmp_path, monkeypatch):
    project, voice, worker, _lease, _recordings, changer = fixture(tmp_path)
    option = changer.engines.get("passthrough-check")
    monkeypatch.setattr(changer.engines, "get", lambda _id: option.model_copy(update={"engine": "rvc"}))
    monkeypatch.setattr(changer, "_require_consent", lambda *_args: None)
    monkeypatch.setattr(changer.gpu_lease, "acquire", lambda label: type("Holder", (), {"token": "t"})())
    monkeypatch.setattr(changer.gpu_lease, "release", lambda token: True)
    request = VoiceChangerStartRequest(engine_id="passthrough-check", voice_id=voice.id, input_device=0, virtual_device=5)

    with pytest.raises(ValueError, match="không phải model RVC"):
        changer.start(project.id, request)

    record = Path(changer.voices.root(project.id)) / voice.id / "voice.json"
    trained = voice.model_copy(update={"engine": "rvc", "kind": "vc", "model_path": "jobs/training/run-1/rvc/an.pth", "adapter_path": "jobs/training/run-1/rvc/an.index"})
    record.write_text(trained.model_dump_json(by_alias=True), encoding="utf-8")
    changer.start(project.id, request)

    start = next(item for item in worker.requests if item["command"] == "start")
    assert start["engine"] == "rvc" and start["target"]["model"].endswith("an.pth") and start["target"]["index"].endswith("an.index")


def test_the_wasapi_cable_is_preferred_over_the_sixteen_channel_one():
    from app.adapters.voice_changer import preferred_cable
    from app.domain.models import AudioDeviceInfo

    devices = [
        AudioDeviceInfo(index=9, name="CABLE In 16 Ch (VB-Audio Virtua", host_api="MME", max_output_channels=16, virtual_cable=True),
        AudioDeviceInfo(index=29, name="CABLE In 16 Ch (VB-Audio Virtual Cable)", host_api="Windows WASAPI", max_output_channels=2, virtual_cable=True),
        AudioDeviceInfo(index=30, name="Speakers (VB-Audio Virtual Cable)", host_api="Windows WASAPI", max_output_channels=2, virtual_cable=True),
    ]
    assert preferred_cable(devices).index == 30


def test_gpu_busy_is_refused_for_an_engine_that_needs_the_card(tmp_path, monkeypatch):
    project, _voice, _worker, lease, _recordings, changer = fixture(tmp_path)
    option = changer.engines.get("passthrough-check")
    monkeypatch.setattr(changer.engines, "get", lambda _id: option.model_copy(update={"engine": "meanvc2"}))
    monkeypatch.setattr(changer, "_require_consent", lambda *_args: None)
    holder = lease.acquire("training:run-1")

    with pytest.raises(GpuBusy):
        changer.start(project.id, VoiceChangerStartRequest(engine_id="passthrough-check", voice_id=_voice.id, input_device=0, virtual_device=5))
    lease.release(holder.token)
