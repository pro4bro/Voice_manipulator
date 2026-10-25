from __future__ import annotations

from typing import Literal
from pydantic import Field, model_validator
from app.domain.models import DomainModel


class ScriptSettings(DomainModel):
    duration: float | None = Field(default=None, gt=0, le=600)
    mood: str | None = Field(default=None, max_length=120)
    emotion: str | None = Field(default=None, max_length=120)
    intensity: float | None = Field(default=None, ge=0, le=1)
    delivery: Literal["neutral", "whisper", "shout"] | None = None
    gain_db: float | None = Field(default=None, ge=-60, le=12)
    note: str | None = Field(default=None, max_length=2000)
    locked: list[Literal["duration", "mood", "emotion", "intensity", "delivery", "gainDb", "note"]] = Field(default_factory=list)


class ScriptSentence(DomainModel):
    id: str = Field(min_length=1, max_length=80)
    text: str = Field(default="", max_length=5000)
    voice_id: str | None = None
    speaker_profile_id: str | None = None
    segment_id: str = Field(min_length=1, max_length=80)
    settings: ScriptSettings = Field(default_factory=ScriptSettings)
    origin_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    legacy_row_ids: list[str] = Field(default_factory=list, max_length=400)


class ScriptSegment(DomainModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(default="", max_length=160)
    settings: ScriptSettings = Field(default_factory=ScriptSettings)


class VoiceScriptDocument(DomainModel):
    version: Literal[1] = 1
    turn_grouping_version: Literal[1] = 1
    revision: int = Field(default=0, ge=0)
    settings: ScriptSettings = Field(default_factory=ScriptSettings)
    segments: list[ScriptSegment] = Field(default_factory=list, max_length=400)
    rows: list[ScriptSentence] = Field(default_factory=list, max_length=400)

    @model_validator(mode="after")
    def check_links(self):
        ids = [segment.id for segment in self.segments]
        row_ids = [row.id for row in self.rows]
        aliases = [alias for row in self.rows for alias in dict.fromkeys([row.id, *row.legacy_row_ids])]
        if len(set(ids)) != len(ids) or len(set(row_ids)) != len(row_ids) or len(set(aliases)) != len(aliases):
            raise ValueError("Script IDs must be unique.")
        if any(row.segment_id not in ids for row in self.rows):
            raise ValueError("Sentence must belong to an existing segment.")
        return self


def effective_settings(document: VoiceScriptDocument, row: ScriptSentence) -> dict:
    """Ancestor locks win; mirrors the editor's clip/segment/sentence cascade."""
    result, locked = {}, set()
    segment = next((item for item in document.segments if item.id == row.segment_id), None)
    for settings in [document.settings, segment.settings if segment else ScriptSettings(), row.settings]:
        for key, value in settings.model_dump(by_alias=True).items():
            if key != "locked" and value is not None and key not in locked:
                result[key] = value
        locked.update(settings.locked)
    result["locked"] = sorted(locked)
    return result


def referenced_script_row_ids(*values) -> set[str]:
    """Collect conservative row references from persisted Script sidecars."""
    references: set[str] = set()

    def visit(value):
        if isinstance(value, dict):
            row_id = value.get("rowId", value.get("row_id"))
            if isinstance(row_id, str):
                references.add(row_id)
            row_ids = value.get("rowIds", value.get("row_ids"))
            if isinstance(row_ids, list):
                references.update(item for item in row_ids if isinstance(item, str))
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for value in values:
        visit(value)
    return references


def legacy_row_groups(document: VoiceScriptDocument,
        related_documents: list[VoiceScriptDocument] | None = None,
        protected_row_ids: set[str] | None = None) -> list[list[str]]:
    """Return safe, consecutive legacy row groups without changing the document."""
    groups: list[list[str]] = []
    related_documents = related_documents or []
    protected_row_ids = protected_row_ids or set()
    related_maps = [{row.id: (index, row) for index, row in enumerate(related.rows)}
        for related in related_documents]
    rows = document.rows
    index = 0
    while index < len(rows):
        head = rows[index]
        aliases = list(dict.fromkeys([head.id, *head.legacy_row_ids]))
        settings = effective_settings(document, head)
        can_group = (bool(head.speaker_profile_id or head.voice_id) and settings.get("duration") is None and
            not protected_row_ids.intersection([head.id, *head.legacy_row_ids]))
        group_text_length = len(head.text)
        related_heads = [mapping.get(head.id) for mapping in related_maps]
        related_lengths = [len(item[1].text) for item in related_heads if item is not None]
        if any(item is None or effective_settings(related_documents[i], item[1]).get("duration") is not None
                for i, item in enumerate(related_heads)):
            can_group = False
        cursor = index + 1
        while can_group and cursor < len(rows):
            candidate = rows[cursor]
            candidate_settings = effective_settings(document, candidate)
            same_identity = (candidate.voice_id == head.voice_id and
                ((head.speaker_profile_id is not None and candidate.speaker_profile_id == head.speaker_profile_id) or
                 (head.speaker_profile_id is None and candidate.speaker_profile_id is None and head.voice_id is not None)))
            if (not same_identity or candidate_settings.get("duration") is not None or
                    candidate_settings != settings or group_text_length + 1 + len(candidate.text) > 5000 or
                    protected_row_ids.intersection([candidate.id, *candidate.legacy_row_ids])):
                break
            related_candidates = [mapping.get(candidate.id) for mapping in related_maps]
            related_compatible = True
            for related_index, (previous, following) in enumerate(zip(related_heads, related_candidates)):
                if (previous is None or following is None or following[0] != previous[0] + 1 or
                        effective_settings(related_documents[related_index], following[1]).get("duration") is not None or
                        effective_settings(related_documents[related_index], previous[1]) !=
                            effective_settings(related_documents[related_index], following[1]) or
                        previous[1].voice_id != following[1].voice_id or
                        not ((previous[1].speaker_profile_id is not None and
                              previous[1].speaker_profile_id == following[1].speaker_profile_id) or
                             (previous[1].speaker_profile_id is None and following[1].speaker_profile_id is None and
                              previous[1].voice_id is not None)) or
                        related_lengths[related_index] + 1 + len(following[1].text) > 5000):
                    related_compatible = False
                    break
            if not related_compatible:
                break
            aliases.extend([candidate.id, *candidate.legacy_row_ids])
            group_text_length += 1 + len(candidate.text)
            for related_index, following in enumerate(related_candidates):
                related_heads[related_index] = following
                related_lengths[related_index] += 1 + len(following[1].text)
            cursor += 1
        groups.append(aliases)
        index = cursor if cursor > index + 1 else index + 1
    return groups


def apply_legacy_row_groups(document: VoiceScriptDocument, groups: list[list[str]]) -> VoiceScriptDocument:
    """Apply grouping boundaries from a legacy Script to a related snapshot."""
    rows = document.rows
    by_legacy_id: dict[str, int] = {}
    row_aliases: list[list[str]] = []
    for index, row in enumerate(rows):
        aliases = list(dict.fromkeys([row.id, *row.legacy_row_ids]))
        row_aliases.append(aliases)
        for legacy_id in aliases:
            by_legacy_id[legacy_id] = index

    group_by_head: dict[int, list[str]] = {}
    consumed: set[int] = set()
    for group in groups:
        positions = sorted({by_legacy_id[item] for item in group if item in by_legacy_id})
        if len(positions) < 2 or positions != list(range(positions[0], positions[-1] + 1)):
            continue
        # Only merge when every boundary member exists in this snapshot. This
        # keeps a historical/partial snapshot structurally trustworthy.
        covered = {alias for position in positions for alias in row_aliases[position]}
        if not set(group).issubset(covered) or consumed.intersection(positions):
            continue
        members = [rows[position] for position in positions]
        anchor_settings = effective_settings(document, members[0])
        if anchor_settings.get("duration") is not None or any(
                member.voice_id != members[0].voice_id or
                member.speaker_profile_id != members[0].speaker_profile_id or
                effective_settings(document, member) != anchor_settings or
                effective_settings(document, member).get("duration") is not None
                for member in members[1:]):
            continue
        same_identity = bool(members[0].speaker_profile_id or members[0].voice_id)
        if not same_identity or len("\n".join(member.text for member in members)) > 5000:
            continue
        group_by_head[positions[0]] = list(group)
        consumed.update(positions[1:])

    result: list[ScriptSentence] = []
    for index, row in enumerate(rows):
        if index in consumed:
            continue
        group = group_by_head.get(index)
        if not group:
            result.append(row.model_copy(deep=True))
            continue
        positions = sorted({by_legacy_id[item] for item in group})
        members = [rows[position] for position in positions]
        head = members[0]
        result.append(head.model_copy(update={
            "text": "\n".join(member.text for member in members),
            "origin_ids": list(dict.fromkeys(value for member in members for value in member.origin_ids)),
            "tags": list(dict.fromkeys(value for member in members for value in member.tags)),
            "legacy_row_ids": list(group),
        }))
    return document.model_copy(update={"rows": result, "turn_grouping_version": 1}, deep=True)


def group_legacy_script_rows(document: VoiceScriptDocument) -> VoiceScriptDocument:
    return apply_legacy_row_groups(document, legacy_row_groups(document))
