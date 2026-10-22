"""Create a diagnostic-only partial mapping from a rejected raw MFA result.

This probe never changes product outputs or source timing. Word correspondence
comes only from the canonical unique lexical-pair helper; timings are not used
to match labels, and unknown/ambiguous rows remain null.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api"))
sys.path.insert(0, str(ROOT / "scripts/profiling"))

from app.workers.subtitle_mfa_worker import parse_mfa_json
from stt_reviewed_timing import lexical_pairs


UNKNOWN_LABELS = {"<unk>", "<unknown>"}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build_partial_probe(raw_data: object, seed_words: list[dict], raw_sha256: str,
                        *, model_identity: dict | None = None) -> dict:
    """Map uniquely matched known MFA labels to exact seed text rows.

    The returned list always has the same length/order/text as ``seed_words``.
    The `measuredIndex` is the index after the product parser has removed
    `<eps>` gap entries, matching the indices used by the rejected worker result.
    """
    if not isinstance(seed_words, list) or any(
            not isinstance(word, dict) or not isinstance(word.get("text"), str)
            or not word["text"].strip() for word in seed_words):
        raise ValueError("Seed words must be a non-empty-text word list")
    if not isinstance(raw_sha256, str) or not raw_sha256.strip():
        raise ValueError("Raw MFA SHA-256 is required")
    intervals = parse_mfa_json(raw_data)
    labels = [label for _, _, label in intervals]
    pairs = lexical_pairs(labels, [word["text"] for word in seed_words])
    words = [{"text": word["text"], "start": None, "end": None, "score": None}
             for word in seed_words]
    accepted = []
    unknown_indexes = []
    for measured_index, seed_index in pairs:
        start, end, label = intervals[measured_index]
        if label.strip().casefold() in UNKNOWN_LABELS:
            unknown_indexes.append(measured_index)
            continue
        words[seed_index].update(start=start, end=end)
        accepted.append({"measuredIndex": measured_index, "seedIndex": seed_index})
    mapped_measured = {pair["measuredIndex"] for pair in accepted}
    mapped_seed = {pair["seedIndex"] for pair in accepted}
    unknown_indexes.extend(index for index, label in enumerate(labels)
                           if label.strip().casefold() in UNKNOWN_LABELS and index not in unknown_indexes)
    return {"status": "diagnostic-only-product-rejected", "rawSha256": raw_sha256,
            "rawLabelCount": len(labels), "seedWordCount": len(seed_words),
            "mappedWords": len(accepted), "unknownMeasuredIndexes": sorted(unknown_indexes),
            "unmatchedMeasuredIndexes": sorted(set(range(len(labels))) - mapped_measured - set(unknown_indexes)),
            "unmatchedSeedIndexes": sorted(set(range(len(seed_words))) - mapped_seed),
            "mappingPairs": accepted, "words": words, "modelIdentity": model_identity}


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw_json", type=Path)
    parser.add_argument("seed_json", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--identity", type=Path)
    args = parser.parse_args()

    raw_path = args.raw_json.resolve(strict=True)
    seed_path = args.seed_json.resolve(strict=True)
    output_path = args.output.resolve()
    raw_data = _read_json(raw_path)
    seed_data = _read_json(seed_path)
    seed_words = seed_data["words"] if isinstance(seed_data, dict) else seed_data
    identity_path = args.identity.resolve() if args.identity else raw_path.parent / "identity.json"
    identity = _read_json(identity_path) if identity_path.is_file() else None
    result = build_partial_probe(raw_data, seed_words, file_sha256(raw_path), model_identity=identity)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("x", encoding="utf-8", newline="\n") as destination:
        json.dump(result, destination, ensure_ascii=False, allow_nan=False, indent=2)
        destination.write("\n")
    print(json.dumps({"status": result["status"], "mappedWords": result["mappedWords"],
                      "seedWordCount": result["seedWordCount"], "rawSha256": result["rawSha256"]},
                     ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
