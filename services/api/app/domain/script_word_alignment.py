"""Word timing for speech whose text is known: generated speech read from a Script.

Recognition runs on the generated audio and supplies the timing; the Script
supplies the words. The two are matched token by token, so a subtitle shows
what the user typed at the moment it is heard - not what recognition thought
it heard.

A Script word that recognition matched, or replaced one for one, takes that
word's measured interval and stays trusted. Words recognition dropped or merged
are placed inside the span their neighbours leave, by length, and are marked
untrusted - the same flag footage uses - so nothing estimated passes for measured.
"""

from __future__ import annotations

import unicodedata
from difflib import SequenceMatcher
from typing import Any

MEASURED_SOURCE = "faster-whisper-dtw"
ESTIMATED_SOURCE = "script-proportional"
MIN_WORD_SECONDS = 0.02


def normalized(token: str) -> str:
    """Letters and digits only, without tone marks: how two readings of a word compare."""
    decomposed = unicodedata.normalize("NFD", token.replace("đ", "d").replace("Đ", "D"))
    return "".join(ch for ch in decomposed if unicodedata.category(ch)[0] in {"L", "N"}).lower()


def script_tokens(text: str) -> list[str]:
    """Words as they are displayed; a bare punctuation mark stays with the word before it."""
    tokens: list[str] = []
    for piece in text.split():
        if tokens and not normalized(piece):
            tokens[-1] = f"{tokens[-1]} {piece}" if piece in {"-", "–", "—"} else tokens[-1] + piece
        else:
            tokens.append(piece)
    return tokens


def _recognized_tokens(words: list[dict[str, Any]]) -> list[tuple[str, float, float]]:
    found: list[tuple[str, float, float]] = []
    for word in words:
        try:
            start, end = float(word["start"]), float(word["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if end <= start:
            continue
        pieces = [piece for piece in str(word.get("text", "")).split() if normalized(piece)]
        if not pieces:
            continue
        # One recognized "word" holding two syllables shares its interval evenly.
        step = (end - start) / len(pieces)
        for index, piece in enumerate(pieces):
            found.append((normalized(piece), start + step * index, start + step * (index + 1)))
    return found


def _spread(tokens: list[str], start: float, end: float) -> list[tuple[float, float]]:
    """Intervals for tokens across a span, sized by how long each word is to say."""
    weights = [max(1, len(normalized(token))) for token in tokens]
    total = sum(weights)
    span = max(0.0, end - start)
    cursor = start
    intervals: list[tuple[float, float]] = []
    for weight in weights:
        width = span * weight / total
        intervals.append((cursor, cursor + width))
        cursor += width
    return intervals


def align_script_words(text: str, recognized: list[dict[str, Any]], duration: float) -> tuple[list[dict[str, Any]], str]:
    """Script words with timing, and the timing quality of the whole row."""
    tokens = script_tokens(text)
    if not tokens:
        return [], "unverified"
    heard = _recognized_tokens(recognized)
    timing: list[tuple[float, float] | None] = [None] * len(tokens)
    trusted = [False] * len(tokens)

    if heard:
        matcher = SequenceMatcher(None, [normalized(token) for token in tokens], [item[0] for item in heard], autojunk=False)
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
                for offset in range(i2 - i1):
                    _, start, end = heard[j1 + offset]
                    timing[i1 + offset] = (start, end)
                    trusted[i1 + offset] = True
            elif tag == "replace":
                # Recognition split or merged these words differently; the span
                # they occupy is measured, the boundaries inside it are not.
                for offset, interval in enumerate(_spread(tokens[i1:i2], heard[j1][1], heard[j2 - 1][2])):
                    timing[i1 + offset] = interval

    # Whatever is still untimed sits between the nearest timed neighbours.
    index = 0
    while index < len(tokens):
        if timing[index] is not None:
            index += 1
            continue
        stop = index
        while stop < len(tokens) and timing[stop] is None:
            stop += 1
        before = timing[index - 1][1] if index > 0 and timing[index - 1] else 0.0
        after = timing[stop][0] if stop < len(tokens) and timing[stop] else max(before, duration)
        for offset, interval in enumerate(_spread(tokens[index:stop], before, after)):
            timing[index + offset] = interval
        index = stop

    words: list[dict[str, Any]] = []
    cursor = 0.0
    limit = max(duration, 0.0)
    for token, interval, measured in zip(tokens, timing, trusted):
        start, end = interval or (cursor, cursor)
        start = min(max(start, cursor), limit)
        end = min(max(end, start + MIN_WORD_SECONDS), max(limit, start + MIN_WORD_SECONDS))
        words.append(
            {
                "text": token,
                "start": round(start, 3),
                "end": round(end, 3),
                "timingSource": MEASURED_SOURCE if measured else ESTIMATED_SOURCE,
                "timingTrusted": measured,
            }
        )
        cursor = end
    measured_count = sum(trusted)
    quality = "source" if measured_count == len(tokens) else "partial" if measured_count else "needs-alignment"
    return words, quality
