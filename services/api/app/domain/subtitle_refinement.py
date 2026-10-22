"""Compose explicit parameter trials for a source-bound Timeline ghost preview."""
from copy import deepcopy
from app.domain.subtitle_alignment import ALIGNMENT_MODES, propose_alignment, _valid_interval


def conflict_indexes(words):
    active, conflicts = [], set()
    valid = sorted((word["start"], word["end"], index) for index, word in enumerate(words)
                   if type(word.get("start")) in (int, float) and type(word.get("end")) in (int, float)
                   and word["start"] < word["end"])
    for start, end, index in valid:
        active = [(stop, peer) for stop, peer in active if stop > start + .0001]
        if active:
            conflicts.add(index)
            conflicts.update(peer for _, peer in active)
        active.append((end, index))
    return sorted(conflicts)


def compose_refinement(words, aligned, duration, *, methods, **evidence):
    if not methods or len(methods) > 8 or len({method["mode"] for method in methods}) != len(methods):
        raise ValueError("Chọn phương pháp không trùng nhau.")
    if any(method["mode"] not in ALIGNMENT_MODES for method in methods):
        raise ValueError("Phương pháp không hợp lệ.")
    original = propose_alignment(words, aligned, duration, mode="diagnose", **evidence)
    working = deepcopy(words)
    histories = [[] for _ in words]
    stages = []
    for method in methods:
        mode = method["mode"]
        result = propose_alignment(working, aligned, duration, mode=mode,
            start_offset=method.get("start_offset_ms", 0) / 1000,
            end_offset=method.get("end_offset_ms", 0) / 1000, **evidence)
        changed = 0
        for row in result["rows"]:
            if row["status"] == "locked" or mode == "diagnose":
                continue
            before, after = row["before"], row["after"]
            if before == after or after["start"] is None or after["end"] is None:
                continue
            amount = method.get("strength", 100) / 100
            limit = method.get("max_move_ms", 2000) / 1000
            candidate = {edge: round(before[edge] + max(-limit, min(limit, (after[edge] - before[edge]) * amount)), 6)
                         for edge in ("start", "end")}
            if not _valid_interval((candidate["start"], candidate["end"]), duration):
                continue
            index = row["index"]
            if candidate != before:
                working[index].update(candidate)
                histories[index].extend(row["reasons"])
                changed += 1
        stages.append({"mode": mode, "changed": changed,
                       "estimatedStartOffsetMs": result["diagnostics"]["estimatedStartOffsetMs"],
                       "estimatedEndOffsetMs": result["diagnostics"]["estimatedEndOffsetMs"]})
    collisions = conflict_indexes(working)
    for row, word, history in zip(original["rows"], working, histories):
        bounds = {edge: word.get(edge) for edge in ("start", "end")}
        if bounds != row["before"]:
            row.update(after=bounds, method="pipeline", status="review" if row["index"] in collisions else "ready",
                       reasons=list(dict.fromkeys(history)))
    original["summary"] = {status: sum(row["status"] == status for row in original["rows"])
                           for status in ("ready", "review", "locked", "unchanged")}
    original["diagnostics"].update(mode="pipeline", stages=stages, conflictIndexes=collisions,
        changedWords=sum(row["before"] != row["after"] for row in original["rows"]))
    return original
