from pathlib import Path


def load(request):
    import json
    import torch
    from tools.server.model_manager import ModelManager

    folder = Path(request["model"])
    config = json.loads((folder / "config.json").read_text(encoding="utf-8"))
    # Reject the newer incompatible Drama3 backbone at this S2 seam.
    if config.get("model_type") != "fish_qwen3_omni":
        raise ValueError("Checkpoint không phải Fish S2 Pro fish_qwen3_omni.")
    return ModelManager(mode="tts", device="cuda" if torch.cuda.is_available() else "cpu",
                        half=False, compile=False,
                        llama_checkpoint_path=str(folder), decoder_checkpoint_path=str(folder / "codec.pth"),
                        decoder_config_name="modded_dac_vq").tts_inference_engine


def generate(model, request):
    from fish_speech.utils.schema import ServeReferenceAudio, ServeTTSRequest

    prompt = ServeReferenceAudio(audio=Path(request["ref_audio"]).read_bytes(), text=request["ref_text"])
    req = ServeTTSRequest(text=request["text"], references=[prompt], streaming=False,
                          format="wav", use_memory_cache="off", **request["options"])
    final = None
    for result in model.inference(req):
        if result.code == "error":
            raise RuntimeError(str(result.error))
        if result.code == "final":
            final = result.audio
    if final is None:
        raise RuntimeError("Fish S2 Pro không trả audio cuối.")
    rate, audio = final
    return audio, int(rate)
