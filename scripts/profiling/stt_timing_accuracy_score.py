"""Score explicit, independently heard word anchors; never infer ground truth.

All times use the source clock, not clip-local seconds. Incomplete reviews,
missing model words and lexical corrections remain visible in the result.
Nearest-rank p95 is computed separately for IN and OUT; it is not a VAD proxy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics
import unicodedata


def token(value: str) -> str:
    return "".join(char for char in unicodedata.normalize("NFC", value.casefold())
                   if unicodedata.category(char)[0] in "LN")


def errors(values: list[float]) -> dict | None:
    if not values:
        return None
    ordered = sorted(values)
    return {"count": len(values), "mean": statistics.mean(values),
            "median": statistics.median(values),
            "p90": ordered[math.ceil(.90 * len(values)) - 1],
            "p95": ordered[math.ceil(.95 * len(values)) - 1], "max": ordered[-1]}


def interval(word: dict, case: dict) -> tuple[float, float] | None:
    try:
        if isinstance(word["start"], bool) or isinstance(word["end"], bool):
            return None
        start, end = float(word["start"]), float(word["end"])
    except (KeyError, TypeError, ValueError, OverflowError):
        return None
    if not (math.isfinite(start) and math.isfinite(end)
            and case["startSeconds"] <= start < end <= case["startSeconds"] + case["duration"]):
        return None
    return start, end


def evaluate(protocol: dict, protocol_sha: str, review: dict, variants: dict) -> dict:
    if review.get("protocolSha256") != protocol_sha:
        raise ValueError("Review belongs to a different frozen protocol")
    cases = {case["id"]: case for case in protocol["cases"]}
    targets = {target["id"]: target for target in protocol["targets"]}
    if len(targets) != len(protocol["targets"]):
        raise ValueError("Duplicate target IDs")
    anchors = {}
    for anchor in review.get("anchors", []):
        identity = anchor["id"]
        if identity not in targets or identity in anchors:
            raise ValueError("Unknown or duplicate reviewed target")
        status = anchor.get("status", "unreviewed")
        if status not in ("unreviewed", "heard", "not-spoken", "uncertain"):
            raise ValueError("Unknown anchor review status")
        if status != "unreviewed" and (
            review.get("independentlyHeard") is not True
            or not isinstance(review.get("reviewer"), str)
            or not review["reviewer"].strip()
        ):
            raise ValueError("Independent listening and a reviewer are required")
        if status == "heard" and (
            interval(anchor, cases[targets[identity]["case"]]) is None
            or not all(isinstance(anchor.get(key), (int, float)) and not isinstance(anchor[key], bool)
                       for key in ("start", "end"))
            or not isinstance(anchor.get("text"), str) or not token(anchor["text"])
        ):
            raise ValueError("Invalid independently reviewed interval/text")
        anchors[identity] = anchor
    heard = {key: anchor for key, anchor in anchors.items() if anchor.get("status") == "heard"}
    for case_id in cases:
        # Frozen targets follow source transcript order; sorting by reviewer
        # timestamps would conceal reversed or overlapping acoustic labels.
        ordered = [heard[t["id"]] for t in protocol["targets"]
                   if t["case"] == case_id and t["id"] in heard]
        if any(first["end"] > second["start"] for first, second in zip(ordered, ordered[1:])):
            raise ValueError("Reviewed anchors overlap or reverse source order")
    lexical = [key for key, anchor in heard.items() if token(anchor["text"]) != token(targets[key]["text"])]
    unreviewed = sum(key not in anchors or anchors[key].get("status", "unreviewed") in ("unreviewed", "uncertain") for key in targets)
    not_spoken = [key for key, anchor in anchors.items() if anchor.get("status") == "not-spoken"]
    report = {"targets": len(targets), "heardAnchors": len(heard),
              "unreviewedTargets": unreviewed, "notSpokenIds": not_spoken,
              "lexicalMismatchIds": lexical, "reviewComplete": unreviewed == 0,
              "percentileMethod": "nearest-rank, IN and OUT separately, seconds",
              "variants": {}}
    per_variant = {}
    for name, case_words in variants.items():
        words = {}
        unassigned = 0
        for case_id, records in case_words.items():
            if case_id not in cases:
                raise ValueError("Variant names an unknown case")
            for word in records:
                identity = word.get("id")
                if identity is None:
                    unassigned += 1
                    continue
                if identity in words:
                    raise ValueError("Duplicate model word ID")
                if identity in targets and targets[identity]["case"] != case_id:
                    raise ValueError("Model word assigned to wrong source case")
                words[identity] = word
        rows, missing = {}, []
        for identity, anchor in heard.items():
            word = words.get(identity)
            bounds = interval(word, cases[targets[identity]["case"]]) if word else None
            if bounds is None or identity in lexical or token(str(word.get("text", ""))) != token(anchor["text"]):
                missing.append(identity)
                continue
            rows[identity] = {"id": identity, "startError": abs(bounds[0] - anchor["start"]),
                              "endError": abs(bounds[1] - anchor["end"])}
        starts = errors([row["startError"] for row in rows.values()])
        ends = errors([row["endError"] for row in rows.values()])
        passed = None
        if unreviewed == 0 and heard:
            passed = (not missing and not not_spoken and starts is not None and ends is not None
                      and starts["p95"] <= protocol["budgets"]["humanWordP95Seconds"]
                      and ends["p95"] <= protocol["budgets"]["humanWordP95Seconds"])
        report["variants"][name] = {"matchedAnchors": len(rows), "unmatchedAnchorIds": missing,
                                   "unassignedModelWords": unassigned,
                                   "startError": starts, "endError": ends,
                                   "timingBudgetPassed": passed, "perAnchor": list(rows.values())}
        per_variant[name] = rows
    paired = [identity for identity in heard
              if per_variant and all(identity in rows for rows in per_variant.values())]
    report["pairedAnchorIds"] = paired
    for name, rows in per_variant.items():
        report["variants"][name]["pairedStartError"] = errors([rows[key]["startError"] for key in paired])
        report["variants"][name]["pairedEndError"] = errors([rows[key]["endError"] for key in paired])
    return report


def read_variant(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    cases = data.get("cases", data)
    return {case_id: row["words"] if isinstance(row, dict) else row for case_id, row in cases.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("review", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run = args.run.resolve()
    protocol_path = run / "protocol.json"
    protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
    digest = hashlib.sha256(protocol_path.read_bytes()).hexdigest()
    # Source bindings are validated even for an empty review.
    for case in protocol["cases"]:
        path = (run / case["audioFile"]).resolve()
        if not path.is_relative_to(run) or hashlib.sha256(path.read_bytes()).hexdigest() != case["inputSha256"]:
            raise ValueError("Review audio no longer matches the frozen PCM")
    review = json.loads(args.review.read_text(encoding="utf-8"))
    variants = {name: read_variant(run / f"{name}.json")
                for name in ("native", "edge", "aligned")}
    result = evaluate(protocol, digest, review, variants)
    destination = args.output.resolve()
    if (destination.parent != run or not destination.name.endswith(".scores.json")
            or destination == args.review.resolve()):
        raise ValueError("Score output must be an owned *.scores.json artifact in the run directory")
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"heardAnchors": result["heardAnchors"], "unreviewedTargets": result["unreviewedTargets"],
                      "timingBudgetPassed": {name: row["timingBudgetPassed"] for name, row in result["variants"].items()}}))


if __name__ == "__main__":
    main()
