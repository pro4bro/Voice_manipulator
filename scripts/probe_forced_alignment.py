"""Measure whether forced alignment beats the DTW word timing already in place.

ADR-0007 rejected the Vietnamese WhisperX aligner, but nobody could re-run that
judgement, so it stood unchallenged while the runtime moved on underneath it.
This script exists so the decision can be re-tested whenever the models, the
aligner, or the recogniser change - rather than being re-litigated from memory.

It writes no product code and changes no project. It prints the three numbers the
decision turns on and, so the comparison is fair, the same numbers for the timing
the project ships today.

Run with the Studio runtime interpreter, optionally naming a candidate model:

  .runtime/omnivoice-studio/.venv/Scripts/python.exe scripts/probe_forced_alignment.py
  .runtime/omnivoice-studio/.venv/Scripts/python.exe scripts/probe_forced_alignment.py nguyenvulebinh/wav2vec2-base-vietnamese-250h

Measured 2026-08-30 on the 236 s conviction sample (mean phrase-onset error):

  DTW in the project                        107 ms   median  50 ms   p90  230 ms
  nguyenvulebinh/wav2vec2-base-vi-vlsp2020 1051 ms   median 251 ms   p90 2560 ms
  nguyenvulebinh/wav2vec2-base-vietnamese-250h
                                            188 ms   median  35 ms   p90  358 ms
  MahmoudAshraf/mms-300m-1130-forced-aligner
                                           1071 ms   median 349 ms   p90 3418 ms

The default WhisperX model for Vietnamese carries a `feature_transform` head that
`Wav2Vec2ForCTC` silently drops, which is why its confidence sits at 0.011. Use
the 250h checkpoint for any future attempt; the default is simply mis-loaded.
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("HF_HOME", str(ROOT / ".cache" / "huggingface"))
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(ROOT / ".cache" / "huggingface" / "hub"))
os.environ.setdefault("TORCH_HOME", str(ROOT / ".cache" / "torch"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

ASSET_DIR = ROOT / "data/projects/conviction/assets/media/asset-a29e7bedc07a"
AUDIO = ASSET_DIR / "analysis.wav"
WORDS = ASSET_DIR / "words.json"
SAMPLE_RATE = 16000


def load_current_words() -> list[dict]:
    if WORDS.is_file():
        return json.loads(WORDS.read_text(encoding="utf-8"))
    index = json.loads((ASSET_DIR.parent / "index.json").read_text(encoding="utf-8"))
    for asset in index:
        if asset.get("id") == ASSET_DIR.name:
            return asset.get("words") or []
    return []


def segments_from(words: list[dict]) -> list[dict]:
    """Rebuild the recogniser's segments so the aligner sees natural phrases."""
    segments: list[dict] = []
    for word in words:
        key = word.get("segmentIndex")
        if segments and segments[-1]["key"] == key:
            segments[-1]["parts"].append(word)
        else:
            segments.append({"key": key, "parts": [word]})
    return [
        {
            "text": " ".join(str(part["text"]) for part in segment["parts"]),
            "start": float(segment["parts"][0]["start"]),
            "end": float(segment["parts"][-1]["end"]),
        }
        for segment in segments
    ]


def acoustic_spans(audio) -> list[tuple[float, float]]:
    """Unpadded Silero speech spans: the reference edges to score against."""
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    spans = get_speech_timestamps(
        audio,
        VadOptions(min_speech_duration_ms=40, min_silence_duration_ms=120, speech_pad_ms=0),
        sampling_rate=SAMPLE_RATE,
    )
    merged: list[list[float]] = []
    for span in spans:
        start, end = span["start"] / SAMPLE_RATE, span["end"] / SAMPLE_RATE
        if merged and start - merged[-1][1] <= 0.24:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(span[0], span[1]) for span in merged]


def onset_error_ms(words: list[dict], spans: list[tuple[float, float]]) -> list[float]:
    """How far the phrase-opening word is from the moment speech actually starts.

    An earlier version took the nearest word start to each span, which flatters
    any timing with enough words in it - with 665 words and 31 spans something is
    always nearby, whether or not it is the right word. This instead finds the
    first word whose midpoint falls inside the span, which is the word that should
    open that phrase, and measures only that one.
    """
    errors: list[float] = []
    for span_start, span_end in spans:
        opener = next(
            (
                word
                for word in words
                if span_start <= (float(word["start"]) + float(word["end"])) / 2 <= span_end
            ),
            None,
        )
        if opener is not None:
            errors.append(abs(float(opener["start"]) - span_start) * 1000)
    return errors


def describe(label: str, errors: list[float]) -> None:
    if not errors:
        print(f"  {label:<26} khong do duoc")
        return
    ordered = sorted(errors)
    within = lambda limit: 100 * sum(e <= limit for e in errors) / len(errors)
    print(
        f"  {label:<26} trung binh {statistics.mean(errors):6.1f} ms"
        f"   median {statistics.median(errors):6.1f} ms"
        f"   p90 {ordered[int(len(ordered) * 0.9) - 1]:6.1f} ms"
        f"   <=80ms {within(80):5.1f}%"
    )


def main() -> int:
    if not AUDIO.is_file():
        print(f"Khong tim thay audio: {AUDIO}")
        return 1
    current = load_current_words()
    if not current:
        print("Asset chua co word timing de so sanh.")
        return 1

    import torch
    from faster_whisper.audio import decode_audio

    device = "cuda" if torch.cuda.is_available() else "cpu"
    audio = decode_audio(str(AUDIO), sampling_rate=SAMPLE_RATE)
    spans = acoustic_spans(audio)
    segments = segments_from(current)

    print(f"asset      {ASSET_DIR.name}")
    print(f"audio      {len(audio) / SAMPLE_RATE:.1f}s   device={device}")
    print(f"tu hien co {len(current)}   segment {len(segments)}   cum am hoc {len(spans)}")
    print(f"timingSource hien tai: {sorted({w.get('timingSource') for w in current})}")
    print()

    import whisperx

    # A checkpoint whose extra layers Wav2Vec2ForCTC silently drops cannot score
    # well, so surface that rather than leaving it in the transformers warning.
    candidate = sys.argv[1] if len(sys.argv) > 1 else None
    print(f"candidate  {candidate or 'mac dinh cua whisperx cho vi'}")
    started = time.perf_counter()
    try:
        model, metadata = whisperx.load_align_model(
            language_code="vi", device=device, model_name=candidate
        )
    except Exception as error:
        print(f"KHONG TAI DUOC ALIGNER: {type(error).__name__}: {error}")
        print("-> R5 truot o buoc nay. Thu phuong an hai (MMS-300M) truoc khi ket luan.")
        return 2
    load_seconds = time.perf_counter() - started
    print(f"aligner    {metadata.get('type')}  tai trong {load_seconds:.1f}s")

    started = time.perf_counter()
    result = whisperx.align(segments, model, metadata, audio, device, return_char_alignments=False)
    align_seconds = time.perf_counter() - started

    aligned = [
        word
        for segment in result["segments"]
        for word in segment.get("words", [])
        if word.get("start") is not None and word.get("end") is not None
    ]
    total = sum(len(segment.get("words", [])) for segment in result["segments"])
    scores = [float(word["score"]) for word in aligned if word.get("score") is not None]

    print(f"align      {align_seconds:.1f}s cho {len(audio) / SAMPLE_RATE:.0f}s audio")
    print()
    print("=== NGUONG R5 ===")
    coverage = 100 * len(aligned) / total if total else 0.0
    print(f"  tu align duoc          {len(aligned)}/{total}  = {coverage:5.1f}%   [nguong >= 98%]")
    if scores:
        confident = 100 * sum(s > 0.3 for s in scores) / len(scores)
        print(
            f"  confidence > 0.3       {confident:5.1f}%   [nguong >= 95%]"
            f"   (median {statistics.median(scores):.3f}, min {min(scores):.3f})"
        )
    else:
        print("  confidence             khong co diem so nao")
    print()
    print("=== SAI LECH ONSET so voi bien am hoc Silero ===")
    describe("DTW hien tai", onset_error_ms(current, spans))
    describe("forced alignment", onset_error_ms([{"start": w["start"], "end": w["end"]} for w in aligned], spans))
    print("  [nguong: forced alignment trung binh <= 80 ms]")

    # The aligner reports a per-word score. If the bad outliers are the low-scoring
    # words, keeping DTW for those and taking alignment only where it is confident
    # should beat both - that is the variant worth measuring before recommending.
    print()
    print("=== HYBRID: lay alignment khi confidence cao, giu DTW khi thap ===")
    for floor in (0.3, 0.5, 0.7, 0.9):
        hybrid = [
            {"start": word["start"], "end": word["end"]}
            if float(word.get("score") or 0) >= floor and index < len(current)
            else {"start": current[index]["start"], "end": current[index]["end"]}
            for index, word in enumerate(aligned)
        ]
        taken = sum(1 for word in aligned if float(word.get("score") or 0) >= floor)
        describe(f"floor {floor:.1f} ({100 * taken / len(aligned):4.1f}% tu)", onset_error_ms(hybrid, spans))

    print()
    print("=== 12 tu dau, DTW vs aligned ===")
    for index, word in enumerate(aligned[:12]):
        source = current[index] if index < len(current) else {}
        print(
            f"  {str(word.get('word'))[:14]:<14}"
            f" dtw {float(source.get('start', 0)):7.3f}"
            f" -> align {float(word['start']):7.3f}"
            f"  lech {(float(word['start']) - float(source.get('start', 0))) * 1000:+7.1f} ms"
            f"  score {float(word.get('score', 0)):.3f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
