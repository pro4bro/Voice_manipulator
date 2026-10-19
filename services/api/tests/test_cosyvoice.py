from pathlib import Path
from types import SimpleNamespace
import hashlib
import json

import pytest

from app.adapters.cosyvoice import CosyVoicePaths, CosyVoiceSpeech
from app.adapters.omnivoice_generator import SpeechRequest
from app.domain.models import ProjectVoice


def write_model_files(paths):
    for relative in paths.required_files:
        target = paths.model / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"fixture model contents")


def write_model_receipt(paths, *, model_id="FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
                        revision="29e01c4e8d000f4bcd70751be16fa94bf3d85a18"):
    files = []
    for relative in paths.required_files:
        target = paths.model / relative
        stat = target.stat()
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        files.append({"path": relative, "hash": "sha256:" + digest,
                      "size": stat.st_size, "mtimeNs": stat.st_mtime_ns})
    path = paths.model / ".pro4bro-model-receipt.json"
    path.write_text(json.dumps({"schemaVersion": 1, "modelId": model_id,
                                "revision": revision, "files": files}), encoding="utf-8")
    return path


def speech_request(tmp_path, **changes):
    voice = ProjectVoice(name="Reference", speaker_profile_id="speaker", engine="cosyvoice3", kind="clone",
                         reference_audio="reference.wav", reference_text="Hello there.", reference_seconds=5,
                         base_model="FunAudioLLM/Fun-CosyVoice3-0.5B-2512")
    values = dict(voice=voice, reference=tmp_path / "reference.wav", adapter=None, model_dir=None,
                  text="A new sentence.", generation={"mode": "zero-shot"}, language="en", speed=1.1,
                  duration=None, output=tmp_path / "output.wav")
    return SpeechRequest(**{**values, **changes})


def test_cosyvoice_payload_uses_private_model_and_keeps_reference_text(tmp_path):
    paths = CosyVoicePaths(tmp_path / "CosyVoice", tmp_path / "python")
    speech = CosyVoiceSpeech(SimpleNamespace(), paths)
    payload = speech.payload(speech_request(tmp_path))
    assert payload["model"] == str(paths.model)
    assert payload["ref_text"] == "Hello there."
    assert payload["mode"] == "zero-shot"
    assert payload["speed"] == 1.1
    assert payload["language"] == "en"


@pytest.mark.parametrize("changes, reason", [
    ({"duration": 5}, "duration"),
    ({"language": "vi"}, "vi"),
    ({"adapter": Path("adapter")}, "LoRA"),
])
def test_cosyvoice_rejects_unsupported_requests_before_inference(tmp_path, changes, reason):
    speech = CosyVoiceSpeech(SimpleNamespace(), CosyVoicePaths(tmp_path, tmp_path / "runtime"))
    with pytest.raises(ValueError, match=reason):
        speech.payload(speech_request(tmp_path, **changes))


@pytest.mark.parametrize("changes, reason", [
    ({"voice": ProjectVoice(name="Reference", speaker_profile_id="speaker", engine="cosyvoice3", kind="clone",
                             reference_audio="reference.wav", reference_text="Hello there.", reference_seconds=5,
                             base_model="another/model")}, "base model"),
    ({"generation": {"mode": "cross-lingual", "instruction": "Speak softly"}}, "chỉ dùng trong"),
])
def test_cosyvoice_rejects_wrong_model_and_ignored_instruction(tmp_path, changes, reason):
    speech = CosyVoiceSpeech(SimpleNamespace(), CosyVoicePaths(tmp_path, tmp_path / "runtime"))
    with pytest.raises(ValueError, match=reason):
        speech.payload(speech_request(tmp_path, **changes))


def test_cosyvoice_readiness_needs_all_weights_and_runtime(tmp_path):
    paths = CosyVoicePaths(tmp_path / "repo", tmp_path / "runtime")
    assert paths.unavailable_reason() is not None
    write_model_files(paths)
    write_model_receipt(paths)
    entry = paths.repo / "cosyvoice/cli/cosyvoice.py"
    entry.parent.mkdir(parents=True, exist_ok=True)
    entry.write_text("")
    assert "Python" in paths.unavailable_reason()
    (paths.model / "llm.pt").write_bytes(b"")
    assert "llm.pt" in paths.unavailable_reason()


def test_project_generation_dispatches_cosyvoice_and_retains_engine_provenance(tmp_path):
    import wave
    from app.adapters.file_project_repository import FileProjectRepository
    from app.adapters.file_project_voices import FileProjectVoices
    from app.adapters.file_voice_outputs import FileVoiceOutputs
    from app.adapters.gpu_lease import GpuLease
    from app.adapters.omnivoice_generator import VoiceGenerator
    from app.adapters.training_model_catalog import FileTrainingModelCatalog
    from app.domain.models import DatasetSegment, ProjectCreate, VoiceGenerateRequest
    from app.settings import Settings

    class CosyWorker:
        def request(self, payload):
            assert payload["mode"] == "cross-lingual"
            assert payload["language"] == "en"
            with wave.open(payload["output"], "wb") as output:
                output.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                output.writeframes(b"\x01\x00" * 24000)
            return {"ok": True, "seconds": 1}

    class WrongWorker:
        def request(self, payload):
            pytest.fail("CosyVoice choice must never run OmniVoice")

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="CosyVoice", location=str(tmp_path / "projects")))
    source = Path(project.project_path) / "source.wav"
    source.write_bytes(b"reference")
    voices = FileProjectVoices(projects, lambda src, dst, start, end: dst.write_bytes(src.read_bytes()))
    voice = voices.publish(project.id, name="Cosy clone", speaker_profile_id="speaker", kind="clone",
        reference=DatasetSegment(id="ref", asset_id="asset", audio_path="source.wav", start=0, end=5, text="Hello there."),
        language="vi", engine="cosyvoice3", base_model="FunAudioLLM/Fun-CosyVoice3-0.5B-2512")
    paths = CosyVoicePaths(tmp_path / "repo", tmp_path / "runtime")
    entry = paths.repo / "cosyvoice/cli/cosyvoice.py"
    entry.parent.mkdir(parents=True)
    entry.write_text("")
    for name in paths.required_files:
        target = paths.model / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"fixture model")
    write_model_receipt(paths)
    catalog = FileTrainingModelCatalog(Settings.from_env().voice_generators_root, {"cosyvoice": paths.repo})
    outputs = FileVoiceOutputs(projects)
    lease = GpuLease(tmp_path / "lease.json")
    released = []
    generator = VoiceGenerator(projects, voices, outputs, WrongWorker(), lease, catalog,
        engines={"cosyvoice3": CosyVoiceSpeech(CosyWorker(), paths)}, before_speech=released.append)
    output = generator.generate(project.id, voice.id,
        VoiceGenerateRequest(generator_id="cosyvoice3-generate", text="A new sentence."))
    assert output.engine == "cosyvoice3"
    assert output.generator_id == "cosyvoice3-generate"
    assert output.parameters["language"] == "en"
    assert output.duration == 1
    assert outputs.audio_path(project.id, output.id).is_file()
    assert released == ["cosyvoice3"]
    assert lease.holder() is None


def test_replacing_base_weights_invalidates_reused_takes(tmp_path):
    paths = CosyVoicePaths(tmp_path / "repo", tmp_path / "runtime")
    write_model_files(paths)
    write_model_receipt(paths)
    before = paths.model_identity()
    (paths.model / "llm.pt").write_bytes(b"replacement weights")
    write_model_receipt(paths)
    assert paths.model_identity() != before


@pytest.mark.parametrize("receipt_change, expected", [
    ("missing", "receipt"),
    ("wrong-model", "model/revision"),
    ("wrong-revision", "model/revision"),
    ("stale-stats", "đã thay đổi sau khi xác minh"),
])
def test_cosyvoice_readiness_requires_matching_verified_model_receipt(tmp_path, receipt_change, expected):
    paths = CosyVoicePaths(tmp_path / "repo", tmp_path / "runtime")
    write_model_files(paths)
    entry = paths.repo / "cosyvoice/cli/cosyvoice.py"
    entry.parent.mkdir(parents=True, exist_ok=True)
    entry.write_text("")
    if receipt_change != "missing":
        write_model_receipt(
            paths,
            model_id="wrong/model" if receipt_change == "wrong-model" else "FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
            revision="wrong" if receipt_change == "wrong-revision" else "29e01c4e8d000f4bcd70751be16fa94bf3d85a18",
        )
    if receipt_change == "stale-stats":
        (paths.model / "llm.pt").write_bytes(b"changed after receipt")
    assert expected in paths.unavailable_reason()
