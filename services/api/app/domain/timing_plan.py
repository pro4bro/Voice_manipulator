from __future__ import annotations

import math
import re
import unicodedata
from typing import Literal
from pydantic import Field, model_validator
from app.domain.models import DomainModel


class TimingSource(DomainModel):
    kind: Literal["reference", "training", "dub", "patch"]
    asset_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$")
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    revision: str = Field(min_length=1, max_length=160)
    training_run_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$")

    @model_validator(mode="after")
    def valid(self):
        if self.end <= self.start: raise ValueError("Timing source cần span dương.")
        if self.kind == "training" and not self.training_run_id: raise ValueError("Chọn Training Run có manifest đã kiểm chứng.")
        return self


class TimingPlanRequest(DomainModel):
    row_id: str = Field(min_length=1, max_length=80)
    source: TimingSource
    expected_revision: int = Field(ge=0)
    expected_script_revision: int = Field(ge=0)
    reviewed_mapping: bool = False


def normalized(text: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", text)).casefold()


def timing_template(words: list[dict], start: float, end: float, target_text: str, reviewed: bool) -> dict:
    selected = []
    for index, word in enumerate(words):
        try: a, b = float(word["start"]), float(word["end"])
        except (KeyError, ValueError, TypeError): continue
        if not all(math.isfinite(t) for t in [a, b]) or b <= a or b <= start or a >= end: continue
        selected.append({"wordIndex": index, "text": str(word.get("text", "")), "start": a - start, "end": b - start,
                         "usable": word.get("timingTrusted") is True and a >= start and b <= end})
    same_text = bool(selected) and normalized("".join(word["text"] for word in selected)) == normalized(target_text)
    mapping = "reviewed" if same_text and reviewed and all(word["usable"] for word in selected) else "unreviewed" if same_text else "unknown"
    anchors = [{**word, "targetWordIndex": index if mapping == "reviewed" else None} for index, word in enumerate(selected)]
    pauses = [{"start": left["end"], "end": right["start"]} for left, right in zip(selected, selected[1:])
              if left["usable"] and right["usable"] and right["start"] - left["end"] >= .08]
    return {"duration": end - start, "anchors": anchors, "pauses": pauses, "mapping": mapping,
            "envelope": {"start": 0, "end": end - start}, "transcript": " ".join(word["text"] for word in selected),
            "note": "Mốc từ chỉ dùng khi mapping đã review; text khác chỉ có envelope, không suy diễn timing từ."}


def compare_timing(plan: dict, actual_duration: float, actual_words: list[dict] | None = None) -> dict:
    """Report actual measured errors; estimated output words never count as proof."""
    requested = plan["requestedDuration"]
    errors = []
    words = actual_words or []
    for anchor in plan["template"]["anchors"]:
        index = anchor["targetWordIndex"]
        if index is None or index >= len(words) or words[index].get("timingTrusted") is not True: continue
        word = words[index]
        if normalized(str(word.get("text", ""))) != normalized(anchor["text"]): continue
        errors.append({"wordIndex": index, "startError": float(word["start"]) - anchor["start"], "endError": float(word["end"]) - anchor["end"]})
    expected = sum(anchor["targetWordIndex"] is not None for anchor in plan["template"]["anchors"])
    status = "measured" if errors and len(errors) == expected else "partial" if errors else "unknown"
    return {"requestedDuration": requested, "actualDuration": actual_duration, "durationError": actual_duration - requested,
            "anchorErrors": errors, "anchorStatus": status,
            "offsetError": errors[0]["startError"] if errors and errors[0]["wordIndex"] == 0 else None}
