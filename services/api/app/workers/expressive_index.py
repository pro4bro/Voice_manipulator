from pathlib import Path


def load(request):
    from indextts.infer_v2_5 import IndexTTS2

    folder = Path(request["model"])
    return IndexTTS2(cfg_path=str(folder / "config.yaml"), model_dir=str(folder),
                     use_cuda_kernel=False, use_qwen_emo=request["use_qwen_emo"])


def generate(model, request):
    import random
    import numpy as np
    import soundfile as sf
    import torch

    options = dict(request["options"])
    seed = options.pop("seed", 0)
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    model.infer(spk_audio_prompt=request["ref_audio"], text=request["text"], lang=request["language"],
                output_path=request["output"], **options)
    audio, rate = sf.read(request["output"], dtype="float32")
    return audio, int(rate)
