"""Pinned Index API contract through a fake model, with actual audio decoding."""
import sys
from types import ModuleType

import numpy as np
import soundfile as sf

from app.workers import expressive_index


def test_index_worker_keeps_identity_emotion_language_duration_and_seed_separate(tmp_path, monkeypatch):
    seeds = []
    torch = ModuleType("torch")
    torch.manual_seed = seeds.append
    monkeypatch.setitem(sys.modules, "torch", torch)
    seen = {}

    class Model:
        def infer(self, spk_audio_prompt, text, output_path, lang, emo_audio_prompt=None,
                  emo_alpha=1., emo_vector=None, use_emo_text=False, emo_text=None,
                  use_random=False, duration_factor=1.):
            seen.update(speaker=spk_audio_prompt, emotion=emo_audio_prompt, language=lang,
                        vector=emo_vector, text_mode=use_emo_text, duration_factor=duration_factor)
            sf.write(output_path, np.full(2205, .1), 22050)

    audio, rate = expressive_index.generate(Model(), {
        "ref_audio": "speaker.wav", "text": "New words.", "language": "JA",
        "output": str(tmp_path / "index.wav"), "options": {"seed": 17, "emo_vector": [0, 0, .8, 0, 0, 0, 0, 0],
            "emo_alpha": .7, "duration_factor": 1.2, "use_random": False, "use_emo_text": False, "emo_text": None},
    })
    assert audio.shape == (2205,) and rate == 22050
    assert seeds == [17]
    assert seen == {"speaker": "speaker.wav", "emotion": None, "language": "JA",
                    "vector": [0, 0, .8, 0, 0, 0, 0, 0], "text_mode": False, "duration_factor": 1.2}


def test_index_loader_uses_exact_local_config_and_explicit_text_emotion_model(tmp_path, monkeypatch):
    seen = {}
    module = ModuleType("indextts.infer_v2_5")

    class Model:
        def __init__(self, cfg_path, model_dir, use_cuda_kernel, use_qwen_emo):
            seen.update(config=cfg_path, folder=model_dir, cuda_kernel=use_cuda_kernel, text_emotion=use_qwen_emo)

    module.IndexTTS2 = Model
    monkeypatch.setitem(sys.modules, "indextts.infer_v2_5", module)
    expressive_index.load({"model": str(tmp_path), "use_qwen_emo": True})
    assert seen == {"config": str(tmp_path / "config.yaml"), "folder": str(tmp_path),
                    "cuda_kernel": False, "text_emotion": True}
