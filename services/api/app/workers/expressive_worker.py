"""Private JSON-lines worker. Loading/decoding is delegated to pinned engine APIs."""
from __future__ import annotations

import gc
import importlib
import json
import os
from pathlib import Path
import socket
import sys
import time
import traceback

HANDLERS = {"f5-tts": "expressive_f5", "vivoice": "expressive_f5",
            "indextts25": "expressive_index", "fish-s2-pro": "expressive_fish"}


def deny_network(*_args, **_kwargs):
    raise RuntimeError("Inference offline: hãy provision đầy đủ assets trước khi chạy.")


def configure(repo: Path) -> None:
    sys.path[:0] = [str(Path(__file__).parent), str(Path(__file__).resolve().parents[2]), str(repo / "src"), str(repo)]
    os.chdir(repo)
    # Upstream model helpers must fail, rather than downloading into an unverified cache.
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network


def main() -> None:
    replies = sys.stdout
    sys.stdout = sys.stderr
    configure(Path(os.environ["PRO4BRO_EXPRESSIVE_ROOT"]).resolve())
    import numpy as np
    import soundfile as sf
    from app.adapters.verified_model_component import verified_component

    def reply(value):
        replies.write("@@PRO4BRO@@" + json.dumps(value, ensure_ascii=False) + "\n")
        replies.flush()

    model, loaded_key = None, None
    reply({"ready": True})
    for line in sys.stdin:
        request_id, output = None, None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            if request.get("command") == "shutdown":
                reply({"id": request_id, "ok": True})
                return
            began = time.perf_counter()
            output = Path(request["output"])
            output.parent.mkdir(parents=True, exist_ok=True)
            output.unlink(missing_ok=True)
            handler = importlib.import_module(HANDLERS[request["engine"]])
            key = (request["engine"], request["model"], request.get("artifact_revision"), request.get("use_qwen_emo", False))
            if loaded_key != key:
                model = None
                loaded_key = None
                if not request.get("components"):
                    raise ValueError("Thiếu pinned model components.")
                for component in request["components"]:
                    verified_component(Path(component["folder"]), component["model_id"], component["revision"],
                                       tuple(component["required"]), hash_contents=True)
                gc.collect()
                torch = sys.modules.get("torch")
                if torch is not None and torch.cuda.is_available():
                    torch.cuda.empty_cache()
                model = handler.load(request)
                loaded_key = key
            audio, rate = handler.generate(model, request)
            audio = np.asarray(audio, dtype=np.float32)
            if (audio.ndim != 1 or not audio.size or not np.isfinite(audio).all()
                    or float(np.max(np.abs(audio))) <= 1e-8 or not isinstance(rate, int) or rate <= 0):
                raise ValueError("Engine không tạo được audio mono hữu hạn, khác silence.")
            # Retain actual peaks for the product's measured render stage.
            sf.write(output, audio, rate, subtype="FLOAT")
            decoded, checked_rate = sf.read(output, dtype="float32")
            if decoded.shape != audio.shape or checked_rate != rate or not np.isfinite(decoded).all():
                raise ValueError("Không đọc lại được artifact audio vừa tạo.")
            reply({"id": request_id, "ok": True, "output": str(output), "seconds": audio.size / rate,
                   "sampleRate": rate, "elapsed": time.perf_counter() - began})
        except Exception as exc:
            model, loaded_key = None, None
            if output is not None:
                output.unlink(missing_ok=True)
            traceback.print_exc(file=sys.stderr)
            reply({"id": request_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
