"""Frozen STT context screen and an unreviewed OBS audio/reference packet.

Read-only sources; fresh private output; serial cached-model loopback requests.
Uses historical curated utterance labels, never ASR as reference text. Acoustic
word-boundary accuracy remains unmeasured without independently reviewed anchors.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
import time
from urllib.parse import urlparse
import wave

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api"))
from app.adapters.media_import_processor import MediaImportProcessor
from livelink_stt_19a_score import BUDGETS, score_tracks, text_score, timing_structure

RATE = 24000
OBS_ASSET = "asset-live-05d3d2248f2d"


def save(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def pcm(path: Path) -> bytes:
    with wave.open(str(path), "rb") as audio:
        if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) != (RATE, 1, 2):
            raise ValueError(f"Expected mono PCM16/24kHz: {path}")
        return audio.readframes(audio.getnframes())


def write_wav(path: Path, data: bytes) -> None:
    with wave.open(str(path), "wb") as audio:
        audio.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        audio.writeframes(data)


def interval_audit(words: list[dict], duration: float) -> dict:
    return {**timing_structure(words, duration), "overlaps": sum(
        first["end"] > second["start"] for first, second in zip(words, words[1:]))}


def inserted_silence_words(case: dict, words: list[dict], data: bytes) -> list[dict]:
    """Flag placement inside known inserted zero PCM, not lexical hallucination.

    Original utterance extents are not reviewed word anchors. Do not assign a
    word to an utterance or delete it merely because its ASR interval is wrong.
    """
    spans, previous = [], 0.0
    for turn in case["turns"]:
        spans.append((previous, turn["start"]))
        previous = turn["end"]
    spans.append((previous, case["duration"]))
    flags = []
    for index, word in enumerate(words):
        start, end = word["start"], word["end"]
        if not 0 <= start < end <= case["duration"]:
            continue
        if any(left <= start and end <= right for left, right in spans):
            samples = data[math.floor(start * RATE) * 2:math.ceil(end * RATE) * 2]
            if samples and not any(samples):
                flags.append({"index": index, "text": word["text"], "start": start,
                              "end": end, "sampleCount": len(samples) // 2})
    return flags


def analyze_existing(output: Path) -> None:
    protocol = json.loads((output / "protocol.json").read_text(encoding="utf-8"))
    report = {"timingAccuracyPassed": None, "obsGapTextAccuracy": None,
              "reason": "No reviewed OBS transcript or acoustic word anchors",
              "cases": []}
    published = {"full": [], "bounded": []}
    for case in protocol["cases"]:
        data = pcm(output / case["wav"])
        if sha(output / case["wav"]) != case["inputSha256"]:
            raise ValueError("Frozen input changed")
        for mode in ("full", "bounded"):
            result = json.loads((output / f"{mode}-{case['id']}.json").read_text(encoding="utf-8"))
            responses = []
            for index in range(result["requests"]):
                response = json.loads((output / f"{mode}-{case['id']}-request-{index:02d}.json").read_text(encoding="utf-8"))
                request_path = output / response["input"]
                if sha(request_path) != response["sha256"]:
                    raise ValueError("Retained request changed")
                if pcm(request_path) != data[round(response["sourceStart"] * RATE) * 2:round(response["sourceEnd"] * RATE) * 2]:
                    raise ValueError("Retained request no longer matches source PCM")
                responses.append(response)
            flags = inserted_silence_words(case, result["words"], data)
            report["cases"].append({"case": case["id"], "mode": mode,
                "intervalAudit": result["intervalAudit"], "wordsWhollyInInsertedZeroPcm": flags,
                "interpretation": "ASR interval placement candidates; no word deletion or fabricated acoustic anchors"})
            # Restore metadata from the real response, not the reduced scoring
            # record. The merge keeps the last response's processor provenance.
            response = responses[-1]
            item = {**response["item"], "text": result["text"],
                    "words": result["words"], "duration": case["duration"]}
            finalized = MediaImportProcessor._attach_timing_quality(item, case["duration"])
            canonical = MediaImportProcessor._write_and_read_stt_artifacts(
                output / "publication" / f"{mode}-{case['id']}", finalized)
            save(output / "publication" / f"{mode}-{case['id']}" / "canonical.json", canonical)
            final = {**result, "text": canonical["text"], "words": canonical["words"]}
            published[mode].append(final)
            report["cases"][-1]["publication"] = {
                "wordTimingQuality": canonical["word_timing_quality"],
                "untrustedWords": sum(word.get("timingTrusted") is False for word in canonical["words"]),
                "intervalAudit": interval_audit(canonical["words"], case["duration"]),
                "wordsWhollyInInsertedZeroPcm": inserted_silence_words(case, canonical["words"], data),
                "textChanged": canonical["text"] != result["text"],
                "wordCountChanged": len(canonical["words"]) != len(result["words"])}
    # Retain a short reference-owned clip of the nontrivial bounded timing flag.
    for row in report["cases"]:
        if row["mode"] == "bounded" and row["wordsWhollyInInsertedZeroPcm"]:
            case = next(case for case in protocol["cases"] if case["id"] == row["case"])
            for flag in row["wordsWhollyInInsertedZeroPcm"]:
                start = max(0.0, math.floor(flag["start"] - 2))
                end = min(case["duration"], math.ceil(flag["end"] + 3))
                filename = f"timing-review-{row['case']}-{flag['index']}.wav"
                write_wav(output / filename, pcm(output / case["wav"])[round(start * RATE) * 2:round(end * RATE) * 2])
                flag["reviewAudio"] = {"file": filename, "startSeconds": start, "endSeconds": end}
    save(output / "timing-placement.json", report)
    save(output / "publication-scores.json", {
        mode: {"speech": score_tracks([row for row in rows if row["track"] != "silence"], "detailed"),
               "silence": text_score("", next(row for row in rows if row["track"] == "silence")["text"])}
        for mode, rows in published.items()})
    before = json.loads((output / "source-hashes-before.json").read_text(encoding="utf-8"))
    if any(sha(Path(path)) != digest for path, digest in before.items()):
        raise ValueError("Read-only source no longer matches frozen hashes")
    print("Derived timing audit complete; source hashes unchanged", len(before), flush=True)


def prepare(output: Path) -> tuple[list[dict], dict[str, str]]:
    corpus = ROOT / ".scratch/livelink-stt-19a/run-2"
    manifest_path = corpus / "frozen-corpus.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    hashes = {str(manifest_path): sha(manifest_path)}
    cases = []
    for track in manifest["tracks"]:
        source = corpus / f"track-{track['track']}.wav"
        data = pcm(source)
        hashes[str(source)] = sha(source)
        for turn in track["turns"]:
            original = Path(turn["source"])
            if sha(original) != turn["sha256"]:
                raise ValueError("Curated original has changed")
            hashes[str(original)] = sha(original)
            start, end = round(turn["start"] * RATE), round(turn["end"] * RATE)
            if data[start * 2:end * 2] != pcm(original):
                raise ValueError("Derived corpus does not match original utterance PCM")
        target = output / f"speech-{track['track']}.wav"
        shutil.copy2(source, target)
        cases.append({"id": f"speech-{track['track']}", "wav": target.name,
                      "duration": len(data) / (RATE * 2), "reference": track["reference"],
                      "referenceProvenance": manifest["review"], "turns": track["turns"],
                      "inputSha256": sha(target)})
    silence = output / "silence-125s.wav"
    write_wav(silence, b"\0\0" * (RATE * 125))
    cases.append({"id": "silence", "wav": silence.name, "duration": 125.0,
                  "reference": "", "referenceProvenance": "Exact generated zero PCM",
                  "turns": [], "inputSha256": sha(silence)})

    owner = ROOT / "data/projects/test-obs-9"
    source = owner / f"assets/media/{OBS_ASSET}/analysis.wav"
    original_words = owner / f"assets/media/{OBS_ASSET}/words.json"
    recovered = ROOT / f".scratch/stt-gap-01/archive-production-replay/snapshot-copy/assets/media/{OBS_ASSET}/words.json"
    for path in (source, original_words, recovered, owner / "project.json"):
        hashes[str(path)] = sha(path)
    words = json.loads(recovered.read_text(encoding="utf-8"))
    start, end = 237.0, 272.0
    data = pcm(source)[round(start * RATE) * 2:round(end * RATE) * 2]
    write_wav(output / "obs9-03m57-04m32.wav", data)
    candidate = [w for w in words if w["start"] < 269.020 and w["end"] > 240.352]
    if len(candidate) != 77:
        raise ValueError("Retained candidate differs from the frozen 77-word gap")
    save(output / "obs9-review.json", {
        "sourceAudioSha256": sha(source), "candidateWordsSha256": sha(recovered),
        "audioFile": "obs9-03m57-04m32.wav", "audioStartSeconds": start,
        "audioEndSeconds": end, "reviewWindow": [240.352, 269.020],
        "hypothesis": candidate, "reviewedText": None, "reviewer": None,
        "reviewedWordAnchors": [], "status": "unreviewed-not-ground-truth"})
    rows = "\n".join(f"| {i+1} | {w['start']:.3f} | {w['end']:.3f} | {w['text'].replace('|', '/') } |"
                     for i, w in enumerate(candidate))
    (output / "OBS9-REVIEW.md").write_text(
        "# OBS9 — đối chiếu vùng thiếu STT\n\n"
        "Audio bắt đầu tại **03:57**, kết thúc **04:32** trên footage gốc.\n\n"
        f"![Nghe audio OBS9]({(output / 'obs9-03m57-04m32.wav').as_posix()})\n\n"
        "77 từ dưới đây là **kết quả máy chưa duyệt**, không phải lời chuẩn. "
        "Cần nghe vùng 04:00.352–04:29.020 và ghi lại lời đúng (kể cả từ lặp); "
        "chỉ đánh dấu IN/OUT khi đã nghe xác nhận. Không dùng timing của máy làm đáp án.\n\n"
        + " ".join(w["text"] for w in candidate)
        + "\n\n| # | IN gốc (s) | OUT gốc (s) | Từ máy nhận |\n|---|---:|---:|---|\n"
        + rows + "\n", encoding="utf-8")
    save(output / "protocol.json", {
        "frozenAtUtc": datetime.now(timezone.utc).isoformat(), "cases": cases,
        "model": "large-v3", "baseline": "one complete Studio request",
        "candidate": "current product 60s owned blocks with 2s source context",
        "textBudget": BUDGETS["detailed"], "pureSilenceInsertionsBudget": 0,
        "wordTimingP95BudgetSeconds": BUDGETS["wordBoundaryP95Seconds"],
        "reviewedWordAnchors": None, "performanceBudget": "not measured",
        "scope": "same cached model, decoder and PCM; serial requests; no live capture"})
    save(output / "source-hashes-before.json", hashes)
    return cases, hashes


async def run(output: Path, studio: str, cases: list[dict]) -> None:
    all_results = {"full": [], "bounded": []}
    for mode in ("full", "bounded"):
        for case in cases:
            path = output / case["wav"]
            source_pcm = pcm(path)
            importer = MediaImportProcessor(studio, None, str(ROOT / ".tools/ffmpeg/ffmpeg.exe"))
            upload = importer._upload_studio_audio
            plans = importer._stt_chunks(case["duration"]) if mode == "bounded" else []
            requests = []

            async def retain(audio_path, *args, **kwargs):
                index = len(requests)
                request_name = f"{mode}-{case['id']}-request-{index:02d}"
                destination = output / f"{request_name}.wav"
                shutil.copy2(audio_path, destination)
                begin, finish = ((plans[index].source_start, plans[index].source_end)
                                 if plans else (0.0, case["duration"]))
                if pcm(destination) != source_pcm[round(begin * RATE) * 2:round(finish * RATE) * 2]:
                    raise ValueError("Request PCM differs from its source interval")
                item, elapsed = await upload(audio_path, *args, **kwargs)
                record = {"input": destination.name, "sha256": sha(destination),
                          "sourceStart": begin, "sourceEnd": finish, "item": item,
                          "elapsedSeconds": elapsed}
                save(output / f"{request_name}.json", record)
                requests.append(record)
                return item, elapsed

            importer._upload_studio_audio = retain
            print(f"Starting {mode} {case['id']} {case['duration']:.3f}s", flush=True)
            started = time.monotonic()
            if mode == "full":
                item, elapsed = await importer._upload_studio_audio(path, "import", "", model="large-v3")
            else:
                item, elapsed = await importer._run_studio_import(path, "import", "", model="large-v3")
            result = {"track": case["id"], "reference": case["reference"],
                      "duration": case["duration"], "text": item.get("text", ""),
                      "words": item.get("words", []), "requests": len(requests),
                      "reportedElapsedSeconds": elapsed, "wallSeconds": time.monotonic() - started,
                      "intervalAudit": interval_audit(item.get("words", []), case["duration"])}
            all_results[mode].append(result)
            save(output / f"{mode}-{case['id']}.json", result)
            print(f"Finished {mode} {case['id']}: {len(result['words'])} words", flush=True)
    summary = {mode: {"speech": score_tracks([r for r in rows if r["track"] != "silence"], "detailed"),
                      "silence": text_score("", next(r for r in rows if r["track"] == "silence")["text"]),
                      "requestCount": sum(r["requests"] for r in rows)}
               for mode, rows in all_results.items()}
    save(output / "scores.json", summary)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--studio", default="http://127.0.0.1:18081")
    parser.add_argument("--analyze-existing", action="store_true", help="Audit retained results without inference")
    args = parser.parse_args()
    endpoint = urlparse(args.studio)
    if endpoint.scheme != "http" or endpoint.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("Private media requires loopback Studio")
    output = args.output.resolve()
    if not output.is_relative_to((ROOT / ".scratch/stt-gap-02").resolve()):
        raise ValueError("Output must be inside the owned STT-GAP-02 scratch area")
    if args.analyze_existing:
        analyze_existing(output)
        return
    if not any((ROOT / ".runtime/omnivoice-studio/models/models--Systran--faster-whisper-large-v3").rglob("model.bin")):
        raise ValueError("large-v3 must already be cached")
    output.mkdir(parents=True, exist_ok=False)
    cases, hashes = prepare(output)
    try:
        asyncio.run(run(output, args.studio, cases))
        analyze_existing(output)
    finally:
        after = {path: sha(Path(path)) for path in hashes}
        save(output / "source-hashes-after.json", after)
        if hashes != after:
            raise RuntimeError("Read-only source changed during screen")
        print(f"Source hashes unchanged: {len(hashes)}", flush=True)


if __name__ == "__main__":
    main()
