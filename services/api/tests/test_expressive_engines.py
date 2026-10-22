from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
import hashlib
import json
import subprocess
import sys

import pytest

from app.adapters.expressive_engines import ExpressivePaths, ExpressiveSpeech, SPECS
import app.adapters.expressive_engines as expressive_engines
from app.adapters.omnivoice_generator import SpeechRequest
from app.domain.models import ProjectVoice
from app.adapters.verified_model_component import verified_component


def request(tmp_path, engine, **changes):
    voice = ProjectVoice(name="Speaker", speaker_profile_id="speaker", kind="clone",
                         engine=engine, base_model=SPECS[engine].model_id,
                         reference_audio="reference.wav", reference_text="A reference sentence.",
                         reference_seconds=6, language="vi" if engine == "vivoice" else "en")
    return SpeechRequest(**{**dict(voice=voice, reference=tmp_path / "reference.wav", adapter=None,
                                   model_dir=None, text="New words.", generation={}, language=voice.language,
                                   speed=None, duration=None, output=tmp_path / "output.wav"), **changes})


def speech(tmp_path, engine):
    return ExpressiveSpeech(SimpleNamespace(), ExpressivePaths(tmp_path, tmp_path / "python", SPECS[engine]))


@pytest.mark.parametrize("engine", SPECS)
def test_payload_keeps_engine_specific_model_and_reference(tmp_path, engine):
    payload = speech(tmp_path, engine).payload(request(tmp_path, engine))
    assert payload["engine"] == engine
    assert payload["ref_text"] == "A reference sentence."
    assert payload["text"] == "New words."
    assert payload["model"] == str(tmp_path / SPECS[engine].model_folder)


@pytest.mark.parametrize("engine", SPECS)
@pytest.mark.parametrize("change", [{"duration": 3}, {"adapter": Path("weights")}, {"model_dir": Path("full")}])
def test_unsupported_duration_or_weights_refused(tmp_path, engine, change):
    with pytest.raises(ValueError):
        speech(tmp_path, engine).payload(request(tmp_path, engine, **change))


def test_index_emotion_vector_and_text_modes_are_distinct(tmp_path):
    engine = speech(tmp_path, "indextts25")
    payload = engine.payload(request(tmp_path, "indextts25", language="JA", generation={
        "emotion_mode": "vector", "emo_sad": .8, "emo_alpha": .7, "duration_factor": 1.2,
    }))
    assert payload["language"] == "JA"
    assert payload["options"]["emo_vector"] == [0, 0, .8, 0, 0, 0, 0, 0]
    assert payload["options"]["duration_factor"] == 1.2
    with pytest.raises(ValueError, match="Việt|vi"):
        engine.payload(request(tmp_path, "indextts25", language="vi"))
    with pytest.raises(ValueError, match="emo_text"):
        engine.payload(request(tmp_path, "indextts25", generation={"emo_text": "sad"}))
    text_payload = engine.payload(request(tmp_path, "indextts25", generation={"emotion_mode": "text", "emo_text": "sad"}))
    assert text_payload["options"]["use_emo_text"] is True
    assert text_payload["use_qwen_emo"] is True


def test_fish_instruction_and_native_controls_do_not_ignore_speed(tmp_path):
    engine = speech(tmp_path, "fish-s2-pro")
    payload = engine.payload(request(tmp_path, "fish-s2-pro", generation={"instruction": "sad and whispering", "seed": 3}))
    assert payload["text"] == "[sad and whispering] New words."
    assert payload["options"]["seed"] == 3
    with pytest.raises(ValueError, match="speed"):
        engine.payload(request(tmp_path, "fish-s2-pro", speed=1.2))


def test_reference_transcript_and_model_family_cannot_be_silently_replaced(tmp_path):
    original = request(tmp_path, "vivoice")
    for voice in (original.voice.model_copy(update={"reference_text": ""}),
                  original.voice.model_copy(update={"base_model": "SWivid/F5-TTS"})):
        with pytest.raises(ValueError):
            speech(tmp_path, "vivoice").payload(replace(original, voice=voice))


def test_unprovisioned_runtime_is_not_available(tmp_path):
    paths = ExpressivePaths(tmp_path, tmp_path / "python", SPECS["f5-tts"])
    assert paths.unavailable_reason() is not None


def _runtime_readiness_fixture(tmp_path, engine="f5-tts", *, receipt_content=None):
    spec = SPECS[engine]
    repo = tmp_path / ".runtime/engines/research" / spec.repo_name
    runtime = tmp_path / ".runtime/python" / spec.runtime_name
    entrypoint = repo / spec.entrypoint
    entrypoint.parent.mkdir(parents=True, exist_ok=True)
    entrypoint.touch()
    python = runtime / "python.exe"
    python.parent.mkdir(parents=True, exist_ok=True)
    python.touch()
    requirements_name = {
        "f5-tts": "requirements-expressive-f5.txt",
        "index-tts": "requirements-expressive-index.txt",
        "fish-speech": "requirements-expressive-fish.txt",
    }[spec.runtime_name]
    requirement_file = tmp_path / "scripts" / requirements_name
    requirement_file.parent.mkdir(parents=True, exist_ok=True)
    requirement_file.write_text("pinned==1\n", encoding="utf-8")
    if spec.runtime_name == "fish-speech":
        (tmp_path / "scripts" / "requirements-expressive-fish-overrides.txt").write_text(
            "protobuf>=3.20.0,<6.0.0\n", encoding="utf-8")
    paths = ExpressivePaths(repo, runtime, spec)
    receipt_path = runtime / ".pro4bro-expressive-runtime.json"
    if receipt_content is not None:
        receipt_path.write_text(receipt_content, encoding="utf-8")
    return paths, receipt_path, requirement_file


def _valid_runtime_receipt(engine, requirement_file, *, receipt_engine=None):
    spec = SPECS[engine]
    record = {
        "schema": 1,
        "runtime": spec.runtime_name,
        "engine": receipt_engine or engine,
        "sourceRevision": spec.revision,
        "sourcePathFromRuntime": "../../engines/research/" + spec.repo_name,
        "pythonVersion": "3.11.9",
        "requirementsSha256": hashlib.sha256(requirement_file.read_bytes()).hexdigest(),
    }
    if spec.runtime_name == "fish-speech":
        override = requirement_file.parent / "requirements-expressive-fish-overrides.txt"
        record["overrideSha256"] = hashlib.sha256(override.read_bytes()).hexdigest()
    return json.dumps(record)


@pytest.mark.parametrize("invalid_field", [None, "malformed", "empty", "schema", "runtime", "source", "source_path", "python", "requirements"])
def test_runtime_probe_waits_for_matching_ready_receipt(tmp_path, monkeypatch, invalid_field):
    paths, receipt_path, requirements = _runtime_readiness_fixture(tmp_path)
    monkeypatch.setattr(expressive_engines, "PRODUCT_ROOT", tmp_path)
    monkeypatch.setattr(ExpressivePaths, "model_identity", lambda _self: "model-fixture")
    if invalid_field is None:
        (paths.runtime / ".pro4bro-expressive-managed.json").write_text("{}", encoding="utf-8")
    else:
        if invalid_field == "malformed":
            receipt_path.write_text("{not-json", encoding="utf-8")
        elif invalid_field == "empty":
            receipt_path.write_text("{}", encoding="utf-8")
        else:
            data = json.loads(_valid_runtime_receipt("f5-tts", requirements))
            data[{
                "schema": "schema", "runtime": "runtime", "source": "sourceRevision",
                "source_path": "sourcePathFromRuntime", "python": "pythonVersion",
                "requirements": "requirementsSha256",
            }[invalid_field]] = "0" * 64 if invalid_field == "requirements" else "mismatch"
            receipt_path.write_text(json.dumps(data), encoding="utf-8")
    calls = []

    class Result:
        returncode = 0
        stdout = ""
        stderr = ""

    def run(args, **_kwargs):
        calls.append(args)
        if args[0] == "git":
            return ResultWithOutput(0, paths.spec.revision if args[-2:] == ["rev-parse", "HEAD"] else "")
        return Result()

    class ResultWithOutput:
        def __init__(self, returncode, stdout):
            self.returncode, self.stdout, self.stderr = returncode, stdout, ""

    monkeypatch.setattr(expressive_engines.subprocess, "run", run)
    reason = paths.unavailable_reason()
    assert reason is not None
    assert "runtime" in reason.lower() or "receipt" in reason.lower()
    assert not any(str(paths.python) == args[0] for args in calls)


def test_matching_ready_receipt_allows_import_probe_and_shared_f5_runtime(tmp_path, monkeypatch):
    paths, receipt_path, requirements = _runtime_readiness_fixture(tmp_path, "f5-tts")
    monkeypatch.setattr(expressive_engines, "PRODUCT_ROOT", tmp_path)
    monkeypatch.setattr(ExpressivePaths, "model_identity", lambda _self: "model-fixture")
    receipt_path.write_text(_valid_runtime_receipt("f5-tts", requirements, receipt_engine="vivoice"), encoding="utf-8")
    calls = []

    class Result:
        returncode = 0
        stdout = ""
        stderr = ""

    class ResultWithOutput(Result):
        pass

    def run(args, **_kwargs):
        calls.append(args)
        if args[0] == "git":
            result = ResultWithOutput()
            result.stdout = paths.spec.revision if args[-2:] == ["rev-parse", "HEAD"] else ""
            return result
        return Result()

    monkeypatch.setattr(expressive_engines.subprocess, "run", run)
    assert paths.unavailable_reason() is None
    assert any(args[0] == str(paths.python) and args[1] == str(expressive_engines.PROBE) for args in calls)


@pytest.mark.parametrize("override_state", ["missing", "changed", "malformed", "missing-file"])
def test_fish_runtime_probe_requires_current_override_hash(tmp_path, monkeypatch, override_state):
    paths, receipt_path, requirements = _runtime_readiness_fixture(tmp_path, "fish-s2-pro")
    monkeypatch.setattr(expressive_engines, "PRODUCT_ROOT", tmp_path)
    monkeypatch.setattr(ExpressivePaths, "model_identity", lambda _self: "model-fixture")
    record = json.loads(_valid_runtime_receipt("fish-s2-pro", requirements))
    override = tmp_path / "scripts/requirements-expressive-fish-overrides.txt"
    if override_state == "missing":
        record.pop("overrideSha256")
    elif override_state == "changed":
        override.write_text("protobuf>=4,<6\n", encoding="utf-8")
    elif override_state == "malformed":
        record["overrideSha256"] = ["not", "a", "hash"]
    elif override_state == "missing-file":
        override.unlink()
    receipt_path.write_text(json.dumps(record), encoding="utf-8")
    calls = []

    class Result:
        returncode = 0
        stdout = ""
        stderr = ""

    def run(args, **_kwargs):
        calls.append(args)
        result = Result()
        if args[0] == "git" and args[-2:] == ["rev-parse", "HEAD"]:
            result.stdout = paths.spec.revision
        return result

    monkeypatch.setattr(expressive_engines.subprocess, "run", run)
    assert paths.unavailable_reason() is not None
    assert not any(str(paths.python) == args[0] for args in calls)


def receipt(folder, *, model_id="demo", revision="a" * 40, name="weights.bin"):
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / name
    target.write_bytes(b"verified model fixture")
    stat = target.stat()
    content = {"schemaVersion": 1, "modelId": model_id, "revision": revision,
               "files": [{"path": name, "hash": "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest(),
                          "size": stat.st_size, "mtimeNs": stat.st_mtime_ns}]}
    (folder / ".pro4bro-model-receipt.json").write_text(json.dumps(content), encoding="utf-8")
    return content


def test_model_receipt_fences_wrong_pin_changed_file_and_escaped_paths(tmp_path):
    content = receipt(tmp_path)
    assert verified_component(tmp_path, "demo", "a" * 40, ("weights.bin",)) == content
    with pytest.raises(ValueError, match="revision"):
        verified_component(tmp_path, "demo", "b" * 40, ("weights.bin",))
    import os
    original_stat = (tmp_path / "weights.bin").stat()
    (tmp_path / "weights.bin").write_bytes(b"x" * original_stat.st_size)
    os.utime(tmp_path / "weights.bin", ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns))
    with pytest.raises(ValueError, match="hash"):
        verified_component(tmp_path, "demo", "a" * 40, ("weights.bin",), hash_contents=True)
    (tmp_path / "weights.bin").write_bytes(b"changed!")
    with pytest.raises(ValueError, match="thay đổi"):
        verified_component(tmp_path, "demo", "a" * 40, ("weights.bin",))
    content["files"][0]["path"] = "../owner.bin"
    (tmp_path / ".pro4bro-model-receipt.json").write_text(json.dumps(content), encoding="utf-8")
    with pytest.raises(ValueError, match="không hợp lệ"):
        verified_component(tmp_path, "demo", "a" * 40, ("weights.bin",))


def test_private_worker_produces_decodable_artifact_and_recovers_from_failed_model_load(tmp_path):
    """Real subprocess and WAV I/O with an explicit fake model, not acoustic evidence."""
    import os
    import soundfile as sf
    from app.adapters.expressive_engines import WORKER

    package = tmp_path / "src" / "f5_tts"
    package.mkdir(parents=True)
    (package / "__init__.py").write_text("", encoding="utf-8")
    (package / "api.py").write_text('''
import numpy as np
class F5TTS:
    def __init__(self, **kw):
        if kw['model'] == 'F5TTS_Base':
            raise RuntimeError('deliberate ViVoice load failure')
    def infer(self, **kw):
        assert kw['ref_text'] == 'A reference sentence.'
        assert kw['nfe_step'] == 24
        if kw['gen_text'] == 'silence':
            return np.zeros(2400), 24000, None
        return np.sin(np.arange(2400) * .1).astype('float32') * .1, 24000, None
''', encoding="utf-8")
    receipt(tmp_path)
    common = {"model": str(tmp_path), "ref_audio": "reference.wav", "ref_text": "A reference sentence.",
              "text": "New words.", "vocoder": str(tmp_path), "options": {"nfe_step": 24}, "engine": "f5-tts",
              "components": [{"folder": str(tmp_path), "model_id": "demo", "revision": "a" * 40, "required": ["weights.bin"]}]}
    requests = [dict(common, id="first", output=str(tmp_path / "first.wav")),
                dict(common, id="fail", engine="vivoice", output=str(tmp_path / "fail.wav")),
                dict(common, id="again", output=str(tmp_path / "again.wav")),
                dict(common, id="silence", text="silence", output=str(tmp_path / "silence.wav"))]
    result = subprocess.run([sys.executable, str(WORKER)],
        input="\n".join(json.dumps(item) for item in requests) + '\n{"command":"shutdown"}\n',
        env={**os.environ, "PRO4BRO_EXPRESSIVE_ROOT": str(tmp_path), "PYTHONIOENCODING": "utf-8"},
        capture_output=True, text=True, encoding="utf-8", timeout=45)
    assert result.returncode == 0, result.stderr
    replies = [json.loads(line.removeprefix("@@PRO4BRO@@")) for line in result.stdout.splitlines()]
    assert [reply.get("ok") for reply in replies[1:5]] == [True, False, True, False]
    audio, rate = sf.read(tmp_path / "again.wav")
    assert rate == 24000 and audio.shape == (2400,)
    assert not (tmp_path / "fail.wav").exists()
    assert not (tmp_path / "silence.wav").exists()


@pytest.mark.parametrize("engine", SPECS)
def test_project_generation_dispatch_keeps_engine_and_relative_provenance(tmp_path, engine):
    """Exercise product publication with a fake model worker and actual project/WAV files."""
    import wave
    from app.adapters.file_project_repository import FileProjectRepository
    from app.adapters.file_project_voices import FileProjectVoices
    from app.adapters.file_voice_outputs import FileVoiceOutputs
    from app.adapters.gpu_lease import GpuLease
    from app.adapters.omnivoice_generator import VoiceGenerator
    from app.adapters.training_model_catalog import FileTrainingModelCatalog
    from app.domain.models import DatasetSegment, ProjectCreate, VoiceGenerateRequest
    from app.settings import Settings

    class ModelWorker:
        def request(self, payload):
            assert payload["engine"] == engine
            assert payload["ref_text"] == "A reference sentence."
            import numpy as np
            import soundfile as sf

            rate = 22050 if engine == "indextts25" else 44100 if engine == "fish-s2-pro" else 24000
            sf.write(payload["output"], np.full(2400, .1, dtype=np.float32), rate, subtype="FLOAT")
            return {"ok": True, "seconds": .001, "sampleRate": rate}

    class WrongWorker:
        def request(self, payload):
            pytest.fail("An expressive choice must never silently call OmniVoice")

    paths = ExpressivePaths(tmp_path / "repo", tmp_path / "python", SPECS[engine])
    entry = paths.repo / paths.spec.entrypoint
    entry.parent.mkdir(parents=True)
    entry.write_text("", encoding="utf-8")
    for component in (paths.spec.component, *paths.spec.auxiliary):
        folder = paths.repo / component.folder
        folder.mkdir(parents=True, exist_ok=True)
        files = []
        for name in component.required:
            target = folder / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"model fixture")
            stat = target.stat()
            files.append({"path": name, "hash": "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest(),
                          "size": stat.st_size, "mtimeNs": stat.st_mtime_ns})
        (folder / ".pro4bro-model-receipt.json").write_text(json.dumps({"schemaVersion": 1,
            "modelId": component.model_id, "revision": component.revision, "files": files}), encoding="utf-8")
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Expressive", location=str(tmp_path / "projects")))
    (Path(project.project_path) / "source.wav").write_bytes(b"reference fixture")
    voices = FileProjectVoices(projects, lambda src, dst, start, end: dst.write_bytes(src.read_bytes()))
    voice = voices.publish(project.id, name="Clone", speaker_profile_id="speaker", kind="clone", engine=engine,
        base_model=paths.spec.model_id, language="vi" if engine == "vivoice" else "en",
        reference=DatasetSegment(id="reference", asset_id="asset", audio_path="source.wav", start=0, end=6,
                                 text="A reference sentence."))
    catalog = FileTrainingModelCatalog(Settings.from_env().voice_generators_root,
        {"f5-tts" if engine == "vivoice" else engine: paths.repo},
        readiness={engine: lambda descriptor: None})
    outputs = FileVoiceOutputs(projects)
    lease = GpuLease(tmp_path / "lease.json")
    generator = VoiceGenerator(projects, voices, outputs, WrongWorker(), lease, catalog,
        engines={engine: ExpressiveSpeech(ModelWorker(), paths)},
        ffmpeg_path=Path(__file__).resolve().parents[3] / ".tools" / "ffmpeg" / "ffmpeg.exe")
    output = generator.generate(project.id, voice.id, VoiceGenerateRequest(
        generator_id=f"{engine}-generate", text="New words."))
    assert output.engine == engine and output.generator_id == f"{engine}-generate"
    canonical = outputs.audio_path(project.id, output.id)
    with wave.open(str(canonical), "rb") as wav:
        assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (24000, 1, 2)
        assert output.duration == pytest.approx(wav.getnframes() / 24000)
    native = canonical.parent / "native-audio.wav"
    import soundfile as sf
    native_audio, native_rate = sf.read(native)
    assert native_rate == (22050 if engine == "indextts25" else 44100 if engine == "fish-s2-pro" else 24000)
    assert native_audio.mean() == pytest.approx(.1, abs=.001)
    provenance = json.loads((canonical.parent / "audio-provenance.json").read_text(encoding="utf-8"))
    assert provenance["engine"] == engine
    assert provenance["native"]["sample_rate"] == native_rate
    assert provenance["published"]["sample_rate"] == output.sample_rate == 24000
    assert provenance["native"]["sha256"] == hashlib.sha256(native.read_bytes()).hexdigest()
    assert provenance["workerReportedSeconds"] == .001
    assert output.duration != provenance["workerReportedSeconds"]
    assert lease.holder() is None
    assert not Path(voice.reference_audio).is_absolute()


def test_api_catalogs_include_all_choices_with_honest_readiness(tmp_path):
    from dataclasses import replace
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.settings import Settings

    settings = replace(Settings.from_env(), data_root=tmp_path / "registry",
                       research_engines_root=tmp_path / "empty-research", vibevoice_root=tmp_path / "vibe",
                       cosyvoice_root=tmp_path / "cosy", applio_root=tmp_path / "applio",
                       omnivoice_root=tmp_path / "omni", training_runtime_root=tmp_path / "python",
                       legacy_studio_url="http://127.0.0.1:1", model_hub_cache=tmp_path / "cache")
    with TestClient(create_app(settings=settings)) as client:
        models = client.get("/api/training-models").json()
        generators = client.get("/api/voice-generators").json()
    assert {item["engine"] for item in models} >= set(SPECS)
    assert {item["engine"] for item in generators} >= set(SPECS)
    assert all(not item["available"] for item in generators if item["engine"] in SPECS)
