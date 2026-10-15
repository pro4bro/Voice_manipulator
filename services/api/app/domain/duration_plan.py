"""Sample-count budgets; scope duration is a budget, never an inherited rate."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

RATE = 24000


def speech_units(text: str) -> int:
    # CJK scripts have no reliable whitespace word boundary. This is only a
    # generous feasibility ceiling/weight, never a claim about generated timing.
    cjk = re.findall(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]", text)
    other = re.sub(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]", " ", text)
    # A URL, identifier or unbroken Latin passage must not count as a single
    # cheap word. Eight letters per unit is deliberately generous (96 letters/s
    # at the preflight ceiling) and does not cap ordinary short-word speech.
    latin_units = max(len(other.split()), math.ceil(sum(char.isalnum() for char in other) / 8))
    return max(1, len(cjk) + latin_units)


@dataclass
class Budget:
    id: str
    minimum: int
    maximum: int
    preferred: int
    fixed: int | None = None
    children: list["Budget"] = field(default_factory=list)
    gap: int = 0
    assigned: int | None = None


def distribute(total: int, children: list[Budget]) -> list[int]:
    if total < sum(child.minimum for child in children) or total > sum(child.maximum for child in children):
        raise ValueError("Không-fit: tổng budget mâu thuẫn với thời lượng câu/khóa hoặc tốc độ đọc khả thi.")
    low, high = 0.0, max(1.0, total / max(1, min(child.preferred for child in children)))
    for _ in range(80):
        scale = (low + high) / 2
        value = sum(max(child.minimum, min(child.maximum, child.preferred * scale)) for child in children)
        if value < total: low = scale
        else: high = scale
    shares = [max(child.minimum, min(child.maximum, child.preferred * low)) for child in children]
    result = [math.floor(value) for value in shares]
    extra = total - sum(result)
    for index in sorted(range(len(children)), key=lambda i: (-(shares[i] - result[i]), i)):
        if extra and result[index] < children[index].maximum:
            result[index] += 1; extra -= 1
    if extra: raise ValueError("Không phân bổ được budget theo sample.")
    return result


def allocate_duration(document, rows, gap_seconds: float, timing: dict[str, dict] | None = None) -> dict:
    timing = timing or {}
    if "duration" in document.settings.locked and document.settings.duration is None:
        raise ValueError("Khóa thời lượng clip cần một budget cụ thể.")
    gap = round(gap_seconds * RATE)
    if len({row.id for row in rows}) != len(rows): raise ValueError("Script có ID câu trùng.")
    selected = {row.id for row in rows}
    if document.settings.duration is not None and selected != {row.id for row in document.rows if row.text.strip()}:
        raise ValueError("Budget cả clip cần đọc toàn bộ Script; không phân bổ lại trên một phần câu.")
    segments = []
    for row in rows:
        if not segments or segments[-1][0] != row.segment_id: segments.append((row.segment_id, []))
        segments[-1][1].append(row)
    nodes, leaves, segment_requests = [], {}, {}
    for segment_id, members in segments:
        segment = next((item for item in document.segments if item.id == segment_id), None)
        target = segment.settings.duration if segment else None
        if segment and "duration" in segment.settings.locked and target is None:
            raise ValueError("Khóa thời lượng đoạn cần một budget cụ thể.")
        if target is not None:
            if sum(key == segment_id for key, _ in segments) > 1: raise ValueError("Đoạn có budget phải liền nhau trong Script.")
            if {row.id for row in members} != {row.id for row in document.rows if row.segment_id == segment_id and row.text.strip()}:
                raise ValueError("Budget đoạn cần đọc đủ các câu của đoạn.")
        children = []
        for row in members:
            units = speech_units(row.text)
            minimum = math.ceil(max(.12, units / 12) * RATE)
            reference = timing.get(row.id)
            if reference and reference.get("state") != "ready": raise ValueError(f"Timing của câu {row.id} đã stale. Lập lại hoặc bỏ timing plan.")
            preferred = round((reference["requestedDuration"] if reference else max(.5, units / 3)) * RATE)
            fixed = round(row.settings.duration * RATE) if row.settings.duration is not None else None
            if "duration" in row.settings.locked and fixed is None:
                if reference is None: raise ValueError(f"Câu {row.id}: khóa thời lượng cần giá trị hoặc timing source đã xác minh.")
                fixed = preferred
            if fixed is not None and (fixed < minimum or fixed > 600 * RATE): raise ValueError(f"Không-fit: budget câu {row.id} nằm ngoài giới hạn đọc khả thi.")
            node = Budget(row.id, fixed if fixed is not None else minimum, fixed if fixed is not None else 600 * RATE, max(1, preferred), fixed)
            children.append(node); leaves[row.id] = node
        internal_gap = gap * max(0, len(children) - 1)
        minimum, maximum = sum(child.minimum for child in children) + internal_gap, sum(child.maximum for child in children) + internal_gap
        fixed = round(target * RATE) if target is not None else None
        if fixed is not None and not minimum <= fixed <= maximum: raise ValueError(f"Không-fit: budget đoạn {segment_id} mâu thuẫn với các câu/khóa và khoảng nghỉ.")
        node = Budget(segment_id, fixed if fixed is not None else minimum, fixed if fixed is not None else maximum,
                      sum(child.fixed or child.preferred for child in children) + internal_gap, fixed, children, internal_gap)
        nodes.append(node); segment_requests[segment_id] = target
    total_target = document.settings.duration

    def apply(node: Budget, assigned: int | None = None):
        budget = node.fixed if node.fixed is not None else assigned
        node.assigned = budget
        if node.children:
            values = distribute(budget - node.gap, node.children) if budget is not None else [None] * len(node.children)
            for child, value in zip(node.children, values): apply(child, value)
        elif budget is None and node.id in timing:
            node.assigned = node.preferred
            if not node.minimum <= node.assigned <= node.maximum: raise ValueError(f"Không-fit: timing source của câu {node.id} quá ngắn/dài.")

    root_gap = gap * max(0, len(nodes) - 1)
    root = Budget("clip", sum(node.minimum for node in nodes) + root_gap, sum(node.maximum for node in nodes) + root_gap,
                  sum(node.preferred for node in nodes) + root_gap, round(total_target * RATE) if total_target is not None else None, nodes, root_gap)
    apply(root)
    return {"requestedClip": total_target, "gapSeconds": gap / RATE, "segments": segment_requests,
            "rows": {row.id: {"duration": leaves[row.id].assigned / RATE if leaves[row.id].assigned is not None else None,
                "origin": "sentence" if row.settings.duration is not None else "budget" if document.settings.duration is not None or segment_requests[row.segment_id] is not None else "reference" if row.id in timing else "natural"} for row in rows}}
