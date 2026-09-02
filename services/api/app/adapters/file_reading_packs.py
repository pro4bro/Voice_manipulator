from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.domain.models import (
    ReadingCard,
    ReadingPack,
    ReadingPackSummary,
    ReadingPassage,
)

logger = logging.getLogger(__name__)

# Careful reading runs around 140 words per minute in both shipped languages.
# Every duration this adapter reports is an estimate from that rate, never a
# measurement; only a recorded take knows how long a card actually takes.
WORDS_PER_SECOND = 140 / 60

# The window both OmniVoice and VibeVoice datasets are comfortable with. Cards
# outside it still load, because content is not the loader's business to reject,
# but they are reported so a pack can be fixed.
CARD_MIN_SECONDS = 2.0
CARD_MAX_SECONDS = 15.0


class ReadingPackError(LookupError):
    """No pack is installed under the requested id."""


class FileReadingPacks:
    """Reads the app-level reading packs shipped under `app/resources`.

    Packs are read-only application resources, not project data. A malformed
    pack is skipped with a log line rather than taken down the whole API: one
    bad file must not make the app unstartable.
    """

    def __init__(self, root: Path) -> None:
        self.root = root
        self._cache: dict[Path, tuple[float, int, ReadingPack]] = {}

    def list(self) -> list[ReadingPackSummary]:
        packs = self._load_all()
        summaries = [
            ReadingPackSummary(**pack.model_dump(exclude={"passages"})) for pack in packs
        ]
        return sorted(summaries, key=lambda pack: (pack.language, pack.pack_id))

    def get(self, pack_id: str) -> ReadingPack:
        for pack in self._load_all():
            if pack.pack_id == pack_id:
                return pack
        raise ReadingPackError(f"Reading pack '{pack_id}' is not installed.")

    def out_of_range_cards(self, pack_id: str) -> list[tuple[str, float]]:
        """Cards whose estimated duration falls outside the training window."""
        pack = self.get(pack_id)
        return [
            (card.id, card.estimated_seconds)
            for passage in pack.passages
            for card in passage.cards
            if not CARD_MIN_SECONDS <= card.estimated_seconds <= CARD_MAX_SECONDS
        ]

    def _load_all(self) -> list[ReadingPack]:
        if not self.root.is_dir():
            logger.warning("Reading pack folder is missing: %s", self.root)
            return []
        packs: list[ReadingPack] = []
        seen_ids: set[str] = set()
        for path in sorted(self.root.glob("*.json")):
            pack = self._load_one(path)
            if pack is None:
                continue
            if pack.pack_id in seen_ids:
                logger.warning(
                    "Skipping reading pack %s: id '%s' is already installed.", path.name, pack.pack_id
                )
                continue
            seen_ids.add(pack.pack_id)
            packs.append(pack)
        return packs

    def _load_one(self, path: Path) -> ReadingPack | None:
        try:
            stat = path.stat()
            cached = self._cache.get(path)
            if cached and cached[0] == stat.st_mtime and cached[1] == stat.st_size:
                return cached[2]
            raw = json.loads(path.read_text(encoding="utf-8"))
            pack = self._build(raw)
        except (OSError, ValueError, KeyError, TypeError) as error:
            logger.warning("Skipping unreadable reading pack %s: %s", path.name, error)
            return None
        self._cache[path] = (stat.st_mtime, stat.st_size, pack)
        return pack

    def _build(self, raw: dict[str, Any]) -> ReadingPack:
        passages: list[ReadingPassage] = []
        passage_ids: set[str] = set()
        card_ids: set[str] = set()

        for entry in raw.get("passages", []):
            passage_id = entry["id"]
            if passage_id in passage_ids:
                raise ValueError(f"duplicate passage id '{passage_id}'")
            passage_ids.add(passage_id)
            if entry["emotion"] == "mix":
                raise ValueError(f"passage '{passage_id}' uses 'mix', which is a rollup, not a delivery")

            cards: list[ReadingCard] = []
            for card in entry.get("cards", []):
                card_id = card["id"]
                if card_id in card_ids:
                    raise ValueError(f"duplicate card id '{card_id}'")
                card_ids.add(card_id)
                text = card["text"].strip()
                if not text:
                    raise ValueError(f"card '{card_id}' has no text")
                words = len(text.split())
                cards.append(
                    ReadingCard(
                        id=card_id,
                        text=text,
                        tags=list(card.get("tags", [])),
                        word_count=words,
                        estimated_seconds=round(words / WORDS_PER_SECOND, 2),
                    )
                )

            if not cards:
                raise ValueError(f"passage '{passage_id}' has no cards")
            passages.append(
                ReadingPassage(
                    id=passage_id,
                    kind=entry["kind"],
                    emotion=entry["emotion"],
                    title=entry["title"],
                    direction=entry.get("direction", ""),
                    cards=cards,
                    word_count=sum(card.word_count for card in cards),
                    estimated_seconds=round(sum(card.estimated_seconds for card in cards), 2),
                )
            )

        if not passages:
            raise ValueError("pack has no passages")

        return ReadingPack(
            pack_id=raw["packId"],
            language=raw["language"],
            language_name=raw["languageName"],
            title=raw["title"],
            version=raw["version"],
            license=raw.get("license", ""),
            passage_count=len(passages),
            card_count=sum(len(passage.cards) for passage in passages),
            word_count=sum(passage.word_count for passage in passages),
            estimated_seconds=round(sum(passage.estimated_seconds for passage in passages), 2),
            emotions=sorted({passage.emotion for passage in passages}),
            passages=passages,
        )
