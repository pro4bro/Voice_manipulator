"""Isolated offline CTC alignment. Reads PCM; emits evidence, never edits Script."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import sys
import time
import unicodedata


def token(text):
    return "".join(c for c in unicodedata.normalize("NFC", text.casefold()) if unicodedata.category(c)[0] in "LN")


def main():
    input_path, output_path, project_root, model_path = map(Path, sys.argv[1:])
    if output_path.exists():
        raise FileExistsError("Alignment output already exists")
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    audio_path = (project_root / payload["audioPath"]).resolve()
    if not audio_path.is_relative_to(project_root.resolve()):
        raise ValueError("Audio escapes project")
    with audio_path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != payload["audioSha256"]:
            raise ValueError("Audio changed")
    import torch
    torch.set_num_threads(4)
    torch.set_num_interop_threads(2)
    from faster_whisper.audio import decode_audio
    import whisperx
    started = time.perf_counter()
    model, metadata = whisperx.load_align_model(language_code="vi", device="cpu",
                                               model_name=str(model_path), model_cache_only=True)
    audio = decode_audio(str(audio_path), sampling_rate=16000)
    duration = len(audio) / 16000
    words = payload["words"]
    output = [{"text": w["text"], "start": None, "end": None, "score": None} for w in words]
    selected = set(payload["indexes"] if payload["indexes"] is not None else range(len(words)))
    groups = []
    for i, word in enumerate(words):
        start, end = word.get("start"), word.get("end")
        if not all(isinstance(v, (float, int)) and math.isfinite(v) for v in (start, end)) or end <= start:
            continue
        if groups:
            first, previous = words[groups[-1][0]], words[groups[-1][-1]]
            if end - first["start"] <= 7 and start - previous["end"] <= .35:
                groups[-1].append(i)
                continue
        groups.append([i])
    diagnostics = []
    for indices in groups:
        if not selected.intersection(indices):
            continue
        segment = {"text": " ".join(words[i]["text"] for i in indices),
                   "start": max(0, min(words[i]["start"] for i in indices) - .5),
                   "end": min(duration, max(words[i]["end"] for i in indices) + .5)}
        if segment["end"] - segment["start"] > 9:
            diagnostics.append({"indices": indices, "status": "window-too-long"})
            continue
        result = whisperx.align([segment], model, metadata, audio, "cpu", interpolate_method="ignore", return_char_alignments=False)
        measured = [w for s in result["segments"] for w in s.get("words", [])]
        exact = [token(w.get("word", "")) for w in measured] == [token(words[i]["text"]) for i in indices]
        if exact:
            for i, row in zip(indices, measured):
                values = {k: row.get(k) for k in ("start", "end", "score")}
                output[i].update({k: float(v) if v is not None and math.isfinite(float(v)) else None for k, v in values.items()})
        diagnostics.append({"indices": indices, "start": segment["start"], "end": segment["end"],
                            "status": "mapped" if exact else "token-mismatch"})
    with (model_path / "pytorch_model.bin").open("rb") as stream:
        weights_sha = hashlib.file_digest(stream, "sha256").hexdigest()
    result = {"audioSha256": payload["audioSha256"], "words": output, "groups": diagnostics,
              "elapsedSeconds": time.perf_counter() - started, "weightsSha256": weights_sha,
              "versions": {name: importlib.metadata.version(name) for name in ("whisperx", "torch", "transformers")}}
    with output_path.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, allow_nan=False)


if __name__ == "__main__":
    main()
