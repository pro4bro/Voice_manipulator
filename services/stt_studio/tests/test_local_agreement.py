from __future__ import annotations

import pytest

from studio_app.local_agreement import LocalAgreement, Word, text_of


def words(spec: str, start: float = 0.0) -> list[Word]:
    """"a b c" -> three words, a quarter-second each."""
    return [
        Word(token, start + index * 0.25, start + index * 0.25 + 0.2)
        for index, token in enumerate(spec.split())
    ]


def test_nothing_is_committed_on_a_single_pass():
    agreement = LocalAgreement()
    assert agreement.update(words("xin chao cac ban")) == []
    assert agreement.committed == []


def test_two_passes_that_agree_commit_the_whole_prefix():
    agreement = LocalAgreement()
    agreement.update(words("xin chao cac ban"))
    committed = agreement.update(words("xin chao cac ban"))
    assert [word.text for word in committed] == ["xin", "chao", "cac", "ban"]


def test_only_the_prefix_the_passes_share_is_committed():
    agreement = LocalAgreement()
    agreement.update(words("xin chao cac ban"))
    committed = agreement.update(words("xin chao nhe khong"))
    # They agree on "xin chao" and part ways after it.
    assert [word.text for word in committed] == ["xin", "chao"]
    assert text_of(agreement.committed) == "xin chao"


def test_punctuation_and_case_are_not_disagreement():
    # The measured failure: identical audio, different punctuation each pass.
    agreement = LocalAgreement()
    agreement.update([Word("Xin", 0, 0.2), Word("chào", 0.25, 0.45)])
    committed = agreement.update([Word("xin,", 0, 0.2), Word("Chào!", 0.25, 0.45)])
    assert [word.text for word in committed] == ["xin,", "Chào!"]


def test_a_different_tone_mark_is_a_different_word():
    # Vietnamese diacritics carry meaning - chao, chào, cháo and chảo are four
    # words - so a pass that changes one has genuinely changed its mind and must
    # not be treated as agreement.
    agreement = LocalAgreement()
    agreement.update([Word("chao", 0, 0.2)])
    assert agreement.update([Word("chào", 0, 0.2)]) == []


def test_committed_text_only_ever_grows():
    agreement = LocalAgreement()
    agreement.update(words("mot hai"))
    agreement.update(words("mot hai"))
    first = text_of(agreement.committed)
    # A later pass that contradicts the past cannot rewrite it.
    agreement.update(words("hoan toan khac"))
    agreement.update(words("hoan toan khac"))
    assert text_of(agreement.committed).startswith(first)


def test_a_word_is_not_recommitted_as_the_buffer_grows():
    agreement = LocalAgreement()
    agreement.update(words("mot hai"))
    agreement.update(words("mot hai"))
    # The buffer still holds the same audio, so the next pass repeats it.
    agreement.update(words("mot hai ba"))
    committed = agreement.update(words("mot hai ba"))
    assert [word.text for word in committed] == ["ba"]
    assert text_of(agreement.committed) == "mot hai ba"


def test_scrolling_keeps_timestamps_absolute():
    agreement = LocalAgreement()
    agreement.update(words("mot hai"))
    agreement.update(words("mot hai"))
    agreement.scroll_to(10.0)
    agreement.update(words("ba bon"))
    committed = agreement.update(words("ba bon"))
    # "ba" was two seconds into a buffer that starts ten seconds in.
    assert committed[0].start == pytest.approx(10.0)
    assert agreement.committed[-1].end == pytest.approx(10.45)


def test_stopping_takes_the_unconfirmed_tail_rather_than_losing_it():
    agreement = LocalAgreement()
    agreement.update(words("mot hai"))
    agreement.update(words("mot hai"))
    agreement.update(words("mot hai ba"))
    # "ba" was seen once; recording stops, so a second opinion never comes.
    flushed = agreement.flush()
    assert [word.text for word in flushed] == ["ba"]
    assert text_of(agreement.committed) == "mot hai ba"


def test_a_pass_that_returns_nothing_commits_nothing():
    agreement = LocalAgreement()
    agreement.update(words("mot hai"))
    assert agreement.update([]) == []
    assert agreement.committed == []
