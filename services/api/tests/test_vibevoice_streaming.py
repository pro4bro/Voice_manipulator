from __future__ import annotations

import base64
import json
import os
import subprocess
import struct
import threading
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.gpu_lease import GpuLease
from app.adapters.vibevoice_streaming import (
    VibeVoiceStreamingAsr,
    VibeVoiceStreamingError,
    make_vibevoice_streaming_router,
)


class FakeWorker:
    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.closed = False

    def request(self, payload: dict, cancellation_id: str | None = None) -> dict:
        self.requests.append(payload.copy())
        command = payload["command"]
        if command == "begin":
            return {"ok": True, "sampleRate": 24000, "chunkSeconds": 0.5}
        if command == "chunk":
            return {"ok": True, "partial": "hello", "chunks": 1}
        if command == "end":
            return {"ok": True, "final": "hello world", "chunks": 2}
        if command == "cancel":
            return {"ok": True}
        raise AssertionError(command)

    def cancel_request(self, _request_id: str) -> bool:
        self.closed = True
        return True

    def shutdown(self) -> None:
        self.closed = True


def streaming_tree(root: Path) -> Path:
    checkout = root / "VibeVoice-streaming"
    files = {
        "demo/vibevoice_asr_streaming_fastapi_demo.py": "# upstream demo",
        "vibevoice/__init__.py": "",
        "vibevoice/modular/modeling_vibevoice_asr.py": "# upstream",
        "vibevoice/processor/vibevoice_asr_processor.py": "# upstream",
        "VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B/config.json": '{"model_type":"vibevoice_asr"}',
        "VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B/preprocessor_config.json": json.dumps({
            "target_sample_rate": 24000,
            "speech_tok_compress_ratio": 640,
            "chunk_frames": 19,
            "lookahead_frames": 2,
        }),
        "VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B/tokenizer_config.json": '{"tokenizer_class":"Qwen2Tokenizer"}',
        "VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B/tokenizer.json": "{}",
        "VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B/added_tokens.json": "{}",
        "VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B/model.safetensors.index.json": json.dumps({
            "weight_map": {"a": "model-00001-of-00002.safetensors", "b": "model-00002-of-00002.safetensors"}
        }),
        "VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B/model-00001-of-00002.safetensors": "weights-1",
        "VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B/model-00002-of-00002.safetensors": "weights-2",
    }
    for relative, content in files.items():
        target = root / relative if relative.startswith("VibeVoice_models/") else checkout / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return root


def make_asr(tmp_path: Path, worker: FakeWorker | None = None):
    root = streaming_tree(tmp_path / "engines" / "vibevoice")
    python = tmp_path / "python.exe"
    python.write_bytes(b"python")
    lease = GpuLease(tmp_path / "gpu.json")
    asr = VibeVoiceStreamingAsr(root, python, lease, worker=worker or FakeWorker())
    return asr, lease


def test_readiness_requires_a_complete_streaming_checkpoint(tmp_path):
    asr, _ = make_asr(tmp_path)
    assert asr.status()["available"] is True
    assert asr.status()["sampleRate"] == 24000

    index = asr.model_dir / "model.safetensors.index.json"
    index.write_text(json.dumps({"weight_map": {"a": "model-00002-of-00002.safetensors"}}), encoding="utf-8")
    (asr.model_dir / "model-00002-of-00002.safetensors").unlink()
    assert "shard" in (asr.unavailable_reason() or "").lower()


def test_readiness_rejects_oversized_window_and_malformed_shard_map(tmp_path):
    asr, _ = make_asr(tmp_path)
    preprocessor = asr.model_dir / "preprocessor_config.json"
    config = json.loads(preprocessor.read_text(encoding="utf-8"))
    config["lookahead_frames"] = 1_000_000
    preprocessor.write_text(json.dumps(config), encoding="utf-8")
    assert "chunk settings" in (asr.unavailable_reason() or "")

    config["lookahead_frames"] = 2
    preprocessor.write_text(json.dumps(config), encoding="utf-8")
    (asr.model_dir / "model.safetensors.index.json").write_text(
        json.dumps({"weight_map": ["model-00001-of-00002.safetensors"]}), encoding="utf-8"
    )
    assert "index is invalid" in (asr.unavailable_reason() or "")


def test_stream_session_validates_pcm_owns_gpu_and_returns_partial_then_final(tmp_path):
    worker = FakeWorker()
    asr, lease = make_asr(tmp_path, worker)
    asr.begin("session-1", "name hint")
    assert lease.holder() is not None
    with pytest.raises(VibeVoiceStreamingError, match="sample rate"):
        asr.chunk("session-1", struct.pack("<f", 0.1), 16000)
    with pytest.raises(VibeVoiceStreamingError, match="one second"):
        asr.chunk("session-1", bytes(24000 * 4 + 4), 24000)
    with pytest.raises(VibeVoiceStreamingError, match="out-of-range"):
        asr.chunk("session-1", struct.pack("<f", 1.5), 24000)

    partial = asr.chunk("session-1", struct.pack("<2f", 0.1, -0.1), 24000)
    final = asr.end("session-1")

    assert partial == {"type": "partial", "text": "hello", "chunks": 1}
    assert final == {"type": "final", "text": "hello world", "chunks": 2}
    assert worker.requests[0]["context"] == "name hint"
    assert Path(worker.requests[0]["repo"]) == asr.checkout
    assert worker.requests[1]["pcmBase64"] == base64.b64encode(struct.pack("<2f", 0.1, -0.1)).decode("ascii")
    assert lease.holder() is None


def test_embedded_runtime_imports_streaming_package_from_the_correct_checkout():
    project = Path(__file__).resolve().parents[3]
    checkout = project / ".runtime" / "engines" / "vibevoice" / "VibeVoice-streaming"
    python = project / ".runtime" / "python" / "vibevoice-training" / "python.exe"
    module = checkout / "vibevoice" / "modular" / "modeling_vibevoice_asr.py"
    if not (checkout.is_dir() and python.is_file() and module.is_file()):
        pytest.skip("The local streaming checkout/runtime is not installed.")
    script = (
        "import sys; sys.path.insert(0, sys.argv[2]); "
        "from vibevoice_streaming_worker import configure_engine_repo; "
        "configure_engine_repo(sys.argv[1]); "
        "import vibevoice.modular.modeling_vibevoice_asr as module; "
        "print(module.__file__)"
    )
    env = os.environ.copy()
    env.update({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"})
    result = subprocess.run(
        [
            str(python), "-c", script, str(checkout),
            str(Path(__file__).resolve().parents[1] / "app" / "workers"),
        ],
        cwd=str(project), env=env, capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert Path(result.stdout.strip()).resolve() == module.resolve()


def test_one_active_session_and_cancel_release_gpu(tmp_path):
    asr, lease = make_asr(tmp_path)
    asr.begin("one")
    with pytest.raises(VibeVoiceStreamingError, match="already active"):
        asr.begin("two")
    asr.cancel("one")
    assert lease.holder() is None


def test_close_cancels_active_stream_and_releases_lease(tmp_path):
    worker = FakeWorker()
    asr, lease = make_asr(tmp_path, worker)
    asr.begin("close-me")

    asr.close()

    assert lease.holder() is None
    assert worker.closed is True


def test_cancel_can_interrupt_model_startup_without_waiting_on_service_lock(tmp_path):
    class BlockingWorker(FakeWorker):
        def __init__(self):
            super().__init__()
            self.entered = threading.Event()
            self.stopped = threading.Event()

        def request(self, payload, cancellation_id=None):
            if payload["command"] == "begin":
                self.entered.set()
                self.stopped.wait(timeout=5)
                raise RuntimeError("worker startup cancelled")
            return super().request(payload, cancellation_id)

        def cancel_request(self, _request_id):
            self.stopped.set()
            return True

    worker = BlockingWorker()
    asr, lease = make_asr(tmp_path, worker)
    errors = []

    def begin():
        try:
            asr.begin("startup")
        except Exception as exc:
            errors.append(str(exc))

    thread = threading.Thread(target=begin)
    thread.start()
    assert worker.entered.wait(timeout=2)
    assert asr.cancel("startup") is True
    thread.join(timeout=2)

    assert not thread.is_alive()
    assert errors and "cancelled" in errors[0]
    assert lease.holder() is None


def test_cancel_during_gpu_hook_keeps_lease_until_hook_exits(tmp_path):
    entered = threading.Event()
    finish_hook = threading.Event()
    root = streaming_tree(tmp_path / "engines" / "vibevoice")
    python = tmp_path / "python.exe"
    python.write_bytes(b"python")
    lease = GpuLease(tmp_path / "gpu.json")

    def before_gpu_work():
        entered.set()
        finish_hook.wait(timeout=5)

    asr = VibeVoiceStreamingAsr(root, python, lease, before_gpu_work=before_gpu_work)
    errors = []
    thread = threading.Thread(target=lambda: _capture_begin_error(asr, errors))
    thread.start()
    assert entered.wait(timeout=2)

    assert asr.cancel("hook") is True
    assert lease.holder() is not None
    finish_hook.set()
    thread.join(timeout=2)

    assert not thread.is_alive()
    assert errors and "cancelled" in errors[0]
    assert lease.holder() is None


def _capture_begin_error(asr, errors):
    try:
        asr.begin("hook")
    except Exception as exc:
        errors.append(str(exc))


def test_another_gpu_owner_blocks_stream_start(tmp_path):
    asr, lease = make_asr(tmp_path)
    owner = lease.acquire("training")
    with pytest.raises(VibeVoiceStreamingError, match="GPU"):
        asr.begin("blocked")
    assert lease.holder().token == owner.token
    lease.release(owner.token)


def test_free_gpu_hook_runs_only_after_this_service_owns_the_lease(tmp_path):
    observations = []
    worker = FakeWorker()
    root = streaming_tree(tmp_path / "engines" / "vibevoice")
    python = tmp_path / "python.exe"
    python.write_bytes(b"python")
    lease = GpuLease(tmp_path / "gpu.json")

    def before_gpu_work():
        observations.append(lease.holder() is not None)

    asr = VibeVoiceStreamingAsr(root, python, lease, worker=worker, before_gpu_work=before_gpu_work)
    asr.begin("ordered")
    asr.cancel("ordered")

    assert observations == [True]
    assert lease.holder() is None


def test_websocket_protocol_returns_json_updates_and_disconnect_releases_lease(tmp_path):
    asr, lease = make_asr(tmp_path)
    app = FastAPI()
    app.include_router(make_vibevoice_streaming_router(asr))

    with TestClient(app) as client:
        with client.websocket_connect("/api/stt/vibevoice-streaming") as socket:
            socket.send_json({"type": "start", "sampleRate": 24000, "context": "", "sessionId": "ws-1"})
            assert socket.receive_json()["type"] == "ready"
            socket.send_bytes(struct.pack("<2f", 0.0, 0.1))
            assert socket.receive_json()["type"] == "partial"
            socket.send_json({"type": "end"})
            assert socket.receive_json()["type"] == "final"
        assert lease.holder() is None


def test_websocket_protocol_failure_cancels_session_and_status_endpoint(tmp_path):
    worker = FakeWorker()
    asr, lease = make_asr(tmp_path, worker)
    app = FastAPI()
    app.include_router(make_vibevoice_streaming_router(asr))

    with TestClient(app) as client:
        assert client.get("/api/stt/vibevoice-streaming/status").json()["available"] is True
        with client.websocket_connect("/api/stt/vibevoice-streaming") as socket:
            socket.send_json({"type": "start", "sampleRate": 24000, "sessionId": "ws-2"})
            socket.receive_json()
            assert lease.holder() is not None
            socket.send_bytes(b"")
            assert socket.receive_json()["type"] == "error"
        assert asr.status()["sessionActive"] is False
        assert lease.holder() is None
