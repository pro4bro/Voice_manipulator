"""CosyVoice3 worker; official inference API at QwenAudio/CosyVoice/example.py."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import time
import traceback

REPLY_PREFIX = "@@PRO4BRO@@"
LANGUAGES = {"zh": "Chinese", "en": "English", "ja": "Japanese", "ko": "Korean",
             "de": "German", "es": "Spanish", "fr": "French", "it": "Italian", "ru": "Russian"}


def main():
    replies = sys.stdout
    sys.stdout = sys.stderr
    repo = Path(os.environ["PRO4BRO_COSYVOICE_ROOT"])
    sys.path[:0] = [str(repo), str(repo / "third_party/Matcha-TTS")]
    import numpy as np
    import soundfile as sf
    import torch
    from cosyvoice.cli.cosyvoice import AutoModel

    def reply(payload):
        replies.write(REPLY_PREFIX + json.dumps(payload, ensure_ascii=False) + "\n")
        replies.flush()

    model, loaded_key = None, None
    reply({"ready": True})
    for raw in sys.stdin:
        request_id = None
        try:
            request = json.loads(raw)
            request_id = request.get("id")
            if request.get("command") == "shutdown":
                reply({"id": request_id, "ok": True})
                return
            began = time.perf_counter()
            key = (request["model"], request.get("artifact_revision"))
            if model is None or loaded_key != key:
                model = None
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                if not (Path(request["model"]) / "cosyvoice3.yaml").is_file():
                    raise ValueError("Missing local CosyVoice3 weights; inference cannot download models.")
                model = AutoModel(model_dir=request["model"], fp16=torch.cuda.is_available())
                loaded_key = key
            options = dict(stream=False, speed=float(request.get("speed", 1)), text_frontend=False)
            mode = request["mode"]
            prefix = "You are a helpful assistant."
            if mode == "zero-shot":
                chunks = model.inference_zero_shot(request["text"], prefix + "<|endofprompt|>" + request["ref_text"], request["ref_audio"], **options)
            elif mode == "cross-lingual":
                chunks = model.inference_cross_lingual(prefix + "<|endofprompt|>" + request["text"], request["ref_audio"], **options)
            elif mode == "instruct":
                instruction = request.get("instruction", "").strip()
                language = LANGUAGES[request["language"]]
                chunks = model.inference_instruct2(request["text"], f"{prefix} Please speak in {language}. {instruction}<|endofprompt|>", request["ref_audio"], **options)
            else:
                raise ValueError("Unsupported CosyVoice mode")
            with torch.inference_mode():
                samples = [chunk["tts_speech"].detach().float().cpu().reshape(-1).numpy() for chunk in chunks]
            audio = np.concatenate(samples) if samples else np.empty(0)
            if not audio.size or not np.isfinite(audio).all() or np.max(np.abs(audio)) == 0:
                raise ValueError("CosyVoice3 did not produce finite, non-silent audio.")
            # FLOAT preserves model peaks; the product's measured render/mix owns gain.
            sf.write(request["output"], audio, model.sample_rate, subtype="FLOAT")
            reply({"id": request_id, "ok": True, "output": request["output"],
                   "seconds": audio.size / model.sample_rate, "sampleRate": model.sample_rate,
                   "elapsed": time.perf_counter() - began})
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            reply({"id": request_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
