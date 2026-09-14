"""A long-lived VibeVoice TTS process, run with the VibeVoice checkout's Python
and the community fork first on its path.

Same protocol as the other workers. A request names the model folder, a
processor folder whose config points at the local tokenizer, the reference
clip, and optionally a fine-tuned adapter folder (a training output holding
`lora/`). Changing the model or the adapter reloads the model: adapters are
applied to the weights and cannot be taken off again.
"""

from __future__ import annotations

import json
import sys
import time
import traceback

REPLY_PREFIX = "@@PRO4BRO@@"


def main() -> None:
    replies = sys.stdout
    sys.stdout = sys.stderr

    import torch
    from vibevoice.modular.modeling_vibevoice_inference import VibeVoiceForConditionalGenerationInference
    from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device == "cuda" else torch.float32
    model = None
    processor = None
    loaded_key: tuple[str, str, str | None] | None = None

    def reply(payload: dict) -> None:
        replies.write(REPLY_PREFIX + json.dumps(payload, ensure_ascii=False) + "\n")
        replies.flush()

    reply({"ready": True, "device": device})

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
            key = (request["model"], request["processor"], request.get("lora_adapter"))
            loaded = False
            if model is None or key != loaded_key:
                model = None
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                processor = VibeVoiceProcessor.from_pretrained(request["processor"])
                model = VibeVoiceForConditionalGenerationInference.from_pretrained(
                    request["model"], torch_dtype=dtype, device_map=device, attn_implementation="sdpa"
                )
                if request.get("lora_adapter"):
                    from vibevoice.modular.lora_loading import load_lora_assets

                    load_lora_assets(model, request["lora_adapter"])
                model.eval()
                loaded_key = key
                loaded = True

            model.set_ddpm_inference_steps(num_steps=int(request.get("ddpm_steps") or 10))
            text = " ".join(str(request["text"]).split())
            inputs = processor(
                text=[f"Speaker 1: {text}"],
                voice_samples=[[request["ref_audio"]]] if request.get("ref_audio") else None,
                padding=True,
                return_tensors="pt",
                return_attention_mask=True,
            )
            for name, value in inputs.items():
                if torch.is_tensor(value):
                    inputs[name] = value.to(device)
            outputs = model.generate(
                **inputs,
                max_new_tokens=None,
                cfg_scale=float(request.get("cfg_scale") or 1.3),
                tokenizer=processor.tokenizer,
                generation_config={"do_sample": False},
                verbose=False,
                is_prefill=bool(request.get("ref_audio")),
            )
            speech = outputs.speech_outputs[0] if outputs.speech_outputs else None
            if speech is None:
                raise RuntimeError("VibeVoice không sinh ra audio.")
            processor.save_audio(speech, output_path=request["output"])
            samples = speech.shape[-1] if len(speech.shape) > 0 else len(speech)
            reply({
                "id": request_id,
                "ok": True,
                "output": request["output"],
                "seconds": round(samples / 24000, 3),
                "elapsed": round(time.perf_counter() - started, 2),
                "loadedModel": loaded,
            })
        except Exception as exc:  # the worker must survive one bad request
            traceback.print_exc(file=sys.stderr)
            reply({"id": request_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
