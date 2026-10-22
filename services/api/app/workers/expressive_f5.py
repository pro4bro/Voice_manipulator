"""F5 v1 and Vietnamese ViVoice have different architecture/vocabulary/checkpoints."""
from pathlib import Path


def load(request):
    from f5_tts.api import F5TTS

    folder = Path(request["model"])
    vietnamese = request["engine"] == "vivoice"
    return F5TTS(model="F5TTS_Base" if vietnamese else "F5TTS_v1_Base",
                 ckpt_file=str(folder / ("model_last.pt" if vietnamese else "F5TTS_v1_Base/model_1250000.safetensors")),
                 vocab_file=str(folder / ("config.json" if vietnamese else "F5TTS_v1_Base/vocab.txt")),
                 vocoder_local_path=request["vocoder"])


def generate(model, request):
    options = dict(request["options"])
    remove_silence = options.pop("remove_silence", False)
    audio, rate, _spectrogram = model.infer(ref_file=request["ref_audio"], ref_text=request["ref_text"],
                                           gen_text=request["text"], **options)
    if remove_silence:
        import soundfile as sf
        from f5_tts.infer.utils_infer import remove_silence_for_generated_wav

        sf.write(request["output"], audio, rate, subtype="FLOAT")
        remove_silence_for_generated_wav(request["output"])
        audio, rate = sf.read(request["output"], dtype="float32")
    return audio, int(rate)
