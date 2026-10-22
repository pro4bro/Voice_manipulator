"""Materialize durable Live STT text on archived tracks without inventing word timing."""
import json


def retain_live_script(media, project_id, folder):
    try:
        journal = json.loads((folder / "recording.json").read_text(encoding="utf-8"))
        lines = (folder / "transcript-events.jsonl").read_text(encoding="utf-8").splitlines()
    except (OSError, ValueError):
        return
    utterances = {}
    for line in lines:
        try:
            event = json.loads(line)
        except ValueError:
            break  # an interrupted append must not discard earlier durable speech
        if not event.get("utteranceId"):
            continue
        key = event["channelId"], event["utteranceId"]
        previous = utterances.get(key, {})
        if event.get("revision", 0) <= previous.get("revision", -1):
            continue
        if event.get("status") == "error":
            continue
        utterances[key] = event if event.get("text") or event.get("pending") else previous
    for stem in journal.get("sourceStems", []):
        asset_id = stem.get("assetId")
        if not asset_id:
            continue
        rows = sorted((row for (channel, _), row in utterances.items() if channel == stem["channelId"]),
                      key=lambda row: row.get("startSeconds", 0))
        text = " ".join(" ".join(filter(None, (row.get("text"), row.get("pending")))).strip() for row in rows).strip()
        if not text:
            continue
        with media._lock(project_id):
            try:
                asset = media.get(project_id, asset_id)
            except KeyError:
                continue
            if (asset.deleted_at or asset.disabled or asset.words or asset.text == text or
                    asset.transcription_status in {"queued", "processing", "reviewing", "complete"} or
                    any(revision.source in {"user", "stt", "ai"} for revision in asset.revisions)):
                continue
            media.update_script(project_id, asset_id, text, "record")
