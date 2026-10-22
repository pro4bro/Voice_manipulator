"""Fish S2 integration contract; these fake classes do not benchmark pretrained speech."""
import json
import sys
from types import ModuleType, SimpleNamespace

import numpy as np
import pytest

from app.workers import expressive_fish


def schema(monkeypatch):
    module = ModuleType("fish_speech.utils.schema")

    class Reference:
        def __init__(self, audio, text):
            self.audio, self.text = audio, text

    class Request:
        def __init__(self, text, references, streaming, format, use_memory_cache,
                     temperature=.7, top_p=.7, max_new_tokens=1024, chunk_length=200, seed=0):
            self.__dict__.update(locals())

    module.ServeReferenceAudio, module.ServeTTSRequest = Reference, Request
    monkeypatch.setitem(sys.modules, "fish_speech.utils.schema", module)


def test_fish_uses_local_reference_inline_control_and_exact_sampling_fields(tmp_path, monkeypatch):
    schema(monkeypatch)
    reference = tmp_path / "reference.wav"
    reference.write_bytes(b"reference audio fixture")

    class Model:
        def inference(self, req):
            assert req.text == "[sad and whispering] New words."
            assert req.references[0].audio == reference.read_bytes()
            assert req.references[0].text == "A reference sentence."
            assert req.temperature == .6 and req.top_p == .8 and req.chunk_length == 240
            assert req.seed == 19 and not req.streaming and req.use_memory_cache == "off"
            yield SimpleNamespace(code="final", audio=(44100, np.full(4410, .1)))

    audio, rate = expressive_fish.generate(Model(), {"ref_audio": str(reference),
        "ref_text": "A reference sentence.", "text": "[sad and whispering] New words.",
        "options": {"seed": 19, "temperature": .6, "top_p": .8, "chunk_length": 240, "max_new_tokens": 1024}})
    assert rate == 44100 and audio.shape == (4410,)


def test_fish_failure_after_partial_result_is_not_success(tmp_path, monkeypatch):
    schema(monkeypatch)
    reference = tmp_path / "reference.wav"
    reference.write_bytes(b"reference")

    class Model:
        def inference(self, req):
            yield SimpleNamespace(code="final", audio=(44100, np.full(4410, .1)))
            yield SimpleNamespace(code="error", error=RuntimeError("decoder failed"))

    with pytest.raises(RuntimeError, match="decoder failed"):
        expressive_fish.generate(Model(), {"ref_audio": str(reference), "ref_text": "reference", "text": "words", "options": {}})


def test_fish_load_refuses_drama3_and_uses_verified_s2_codec(tmp_path, monkeypatch):
    seen = {}
    module = ModuleType("tools.server.model_manager")

    class Manager:
        def __init__(self, mode, device, half, compile, llama_checkpoint_path, decoder_checkpoint_path, decoder_config_name):
            seen.update(mode=mode, device=device, model=llama_checkpoint_path,
                        codec=decoder_checkpoint_path, codec_config=decoder_config_name)
            self.tts_inference_engine = "engine fixture"

    module.ModelManager = Manager
    monkeypatch.setitem(sys.modules, "tools.server.model_manager", module)
    torch = ModuleType("torch")
    torch.cuda = SimpleNamespace(is_available=lambda: True)
    monkeypatch.setitem(sys.modules, "torch", torch)
    (tmp_path / "config.json").write_text(json.dumps({"model_type": "fish_omni"}), encoding="utf-8")
    with pytest.raises(ValueError, match="S2 Pro"):
        expressive_fish.load({"model": str(tmp_path)})
    assert not seen
    (tmp_path / "config.json").write_text(json.dumps({"model_type": "fish_qwen3_omni"}), encoding="utf-8")
    assert expressive_fish.load({"model": str(tmp_path)}) == "engine fixture"
    assert seen == {"mode": "tts", "device": "cuda", "model": str(tmp_path),
                    "codec": str(tmp_path / "codec.pth"), "codec_config": "modded_dac_vq"}
