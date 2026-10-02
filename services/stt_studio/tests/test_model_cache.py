from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from studio_app import server


@pytest.fixture
def fake_models(monkeypatch, tmp_path):
    calls: list[str] = []

    class FakeWhisperModel:
        def __init__(self, name, **kwargs):
            calls.append(name)
            self.name = name

    monkeypatch.setitem(sys.modules, "faster_whisper", SimpleNamespace(WhisperModel=FakeWhisperModel))
    monkeypatch.setattr(server, "_resolve_device", lambda: ("cuda", "float16"))
    monkeypatch.setattr(server, "_configure_windows_cuda_dlls", lambda: None)
    monkeypatch.setattr(server, "MODEL_ROOT", tmp_path)
    server.loaded_models.clear()
    server.loaded_model_names = ()
    server.loaded_model = None
    server.loaded_model_name = None
    server.loaded_device = None
    server.model_load_count = 0
    yield calls
    server.loaded_models.clear()
    server.loaded_model_names = ()
    server.loaded_model = None


def test_large_gpu_reuses_both_live_and_detailed_models(fake_models, monkeypatch):
    monkeypatch.setattr(server, "_model_cache_capacity", lambda device: 2)
    first_medium, _ = server._model("medium")
    first_large, _ = server._model("large-v3")
    second_medium, _ = server._model("medium")
    second_large, _ = server._model("large-v3")
    assert first_medium is second_medium
    assert first_large is second_large
    assert fake_models == ["medium", "large-v3"]
    assert server.status()["model_load_count"] == 2
    assert server.status()["loaded_models"] == ["medium", "large-v3"]


def test_second_model_requires_total_and_free_gpu_headroom(monkeypatch):
    memory = [(7 * 1024 ** 3, 24 * 1024 ** 3)]
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(
        mem_get_info=lambda index: memory[0])))
    assert server._model_cache_capacity("cuda") == 2
    memory[0] = (5 * 1024 ** 3, 24 * 1024 ** 3)
    assert server._model_cache_capacity("cuda") == 1
    memory[0] = (12 * 1024 ** 3, 12 * 1024 ** 3)
    assert server._model_cache_capacity("cuda") == 1
    assert server._model_cache_capacity("cpu") == 1


def test_small_gpu_keeps_only_one_model(fake_models, monkeypatch):
    monkeypatch.setattr(server, "_model_cache_capacity", lambda device: 1)
    for name in ("medium", "large-v3", "medium"):
        server._model(name)
    assert fake_models == ["medium", "large-v3", "medium"]
    assert server.status()["loaded_models"] == ["medium"]


def test_gpu_allocation_failure_evicts_cached_model_and_retries(fake_models, monkeypatch):
    monkeypatch.setattr(server, "_model_cache_capacity", lambda device: 2)
    original = sys.modules["faster_whisper"].WhisperModel

    def fail_with_cached_model(name, **kwargs):
        if name == "large-v3" and server.loaded_models:
            raise RuntimeError("CUDA out of memory")
        return original(name, **kwargs)

    monkeypatch.setitem(sys.modules, "faster_whisper", SimpleNamespace(WhisperModel=fail_with_cached_model))
    server._model("medium")
    large, _ = server._model("large-v3")
    assert large.name == "large-v3"
    assert fake_models == ["medium", "large-v3"]
    assert server.status()["loaded_models"] == ["large-v3"]
