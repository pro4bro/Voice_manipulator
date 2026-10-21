"""Scope compilation on the composition clock. No detection/inference runs here."""


def coverage(document, assets, scope, purpose="detection"):
    enabled = {layer.id for layer in document.layers if layer.enabled}
    eligible = enabled if scope.mode == "visible" else {layer.id for layer in document.layers}
    all_layers = scope.all_layers if scope.all_layers is not None else not scope.layer_ids
    selected = eligible if all_layers else set(scope.layer_ids) & eligible
    layers = {layer.id: index for index, layer in enumerate(document.layers)}
    active = [(index, clip) for index, clip in enumerate(document.clips) if clip.layer_id in eligible]
    result = []

    def append(clip, start, end):
        if end <= start + 1e-8:
            return
        source_start = clip.in_point + start - clip.start
        part = dict(clipId=clip.id, assetId=clip.asset_id, layerId=clip.layer_id,
                    timelineStart=start, timelineEnd=end, sourceStart=source_start,
                    sourceEnd=source_start + end - start)
        if result and result[-1]["clipId"] == clip.id and abs(result[-1]["timelineEnd"] - start) < 1e-7:
            result[-1].update(timelineEnd=end, sourceEnd=part["sourceEnd"])
        else:
            result.append(part)

    if scope.mode == "source":
        for _, clip in active:
            if clip.layer_id not in selected:
                continue
            duration = assets[clip.asset_id].duration
            lo = scope.range.start if scope.range else 0
            hi = min(duration, scope.range.end) if scope.range else duration
            if hi > lo:
                append(clip, clip.start + lo - clip.in_point, clip.start + hi - clip.in_point)
                result[-1].update(sourceStart=lo, sourceEnd=hi)
        if purpose == "detection":
            # Full-source detection does not depend on an occurrence's audio clock.
            unique = {}
            for part in result:
                key = (part["assetId"], part["sourceStart"], part["sourceEnd"])
                if key not in unique:
                    unique[key] = {**part, "timelineStart": None, "timelineEnd": None, "occurrences": []}
                unique[key]["occurrences"].append(part["clipId"])
            return list(unique.values())
        return result
    lo, hi = (scope.range.start, scope.range.end) if scope.range else (0, float("inf"))
    if scope.mode == "placed":
        for _, clip in active:
            if clip.layer_id in selected:
                append(clip, max(lo, clip.start), min(hi, clip.start + clip.out_point - clip.in_point))
        return result
    edges = sorted({value for _, clip in active for value in (max(lo, clip.start), min(hi, clip.start + clip.out_point - clip.in_point)) if lo <= value <= hi})
    for start, end in zip(edges, edges[1:]):
        middle = (start + end) / 2
        candidates = [(index, clip) for index, clip in active if clip.start <= middle < clip.start + clip.out_point - clip.in_point]
        if not candidates:
            continue
        _, top = min(candidates, key=lambda item: (layers[item[1].layer_id], -item[0]))
        if top.layer_id in selected:
            append(top, start, end)
    return result
