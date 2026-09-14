"""A long-lived VibeVoice-ASR process, run with the VibeVoice checkout's Python.

Executed by that interpreter, never imported by the API beyond this module's
stdlib-only top level. Same protocol as the OmniVoice worker: JSON requests on
stdin, prefixed JSON replies on stdout, everything else on stderr.

The model is about 17 GB in bf16, so it is loaded once, on the first request,
and the API stops the process when idle.
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
    from vibevoice.modular.modeling_vibevoice_asr import VibeVoiceASRForConditionalGeneration
    from vibevoice.processor.vibevoice_asr_processor import VibeVoiceASRProcessor

    device = "cuda" if torch.cuda.is_available() else "cpu"
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
            key = (request["model"], request["tokenizer"], request.get("lora_adapter"))
            loaded = False
            if model is None or key != loaded_key:
                model = None
                processor = VibeVoiceASRProcessor.from_pretrained(
                    request["model"], language_model_pretrained_name=request["tokenizer"]
                )
                model = VibeVoiceASRForConditionalGeneration.from_pretrained(
                    request["model"],
                    dtype=torch.bfloat16,
                    attn_implementation=request.get("attn_implementation") or "sdpa",
                    trust_remote_code=True,
                ).to(device)
                if request.get("lora_adapter"):
                    # An adapter trained in the project, applied on top of the base.
                    from peft import PeftModel

                    model = PeftModel.from_pretrained(model, request["lora_adapter"])
                model.eval()
                loaded_key = key
                loaded = True

            context = (request.get("context_info") or "").strip() or None
            inputs = processor(
                audio=[request["audio"]],
                sampling_rate=None,
                return_tensors="pt",
                padding=True,
                add_generation_prompt=True,
                context_info=context,
            )
            inputs = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in inputs.items()}
            generation = {
                "max_new_tokens": int(request.get("max_new_tokens") or 8192),
                "pad_token_id": processor.pad_id,
                "eos_token_id": processor.tokenizer.eos_token_id,
            }
            temperature = float(request.get("temperature") or 0.0)
            if temperature > 0:
                generation.update({"do_sample": True, "temperature": temperature, "top_p": float(request.get("top_p") or 1.0)})
            else:
                generation["do_sample"] = False
            num_beams = int(request.get("num_beams") or 1)
            if num_beams > 1:
                generation.update({"num_beams": num_beams, "do_sample": False})

            with torch.no_grad():
                output = model.generate(**inputs, **generation)
            generated = output[0, inputs["input_ids"].shape[1]:]
            eos = (generated == processor.tokenizer.eos_token_id).nonzero(as_tuple=True)[0]
            if len(eos) > 0:
                generated = generated[: eos[0] + 1]
            text = processor.decode(generated, skip_special_tokens=True)
            segments = processor.post_process_transcription(text)
            reply({
                "id": request_id,
                "ok": True,
                "rawText": text,
                "segments": segments,
                "elapsed": round(time.perf_counter() - started, 2),
                "loadedModel": loaded,
            })
        except Exception as exc:  # one bad file must not take the worker down
            traceback.print_exc(file=sys.stderr)
            reply({"id": request_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
