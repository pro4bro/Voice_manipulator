"""Isolated process entrypoint. Never imported by the API's Python runtime."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


class Faces:
    def __init__(self, models):
        import cv2
        self.cv2 = cv2
        self.detector = cv2.FaceDetectorYN.create(str(models / "yunet/face_detection_yunet_2023mar.onnx"), "", (320, 320), .9, .3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(str(models / "sface/face_recognition_sface_2021dec.onnx"), "")

    def detect(self, frame):
        import numpy as np
        h, w = frame.shape[:2]
        scale = min(1., 960 / max(w, h))
        image = self.cv2.resize(frame, (round(w * scale), round(h * scale))) if scale != 1 else frame
        self.detector.setInputSize((image.shape[1], image.shape[0]))
        _, rows = self.detector.detect(image)
        result = []
        for row in rows if rows is not None else []:
            row = row.copy()
            row[:14] /= scale
            aligned = self.recognizer.alignCrop(frame, row)
            feature = self.recognizer.feature(aligned).reshape(-1)
            feature /= max(float(np.linalg.norm(feature)), 1e-9)
            result.append((row, feature))
        return result


def match_identity(feature, observations, *, reviewed_only=False):
    """Conservative best exemplar per ID; ties remain unassigned."""
    import numpy as np
    scores = {}
    approved = {item["faceId"] for item in observations if item.get("reviewed")}
    for item in observations:
        identity = item.get("faceId")
        # Unreviewed OTHER identities still veto a close/ambiguous match.
        if identity and (not reviewed_only or item.get("reviewed") or identity not in approved):
            score = float(np.dot(feature, item["embedding"]))
            scores[identity] = max(scores.get(identity, -1), score)
    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    if not ordered or ordered[0][1] < .5 or (len(ordered) > 1 and ordered[0][1] - ordered[1][1] < .08):
        return None
    return ordered[0][0] if not reviewed_only or ordered[0][0] in approved else None


def analyze(request, project, models, job):
    import cv2
    faces = Faces(models)
    observations, seen = [], set()
    for part in request["coverage"]:
        asset = request["sources"][part["assetId"]]
        cap = cv2.VideoCapture(str(project / asset["path"]))
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not cap.isOpened() or not math.isfinite(fps) or fps <= 0:
            raise ValueError("Không giải mã được video nguồn")
        try:
            start, end = part["sourceStart"], part["sourceEnd"]
            # Gallery samples at 2Hz; actual rendering re-identifies every frame.
            for sample in range(math.ceil((end - start) * 2)):
                frame_index = round((start + sample * .5) * fps)
                key = (part["assetId"], frame_index)
                if key in seen:
                    continue
                seen.add(key)
                if len(seen) > 20000:
                    raise ValueError("Phạm vi quá dài; chia lượt phân tích nhỏ hơn")
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                ok, frame = cap.read()
                if not ok:
                    raise ValueError("Thiếu frame trong phạm vi nhận diện")
                for index, (row, feature) in enumerate(faces.detect(frame)):
                    identifier = hashlib.sha256(f"{part['assetId']}:{frame_index}:{index}".encode()).hexdigest()[:24]
                    identity = match_identity(feature, observations) or f"face-{len({o['faceId'] for o in observations}) + 1}"
                    x, y, w, h = [int(v) for v in row[:4]]
                    x1, y1, x2, y2 = max(0, x), max(0, y), min(frame.shape[1], x + w), min(frame.shape[0], y + h)
                    thumbnail = job / "faces" / f"{identifier}.jpg"
                    thumbnail.parent.mkdir(parents=True, exist_ok=True)
                    if x2 <= x1 or y2 <= y1 or not cv2.imwrite(str(thumbnail), frame[y1:y2, x1:x2]):
                        raise ValueError("Không lưu được thumbnail khuôn mặt")
                    observations.append({"id": identifier, "assetId": part["assetId"], "time": frame_index / fps,
                        "faceId": identity, "reviewed": False, "bbox": [x1, y1, x2, y2],
                        "score": float(row[-1]), "embedding": feature.tolist(), "thumbnail": thumbnail.relative_to(project).as_posix()})
                print(f"analysis frame={len(seen)} faces={len(observations)}", flush=True)
        finally:
            cap.release()
    return {"observations": observations, "sampledFrames": len(seen), "sampleInterval": .5,
            "detector": "YuNet-2023mar", "recognizer": "SFace-2021dec", "threshold": .5, "margin": .08}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--job", type=Path, required=True)
    args = parser.parse_args()
    request = json.loads((args.job / "request.json").read_text(encoding="utf-8"))
    if request["kind"] == "analysis":
        result = analyze(request, args.project, args.root / ".runtime/lipsync-models", args.job)
    else:
        from lipsync_render import render
        result = render(request, args.project, args.root, args.job)
    write_json(args.job / "result.json", result)


if __name__ == "__main__":
    main()
