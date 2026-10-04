"""Frozen Vietnamese STT scoring; recognizer output is never ground truth.

Text budgets use micro-averaged edits, with Vietnamese whitespace syllables for
WER. Silence insertions are reported separately, never hidden by division by 0.
Timing accuracy requires independently reviewed anchors, not ASR/VAD estimates.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import unicodedata


BUDGETS = {
    "live": {"cer": 0.15, "wer": 0.30},
    "detailed": {"cer": 0.10, "wer": 0.20},
    "silenceInsertions": 0,
    "wordBoundaryP95Seconds": 0.25,
    "liveFinalLagP95Seconds": 8.0,
    "detailedReadyLagSeconds": 30.0,
    "duplicateSeamWords": 0,
    "paddingSeconds": 10,
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text.casefold())
    return " ".join("".join(
        character if unicodedata.category(character)[0] in "LN" else " "
        for character in text
    ).split())


def edit_distance(reference, hypothesis) -> int:
    previous = list(range(len(hypothesis) + 1))
    for i, expected in enumerate(reference, 1):
        current = [i]
        for j, heard in enumerate(hypothesis, 1):
            current.append(min(previous[j] + 1, current[-1] + 1,
                               previous[j - 1] + (expected != heard)))
        previous = current
    return previous[-1]


def text_score(reference: str, hypothesis: str) -> dict:
    ref, hyp = normalize(reference), normalize(hypothesis)
    chars, heard_chars = ref.replace(" ", ""), hyp.replace(" ", "")
    syllables, heard_syllables = ref.split(), hyp.split()
    char_edits = edit_distance(chars, heard_chars)
    word_edits = edit_distance(syllables, heard_syllables)
    return {"referenceCharacters": len(chars), "characterEdits": char_edits,
            "referenceSyllables": len(syllables), "syllableEdits": word_edits,
            "cer": char_edits / len(chars) if chars else None,
            "wer": word_edits / len(syllables) if syllables else None,
            "silenceInsertions": len(heard_syllables) if not syllables else 0}


def timing_structure(words: list[dict], duration: float) -> dict:
    invalid = 0
    previous_start = -math.inf
    for word in words:
        try:
            start, end = float(word["start"]), float(word["end"])
            valid = (math.isfinite(start) and math.isfinite(end) and
                     0 <= start < end <= duration + 0.02 and start >= previous_start)
            if valid:
                previous_start = start
        except (KeyError, TypeError, ValueError, OverflowError):
            valid = False
        invalid += not valid
    return {"words": len(words), "invalid": invalid,
            "structurallyValid": bool(words) and invalid == 0,
            "accuracy": "unmeasured-without-reviewed-word-anchors"}


def score_tracks(tracks: list[dict], phase: str) -> dict:
    budget = BUDGETS[phase]
    rows = [{"track": track["track"], **text_score(track["reference"], track["text"]),
             "timing": timing_structure(track.get("words", []), track["duration"])}
            for track in tracks]
    counts = {key: sum(row[key] for row in rows) for key in (
        "referenceCharacters", "characterEdits", "referenceSyllables",
        "syllableEdits", "silenceInsertions")}
    cer = counts["characterEdits"] / counts["referenceCharacters"] if counts["referenceCharacters"] else None
    wer = counts["syllableEdits"] / counts["referenceSyllables"] if counts["referenceSyllables"] else None
    return {"phase": phase, "budget": budget, "tracks": rows, **counts,
            "cer": cer, "wer": wer,
            "textBudgetPassed": cer is not None and wer is not None and
                cer <= budget["cer"] and wer <= budget["wer"] and counts["silenceInsertions"] == 0,
            "timingAccuracyPassed": None}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--phase", choices=("live", "detailed"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    tracks = json.loads(arguments.input.read_text(encoding="utf-8"))
    arguments.output.write_text(json.dumps(score_tracks(tracks, arguments.phase),
                                           ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
