"""Choosing the clip a cloned voice imitates.

OmniVoice's own guidance is a 3-10 second reference in the target language:
longer slows generation and can degrade cloning. The clip must be one whole
segment, never a cut inside one, because its transcript has to match the audio
exactly and the compiler only knows where segments start and end.
"""

from __future__ import annotations

from app.domain.models import DatasetSegment

# Where the text came from, most trustworthy first. A reference whose
# transcript is wrong teaches the model the wrong mapping of sound to text.
_PROVENANCE_RANK = {"script": 0, "user": 1, "ai": 2, "stt": 3}
# Read against a script, recorded on purpose, then imported footage.
_TIER_RANK = {"guided": 0, "record": 1, "import": 2}

# Inside the window, a longer clip carries more of the voice; this is where the
# preference for length stops.
PREFERRED_SECONDS = 8.0


class NoReferenceSegment(ValueError):
    """No segment of this speaker fits the reference window."""


def choose_reference(
    segments: list[DatasetSegment],
    min_seconds: float = 3.0,
    max_seconds: float = 10.0,
) -> DatasetSegment:
    candidates = [
        segment
        for segment in segments
        if min_seconds <= segment.duration <= max_seconds and segment.text.strip()
    ]
    if not candidates:
        longest = max((segment.duration for segment in segments), default=0.0)
        raise NoReferenceSegment(
            f"Không có đoạn nào dài {min_seconds:g}-{max_seconds:g} giây để làm giọng mẫu "
            f"(đoạn dài nhất {longest:.1f} giây)."
        )
    return min(
        candidates,
        key=lambda segment: (
            _PROVENANCE_RANK.get(str(segment.text_provenance), 9),
            _TIER_RANK.get(segment.capture_tier, 9),
            abs(segment.duration - PREFERRED_SECONDS),
            segment.id,
        ),
    )
