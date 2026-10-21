def speech_intersections(document, parts, output):
    """Candidates for future face binding; a speaker ID is never a face ID."""
    if not document.audio or output is None:
        return []
    audio = document.audio
    result = []
    for part in parts:
        for turn in output.segments:
            if not turn.text.strip() or not turn.speaker_profile_id or turn.end <= turn.start:
                continue
            start = max(part["timelineStart"], audio.start, audio.start + turn.start - audio.in_point)
            end = min(part["timelineEnd"], audio.start + audio.out_point - audio.in_point, audio.start + turn.end - audio.in_point)
            if end <= start + 1e-8:
                continue
            source_start = part["sourceStart"] + start - part["timelineStart"]
            result.append({"clipId": part["clipId"], "assetId": part["assetId"], "layerId": part["layerId"],
                "timelineStart": start, "timelineEnd": end, "sourceStart": source_start,
                "sourceEnd": source_start + end - start, "voiceStart": audio.in_point + start - audio.start,
                "voiceEnd": audio.in_point + end - audio.start, "speakerProfileId": turn.speaker_profile_id,
                "rowId": turn.row_id, "faceId": None, "status": "requires-face-binding"})
    return result


def conflicting_source_anchors(tasks):
    grouped = {}
    for task in tasks:
        grouped.setdefault(task["assetId"], []).append(task)
    for same_source in grouped.values():
        ordered = sorted(same_source, key=lambda item: item["sourceStart"])
        for index, first in enumerate(ordered):
            for second in ordered[index + 1:]:
                if second["sourceStart"] >= first["sourceEnd"] - 1e-7:
                    break
                first_offset = first["voiceStart"] - first["sourceStart"]
                second_offset = second["voiceStart"] - second["sourceStart"]
                if abs(first_offset - second_offset) > 1e-7 or first["speakerProfileId"] != second["speakerProfileId"]:
                    return True
    return False


def needs_more_detection(tasks, detection):
    for task in tasks:
        cursor = task["sourceStart"]
        for part in sorted((p for p in detection if p["assetId"] == task["assetId"]), key=lambda p: p["sourceStart"]):
            if part["sourceEnd"] <= cursor:
                continue
            if part["sourceStart"] > cursor + 1e-7:
                break
            cursor = max(cursor, part["sourceEnd"])
            if cursor >= task["sourceEnd"] - 1e-7:
                break
        if cursor < task["sourceEnd"] - 1e-7:
            return True
    return False
