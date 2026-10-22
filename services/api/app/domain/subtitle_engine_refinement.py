"""Turn measured engine boundaries into a reversible preview, never inferred text."""
from copy import deepcopy
from math import isfinite

from app.domain.subtitle_alignment import _manual, _valid_interval, propose_alignment
from app.domain.subtitle_refinement import compose_refinement, conflict_indexes


def compose_engine_refinement(words, aligned, duration, *, engine, max_move_ms=2000, methods=None, **evidence):
    if not isinstance(aligned, list) or len(aligned) != len(words) or any(
            not isinstance(a, dict) or a.get("text") != w.get("text") for w, a in zip(words, aligned)):
        raise ValueError("Kết quả engine không khớp số lượng/thứ tự chữ trong script.")
    original = propose_alignment(words, aligned, duration, mode="diagnose", **evidence)
    working = deepcopy(words)
    selected = set(range(len(words)) if evidence.get("indexes") is None else evidence["indexes"])
    measured = 0
    for row, word, result in zip(original["rows"], working, aligned):
        i = row["index"]
        if i not in selected:
            continue
        bounds = [result.get(edge) for edge in ("start", "end")]
        valid = all(type(v) in (int, float) and isfinite(v) for v in bounds) and _valid_interval(tuple(bounds), duration)
        if valid:
            measured += 1
        if _manual(word):
            continue
        if not valid:
            row.update(status="review", reasons=["engine-boundary-unavailable"])
            continue
        before = row["before"]
        if any(type(before[edge]) not in (int, float) or not isfinite(before[edge]) for edge in before):
            row.update(status="review", reasons=["source-boundary-invalid"])
            continue
        if max(abs(bounds[j] - before[edge]) for j, edge in enumerate(("start", "end"))) > max_move_ms / 1000 + 1e-9:
            row.update(status="review", reasons=["engine-move-exceeds-limit"])
            continue
        candidate = dict(zip(("start", "end"), (round(v, 6) for v in bounds)))
        word.update(candidate)
        row.update(after=candidate, method=engine, status="review" if candidate != before else "unchanged",
                   reasons=["engine-measured-boundary", "preview-needs-listening"])
    if not measured:
        raise ValueError("Engine chưa đo được biên từ hợp lệ trong phạm vi đã chọn.")
    if methods:
        refined = compose_refinement(working, aligned, duration, methods=methods, **evidence)
        for row, stage, word in zip(original["rows"], refined["rows"], working):
            if row["index"] not in selected or _manual(word):
                continue
            if any(type(row["before"][edge]) not in (int, float) for edge in ("start", "end")):
                continue
            row["after"] = stage["after"]
            if max(abs(row["after"][edge] - row["before"][edge]) for edge in ("start", "end")) > max_move_ms / 1000 + 1e-9:
                row["after"] = row["before"].copy()
                row["reasons"].append("engine-move-exceeds-limit")
            if row["before"] != row["after"]:
                row.update(method=engine + "-pipeline", status="review",
                           reasons=list(dict.fromkeys(row["reasons"] + stage["reasons"])))
            word.update(row["after"])
        original["diagnostics"]["stages"] = refined["diagnostics"]["stages"]
    collisions = conflict_indexes(working)
    for row in original["rows"]:
        if row["index"] in collisions and row["after"] != row["before"]:
            row["reasons"].append("whole-output-interval-conflict")
    original["summary"] = {key: sum(row["status"] == key for row in original["rows"])
                           for key in ("ready", "review", "locked", "unchanged")}
    original["diagnostics"].update(mode="pipeline", engine=engine, measuredWords=measured,
        conflictIndexes=collisions, changedWords=sum(row["before"] != row["after"] for row in original["rows"]))
    return original
