from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from datetime import datetime, timezone
from uuid import uuid4

from app.domain.models import (
    ReadingCard,
    ReadingPack,
    ReadingPackSummary,
    ReadingPassage,
    ReadingPassageDraft,
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

    def __init__(self, root: Path, authored_root: Path | None = None) -> None:
        self.root = root
        # Authored packs are user content, so they live in machine-local data
        # rather than in the application's own resource folder. Writing there
        # would put a moderator's work inside the source tree, where the next
        # update overwrites it and every `git status` reports it.
        self.authored_root = authored_root
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

    def _pack_files(self) -> list[tuple[Path, str]]:
        files: list[tuple[Path, str]] = []
        if self.root.is_dir():
            files += [(path, "shipped") for path in sorted(self.root.glob("*.json"))]
        else:
            logger.warning("Reading pack folder is missing: %s", self.root)
        if self.authored_root and self.authored_root.is_dir():
            files += [(path, "authored") for path in sorted(self.authored_root.glob("*.json"))]
        return files

    def _load_all(self) -> list[ReadingPack]:
        packs: list[ReadingPack] = []
        seen_ids: set[str] = set()
        for path, source in self._pack_files():
            pack = self._load_one(path, source)
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

    def _load_one(self, path: Path, source: str = "shipped") -> ReadingPack | None:
        try:
            stat = path.stat()
            cached = self._cache.get(path)
            if cached and cached[0] == stat.st_mtime and cached[1] == stat.st_size:
                return cached[2]
            raw = json.loads(path.read_text(encoding="utf-8"))
            pack = self._build(raw, source)
        except (OSError, ValueError, KeyError, TypeError) as error:
            logger.warning("Skipping unreadable reading pack %s: %s", path.name, error)
            return None
        self._cache[path] = (stat.st_mtime, stat.st_size, pack)
        return pack

    def _build(self, raw: dict[str, Any], source: str = "shipped") -> ReadingPack:
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
                    regions=list(entry.get("regions", [])),
                    genders=list(entry.get("genders", [])),
                    age_ranges=list(entry.get("ageRanges", entry.get("age_ranges", []))),
                    source=source,
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

    # ---------- authoring ----------

    def add_passage(self, draft: ReadingPassageDraft) -> ReadingPack:
        """Append one authored passage to its language's library pack.

        There is deliberately no authentication here. The UI asks for a password
        before opening the authoring dialog, but that gate is cosmetic: this
        endpoint answers anyone who can reach the API. Treat it as protection
        against a mis-click, never against a person.
        """
        if self.authored_root is None:
            raise ReadingPackError("No writable reading-pack folder is configured.")
        if draft.emotion == "mix":
            raise ValueError("'mix' is a rollup, not a delivery a person can perform.")

        self.authored_root.mkdir(parents=True, exist_ok=True)
        path = self.authored_root / f"{draft.language}-authored.json"
        raw = self._read_authored(path, draft)

        stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        passage_id = f"{draft.language}-{draft.emotion}-{stamp}-{uuid4().hex[:6]}"
        raw["passages"].append(
            {
                "id": passage_id,
                "kind": draft.kind,
                "emotion": draft.emotion,
                "title": draft.title.strip(),
                "direction": draft.direction.strip(),
                "regions": draft.regions,
                "genders": draft.genders,
                "ageRanges": draft.age_ranges,
                "cards": [
                    {
                        "id": f"{passage_id}-c{index + 1:02d}",
                        "text": card.text.strip(),
                        "tags": card.tags,
                    }
                    for index, card in enumerate(draft.cards)
                ],
            }
        )

        # Validate the whole file before it replaces the old one: a rejected
        # passage must not be able to take the existing library down with it.
        pack = self._build(raw, "authored")
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
        self._cache.pop(path, None)
        return pack

    def _read_authored(self, path: Path, draft: ReadingPassageDraft) -> dict[str, Any]:
        if path.is_file():
            raw = json.loads(path.read_text(encoding="utf-8"))
            raw.setdefault("passages", [])
            return raw
        return {
            "packId": f"{draft.language}-authored",
            "language": draft.language,
            "languageName": draft.language_name.strip() or draft.language,
            "title": f"Bài đọc tự soạn · {draft.language_name.strip() or draft.language}",
            "version": 1,
            "license": "authored-locally",
            "passages": [],
        }
