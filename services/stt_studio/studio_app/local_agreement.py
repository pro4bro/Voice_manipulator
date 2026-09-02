from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Word:
    text: str
    start: float
    end: float


def _fold(text: str) -> str:
    """Compare words by what was said, not by how it was punctuated.

    Two passes over the same audio disagree about commas and capitals constantly.
    Letting that count as disagreement would stop anything ever being confirmed.
    """
    stripped = re.sub(r"[^\w\s]", "", unicodedata.normalize("NFC", text))
    return stripped.strip().casefold()


@dataclass
class LocalAgreement:
    """Emit only the words two consecutive passes agree on.

    Transcribing four seconds of audio on its own gives a different answer each
    time - measured on this project: one 4 s clip produced "Cái này có cái tòi có
    tòi chung" and "Cái gì? Cái gì? Đôi rồi, đôi rồi" from identical bytes. A
    tiny model with no context has nothing to anchor on, and whisper's own
    fallback resamples when it is unsure.

    So instead of trusting one pass, the same growing buffer is transcribed
    repeatedly and a word is only committed once two passes in a row have
    produced it in the same place. Committed text never changes afterwards: it
    only grows. Everything after the agreed prefix stays provisional and is shown
    as such.

    This is the LocalAgreement-2 policy from ufal/whisper_streaming (MIT),
    implemented here so the live transcript needs no second service and no second
    copy of the model.
    """

    #: How many consecutive passes must agree before a word is committed.
    agreement: int = 2
    _committed: list[Word] = field(default_factory=list)
    #: Committed words still inside the audio buffer, so they can be skipped.
    _in_buffer: int = 0
    #: The unconfirmed tail each previous pass produced, newest last.
    _history: list[list[Word]] = field(default_factory=list)
    #: Seconds of audio already scrolled off the front of the buffer.
    offset: float = 0.0

    @property
    def committed(self) -> list[Word]:
        return list(self._committed)

    @property
    def pending(self) -> list[Word]:
        return list(self._history[-1]) if self._history else []

    def update(self, hypothesis: list[Word]) -> list[Word]:
        """Feed one pass over the whole buffer; get back what is newly certain."""
        tail = hypothesis[self._in_buffer:]
        self._history.append(tail)
        if len(self._history) > self.agreement:
            self._history.pop(0)
        if len(self._history) < self.agreement:
            return []

        confirmed: list[Word] = []
        for position in range(min(len(run) for run in self._history)):
            spellings = {_fold(run[position].text) for run in self._history}
            if len(spellings) != 1 or not spellings.pop():
                break
            confirmed.append(tail[position])

        if not confirmed:
            return []
        shifted = [
            Word(word.text, word.start + self.offset, word.end + self.offset)
            for word in confirmed
        ]
        self._committed.extend(shifted)
        self._in_buffer += len(confirmed)
        # The agreed prefix is settled, so the passes that produced it are spent.
        self._history = [run[len(confirmed):] for run in self._history]
        return shifted

    def scroll_to(self, seconds: float) -> float:
        """Drop the buffer up to `seconds`, returning the new absolute offset.

        Called when the buffer grows long enough to slow a pass down. Only the
        span behind the last committed word can go; everything after it is still
        being decided.
        """
        self.offset += seconds
        self._in_buffer = 0
        self._history = []
        return self.offset

    def flush(self) -> list[Word]:
        """Recording stopped: take the provisional tail as it stands.

        Nothing more is coming, so a second opinion will never arrive. Better an
        unconfirmed last few words than losing them.
        """
        tail = self._history[-1] if self._history else []
        shifted = [
            Word(word.text, word.start + self.offset, word.end + self.offset)
            for word in tail
        ]
        self._committed.extend(shifted)
        self._history = []
        self._in_buffer += len(tail)
        return shifted


def text_of(words: list[Word]) -> str:
    return " ".join(word.text.strip() for word in words if word.text.strip())
