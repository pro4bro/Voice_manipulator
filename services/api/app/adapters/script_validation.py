from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

from app.domain.models import ProjectMediaAsset, ScriptValidation

# A word has to be off by more than a tone mark before it counts as a different
# word. Recognisers drop dấu constantly, and treating that as a substitution
# would report a clean read as a failure.
_PUNCTUATION = re.compile(r"[^\w\s]", re.UNICODE)


def normalize(text: str) -> list[str]:
    return _PUNCTUATION.sub(" ", text.lower()).split()


def fold(word: str) -> str:
    """Tone-insensitive form, used only to decide whether two words are the same."""
    stripped = unicodedata.normalize("NFD", word.replace("đ", "d"))
    return "".join(char for char in stripped if unicodedata.category(char) != "Mn")


def validate_script(expected: str, heard: str) -> ScriptValidation | None:
    """Did the speaker read the script they were given?

    This is a word-level diff, not forced alignment. R5 measured alignment
    against DTW and declined it for timing; this answers the other question -
    whether the words on the page are the words that were said - and answers it
    in units a person can act on: which word was skipped, which was repeated,
    which came out as something else.

    Returns None when there is nothing to compare against, which is not a
    failure. A take nobody has recognised yet is unverified, and reporting it as
    a mismatch would be a lie about a measurement that never happened.
    """
    expected_words = normalize(expected)
    heard_words = normalize(heard)
    if not expected_words or not heard_words:
        return None

    matcher = SequenceMatcher(
        a=[fold(word) for word in expected_words],
        b=[fold(word) for word in heard_words],
        autojunk=False,
    )

    matched = 0
    omissions: list[str] = []
    insertions: list[str] = []
    substitutions: list[tuple[str, str]] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            matched += i2 - i1
        elif tag == "delete":
            omissions.extend(expected_words[i1:i2])
        elif tag == "insert":
            insertions.extend(heard_words[j1:j2])
        elif tag == "replace":
            # Pair them up so a reader sees "đã -> đá" rather than two lists.
            for offset in range(max(i2 - i1, j2 - j1)):
                before = expected_words[i1 + offset] if i1 + offset < i2 else ""
                after = heard_words[j1 + offset] if j1 + offset < j2 else ""
                substitutions.append((before, after))

    return ScriptValidation(
        asset_id="",
        expected_words=len(expected_words),
        heard_words=len(heard_words),
        matched=matched,
        omissions=omissions,
        insertions=insertions,
        substitutions=substitutions,
        match_ratio=round(matched / len(expected_words), 4),
    )


def validate_asset(asset: ProjectMediaAsset) -> ScriptValidation | None:
    """Validate a guided take against what the recogniser later heard.

    The card text is ground truth and lives in `asset.text`; the recogniser's
    own attempt arrives later as an `stt` revision. Until that revision exists
    there is nothing to check, and saying so is the honest answer.
    """
    heard = next(
        (revision.text for revision in reversed(asset.revisions) if revision.source == "stt"),
        "",
    )
    result = validate_script(asset.text, heard)
    return result.model_copy(update={"asset_id": asset.id}) if result else None
