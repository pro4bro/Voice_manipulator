"""One-session VibeVoice streaming ASR worker using the isolated runtime."""

from __future__ import annotations

import base64
import json
import sys
import time
import traceback
from pathlib import Path

REPLY_PREFIX = "@@PRO4BRO@@"
MAX_CHUNK_SECONDS = 1.0


def configure_engine_repo(repo: str) -> str:
    """Put the streaming checkout root on sys.path for its lowercase package."""
    checkout = str(Path(repo).resolve())
    package = Path(checkout) / "vibevoice" / "__init__.py"
    if not package.is_file():
        raise FileNotFoundError(f"VibeVoice streaming package is missing at {package}.")
    if checkout in sys.path:
        sys.path.remove(checkout)
    sys.path.insert(0, checkout)
    return checkout


def main() -> None:
    replies = sys.stdout
    sys.stdout = sys.stderr
    model = processor = session = None
    model_key = None
    sample_rate = chunk_samples = window_samples = 0

    def reply(payload: dict) -> None:
        replies.write(REPLY_PREFIX + json.dumps(payload, ensure_ascii=False) + "\n")
        replies.flush()

    reply({"ready": True})
    for raw in sys.stdin:
        try:
            request = json.loads(raw)
            request_id = request.get("id")
            command = request.get("command")
            if command == "shutdown":
                reply({"id": request_id, "ok": True})
                return
            if command == "begin":
                if session is not None:
                    raise ValueError("A streaming ASR session is already active.")
                repo = request["repo"]
                # Embedded Python can ignore PYTHONPATH; load the upstream checkout explicitly.
                configure_engine_repo(repo)
                import numpy as np
                import torch
                from vibevoice.modular.modeling_vibevoice_asr import VibeVoiceASRForConditionalGeneration
                from vibevoice.processor.vibevoice_asr_processor import VibeVoiceASRProcessor

                key = request["model"]
                if model is None or model_key != key:
                    processor = VibeVoiceASRProcessor.from_pretrained(key)
                    tokenizer = processor.tokenizer
                    if tokenizer.text_chunk_end_id is None:
                        raise ValueError("Checkpoint tokenizer has no <|text_chunk_end|> token.")
                    cfg_path = key + "/preprocessor_config.json"
                    with open(cfg_path, encoding="utf-8") as config_file:
                        cfg = json.load(config_file)
                    sample_rate = int(cfg["target_sample_rate"])
                    compression = int(cfg["speech_tok_compress_ratio"])
                    chunk_samples = int(cfg["chunk_frames"]) * compression
                    lookahead_samples = int(cfg["lookahead_frames"]) * compression
                    window_samples = chunk_samples + lookahead_samples
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                    model = VibeVoiceASRForConditionalGeneration.from_pretrained(
                        key,
                        torch_dtype=torch.bfloat16,
                        device_map=device,
                        attn_implementation="sdpa",
                    ).eval()
                    model_key = key
                session = {
                    "stream": model.init_streaming_state(processor.tokenizer, context_info=request.get("context") or None),
                    "buffer": np.zeros(0, dtype=np.float32),
                    "text": "",
                    "chunks": 0,
                    "samples": 0,
                    "started": time.monotonic(),
                    "maxSeconds": float(request.get("maxSessionSeconds") or 3600),
                    "maxTextBytes": int(request.get("maxTranscriptBytes") or 2 * 1024 * 1024),
                }
                reply({"id": request_id, "ok": True, "sampleRate": sample_rate,
                       "chunkSeconds": chunk_samples / sample_rate})
                continue
            if command == "cancel":
                session = None
                reply({"id": request_id, "ok": True})
                continue
            if command not in {"chunk", "end"} or session is None:
                raise ValueError("No active streaming ASR session.")

            import numpy as np
            import torch

            if command == "chunk":
                if int(request.get("sampleRate") or 0) != sample_rate:
                    raise ValueError(f"PCM sample rate must be {sample_rate} Hz.")
                encoded = request.get("pcmBase64")
                if not isinstance(encoded, str):
                    raise ValueError("PCM chunk must be base64 encoded float32 data.")
                pcm_bytes = base64.b64decode(encoded, validate=True)
                if not pcm_bytes or len(pcm_bytes) % 4 or len(pcm_bytes) > sample_rate * int(MAX_CHUNK_SECONDS) * 4:
                    raise ValueError("PCM chunk must contain at most one second of float32 samples.")
                pcm = np.frombuffer(pcm_bytes, dtype="<f4").copy()
                if not np.isfinite(pcm).all() or np.max(np.abs(pcm), initial=0.0) > 1.0:
                    raise ValueError("PCM chunk contains non-finite or invalid samples.")
                session["samples"] += len(pcm)
                if session["samples"] / sample_rate > session["maxSeconds"]:
                    raise ValueError("Streaming ASR session exceeded its maximum duration.")
                session["buffer"] = np.concatenate((session["buffer"], pcm))
            elif session["buffer"].size == 0:
                reply({"id": request_id, "ok": True, "final": session["text"], "chunks": session["chunks"]})
                session = None
                continue

            while True:
                buffer = session["buffer"]
                flushing = command == "end"
                if buffer.size >= window_samples:
                    window = buffer[:window_samples]
                elif flushing and buffer.size:
                    window = np.zeros(window_samples, dtype=np.float32)
                    window[:buffer.size] = buffer
                else:
                    break
                audio = torch.from_numpy(window).to(next(model.parameters()).device)
                with torch.inference_mode():
                    features = model.encode_speech(audio.unsqueeze(0))
                    text, _ = model.streaming_generate_step(
                        audio_features=features,
                        streaming_state=session["stream"],
                        tokenizer=processor.tokenizer,
                        max_new_tokens=256,
                        temperature=0.0,
                    )
                session["text"] += text
                if len(session["text"].encode("utf-8")) > session["maxTextBytes"]:
                    raise ValueError("Streaming transcript exceeded its maximum size.")
                session["chunks"] += 1
                # Keep lookahead as the next window prefix; this bounds memory to a window + input.
                session["buffer"] = buffer[chunk_samples:]
                if flushing and session["buffer"].size == 0:
                    break

            if command == "end":
                reply({"id": request_id, "ok": True, "final": session["text"], "chunks": session["chunks"]})
                session = None
            else:
                reply({"id": request_id, "ok": True, "partial": session["text"], "chunks": session["chunks"]})
        except Exception as exc:  # A malformed frame ends only its caller's stream.
            traceback.print_exc(file=sys.stderr)
            reply({"id": locals().get("request_id"), "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
