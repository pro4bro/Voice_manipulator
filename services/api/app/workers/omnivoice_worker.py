"""A long-lived OmniVoice generation process, run with the engine's own Python.

This file is executed by the OmniVoice runtime interpreter, not imported by the
API: it may import `omnivoice` and `torch`, and must not import `app`. Loading
the model takes about a minute from disk while generating a sentence takes
seconds, so one process keeps the model and each voice's clone prompt warm and
answers requests one at a time.

Protocol: one JSON request per line on stdin; one reply per line on stdout,
prefixed with REPLY_PREFIX. Everything libraries print goes to stderr, so a
progress bar can never be mistaken for a reply.
"""

from __future__ import annotations

import json
import sys
import time
import traceback

REPLY_PREFIX = "@@PRO4BRO@@"

# Generation fields OmniVoice reads from **kwargs; anything else in a request's
# `generation` block is ignored rather than passed through blindly.
GENERATION_KEYS = {
    "num_step", "guidance_scale", "t_shift", "layer_penalty_factor",
    "position_temperature", "class_temperature", "denoise", "preprocess_prompt",
    "postprocess_output", "audio_chunk_duration", "audio_chunk_threshold",
    "pad_duration", "fade_duration",
}


def main() -> None:
    replies = sys.stdout
    sys.stdout = sys.stderr

    import soundfile as sf
    import torch
    from omnivoice import OmniVoice
    from omnivoice.utils.common import get_best_device

    device = get_best_device()
    model = None
    model_key: tuple[str, str | None] | None = None
    prompts: dict[tuple[str, str, bool], object] = {}

    def reply(payload: dict) -> None:
        replies.write(REPLY_PREFIX + json.dumps(payload, ensure_ascii=False) + "\n")
        replies.flush()

    reply({"ready": True, "device": str(device)})

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        request_id = None
        try:
            request = json.loads(raw)
            request_id = request.get("id")
            if request.get("command") == "shutdown":
                reply({"id": request_id, "ok": True})
                return
            started = time.perf_counter()
            key = (request["model"], request.get("lora_adapter"))
            loaded = False
            if model is None or key != model_key:
                # A LoRA adapter is merged into the weights in memory, so another
                # adapter needs a clean base model rather than a second merge.
                model = None
                prompts.clear()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                model = OmniVoice.from_pretrained(request["model"], device_map=device, dtype=torch.float16)
                if request.get("lora_adapter"):
                    from omnivoice.utils.lora import load_lora_adapter

                    model = load_lora_adapter(model, request["lora_adapter"])
                model_key = key
                loaded = True

            generation = {k: v for k, v in (request.get("generation") or {}).items() if k in GENERATION_KEYS}
            preprocess = bool(generation.get("preprocess_prompt", True))
            prompt_key = (request["ref_audio"], request["ref_text"], preprocess)
            prompt = prompts.get(prompt_key)
            if prompt is None:
                prompt = model.create_voice_clone_prompt(
                    ref_audio=request["ref_audio"], ref_text=request["ref_text"], preprocess_prompt=preprocess
                )
                prompts[prompt_key] = prompt

            audios = model.generate(
                text=request["text"],
                language=request.get("language") or None,
                voice_clone_prompt=prompt,
                duration=request.get("duration"),
                speed=request.get("speed"),
                **generation,
            )
            sf.write(request["output"], audios[0], model.sampling_rate)
            reply({
                "id": request_id,
                "ok": True,
                "output": request["output"],
                "seconds": round(len(audios[0]) / model.sampling_rate, 3),
                "elapsed": round(time.perf_counter() - started, 2),
                "loadedModel": loaded,
            })
        except Exception as exc:  # the worker must survive one bad request
            traceback.print_exc(file=sys.stderr)
            reply({"id": request_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
