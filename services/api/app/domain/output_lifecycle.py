"""Shared Session/Version recycle policy; adapters own artifact and job checks."""
import copy
from datetime import datetime, timezone
from uuid import uuid4


def normalize_recycle(book):
    entries = []
    for item in book.get("recycle", []):
        if "snapshot" in item:
            entries.append(item)
        else:
            entries.append({"id": item["id"], "name": item["name"],
                "kind": "session" if "versions" in item else "version",
                "deletedAt": datetime.now(timezone.utc).isoformat(), "snapshot": item, "index": 0})
    book["recycle"] = entries
    return book


def find_slot(book, slot_id):
    for session in book["sessions"]:
        if session["id"] == slot_id:
            return None, session
        for version in session["versions"]:
            if version["id"] == slot_id:
                return session, version
    raise KeyError(slot_id)


def slot_versions(slot):
    return slot.get("versions", [slot])


def recycle_slot(book, slot_id):
    normalize_recycle(book)
    parent, target = find_slot(book, slot_id)
    siblings = parent["versions"] if parent else book["sessions"]
    entry = {"id": target["id"], "name": target["name"], "kind": "version" if parent else "session",
        "deletedAt": datetime.now(timezone.utc).isoformat(), "snapshot": copy.deepcopy(target), "index": siblings.index(target)}
    if parent:
        entry.update(parentSessionId=parent["id"], parentSessionName=parent["name"])
    book["recycle"].append(entry)
    siblings.remove(target)
    if book.get("activeVersionId") not in {v["id"] for s in book["sessions"] for v in s["versions"]}:
        book["activeSessionId"], book["activeVersionId"] = None, None
    return entry


def recycled_entry(book, slot_id):
    normalize_recycle(book)
    return next((item for item in book["recycle"] if item["id"] == slot_id), None)


def restore_slot(book, slot_id):
    entry = recycled_entry(book, slot_id)
    if entry is None:
        raise KeyError(slot_id)
    target = copy.deepcopy(entry["snapshot"])
    if entry["kind"] == "session":
        existing = next((s for s in book["sessions"] if s["id"] == target["id"]), None)
        if existing:
            existing["versions"] = [*target["versions"], *[v for v in existing["versions"] if v["id"] not in {x["id"] for x in target["versions"]}]]
        else:
            book["sessions"].insert(min(entry.get("index", 0), len(book["sessions"])), target)
    else:
        parent_id = entry.get("parentSessionId") or uuid4().hex
        parent = next((s for s in book["sessions"] if s["id"] == parent_id), None)
        if parent is None:
            parent = {"id": parent_id, "name": entry.get("parentSessionName") or "Recovered Session", "versions": []}
            book["sessions"].append(parent)
        if any(v["id"] == target["id"] for s in book["sessions"] for v in s["versions"]):
            raise ValueError("Version đã được khôi phục.")
        parent["versions"].insert(min(entry.get("index", 0), len(parent["versions"])), target)
    book["recycle"].remove(entry)
    return target


def output_ids(slot):
    ids = set()
    for version in slot_versions(slot):
        state = version.get("state", {})
        ids.update(state.get("ownedOutputIds", []))
        if state.get("outputId") or version.get("outputId"):
            ids.add(state.get("outputId") or version["outputId"])
        ids.update(clip["outputId"] for layer in (state.get("composition") or {}).get("layers", []) for clip in layer["clips"])
    return ids


def recycled_output_ids(book):
    normalize_recycle(book)
    live = set().union(*(output_ids(s) for s in book["sessions"])) if book["sessions"] else set()
    recycled = set().union(*(output_ids(e["snapshot"]) for e in book["recycle"])) if book["recycle"] else set()
    return recycled - live
