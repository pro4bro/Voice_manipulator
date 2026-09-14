"""Run Microsoft's `finetuning-asr/lora_finetune.py` on this machine, unmodified.

Executed with the VibeVoice checkout's Python. The upstream script hardcodes
two things this machine cannot satisfy: `flash_attention_2`, which has no
Windows build here, and the tokenizer's Hub id, which cannot load offline.
It also passes the model dtype under a name this transformers does not read.
Rather than edit someone else's checkout, these calls are wrapped before the
script's own `main()` runs; every flag on the command line reaches it as-is.

Environment:
  PRO4BRO_ASR_FINETUNE_DIR  folder holding lora_finetune.py
  PRO4BRO_ASR_TOKENIZER     local folder of the Qwen tokenizer
"""

from __future__ import annotations

import importlib.util
import os
import sys


def main() -> None:
    finetune_dir = os.environ["PRO4BRO_ASR_FINETUNE_DIR"]
    tokenizer = os.environ["PRO4BRO_ASR_TOKENIZER"]
    sys.path.insert(0, finetune_dir)

    import lora_finetune  # noqa: E402  (the upstream script, imported not copied)

    processor_class = lora_finetune.VibeVoiceASRProcessor
    original_processor = processor_class.from_pretrained.__func__

    def processor_from_pretrained(cls, path, **kwargs):
        kwargs["language_model_pretrained_name"] = tokenizer
        return original_processor(cls, path, **kwargs)

    processor_class.from_pretrained = classmethod(processor_from_pretrained)

    model_class = lora_finetune.VibeVoiceASRForConditionalGeneration
    original_model = model_class.from_pretrained.__func__
    has_flash = importlib.util.find_spec("flash_attn") is not None

    def model_from_pretrained(cls, path, *args, **kwargs):
        # The script passes `dtype=`, the name transformers adopted after 4.51;
        # 4.51 ignores it and loads float32, which fails at the first step when
        # bf16 speech features meet float32 text embeddings.
        if "dtype" in kwargs and "torch_dtype" not in kwargs:
            kwargs["torch_dtype"] = kwargs.pop("dtype")
        if kwargs.get("attn_implementation") == "flash_attention_2" and not has_flash:
            print("[pro4bro] flash_attn is not installed; using sdpa", flush=True)
            kwargs["attn_implementation"] = "sdpa"
        return original_model(cls, path, *args, **kwargs)

    model_class.from_pretrained = classmethod(model_from_pretrained)

    sys.argv = [os.path.join(finetune_dir, "lora_finetune.py"), *sys.argv[1:]]
    lora_finetune.main()


if __name__ == "__main__":
    main()
