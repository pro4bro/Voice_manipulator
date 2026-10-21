"""MuseTalk 1.5 primitives with reviewed per-frame face selection.

No upstream files are patched. No native first-face detector/shell runner is used.
Output is a CFR25 composition, plus source/placed derivatives when requested.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

from lipsync_worker import Faces, match_identity


def command(args):
    subprocess.run([str(arg) for arg in args], check=True, stdin=subprocess.DEVNULL)


def render(request, project, root, job):
    import cv2
    import numpy as np
    import torch
    sys.path.insert(0, str(root / ".runtime/engines/lipsync/MuseTalk"))
    from transformers import WhisperModel
    from musetalk.models.vae import VAE
    from musetalk.models.unet import UNet, PositionalEncoding
    from musetalk.utils.audio_processor import AudioProcessor
    from musetalk.utils.face_parsing import FaceParsing
    from musetalk.utils.blending import get_image

    if not torch.cuda.is_available():
        raise ValueError("MuseTalk adapter cần CUDA")
    params = request["engine"]["parameters"]
    device = torch.device(f"cuda:{params.get('gpu_id', 0)}")
    torch.cuda.set_device(device)
    models, fps = root / ".runtime/lipsync-models", 25
    dtype = torch.float16 if params.get("use_float16") else torch.float32
    vae = VAE(str(models / "sd-vae"))
    vae.vae.to(device=device, dtype=dtype).eval()
    unet = UNet(str(models / "musetalk/musetalkV15/musetalk.json"), str(models / "musetalk/musetalkV15/unet.pth"), device=device)
    unet.model.to(device=device, dtype=dtype).eval()
    pe = PositionalEncoding(384).to(device=device, dtype=dtype)
    whisper = WhisperModel.from_pretrained(str(models / "whisper"), local_files_only=True).to(device=device, dtype=dtype).eval()
    processor = AudioProcessor(str(models / "whisper"))

    class LocalFaceParsing(FaceParsing):
        def model_init(self):
            return super().model_init(str(models / "face-parse-bisent/resnet18-5c106cde.pth"), str(models / "face-parse-bisent/79999_iter.pth"))

    parser = LocalFaceParsing(left_cheek_width=params.get("left_cheek_width", 90), right_cheek_width=params.get("right_cheek_width", 90))
    faces = Faces(models)
    ffmpeg = root / ".tools/ffmpeg/ffmpeg.exe"
    patches = job / "patches"
    patches.mkdir(exist_ok=True)
    document, tasks = request["composition"], request["tasks"]
    applied, skipped, patch_map = 0, 0, {}
    timeline_zero = torch.tensor([0], device=device)
    # Whole generated audio retains Whisper context at turn boundaries.
    features, length = processor.get_audio_feature(str(project / request["audio"]["path"]))
    with torch.inference_mode():
        chunks = processor.get_whisper_chunk(features, device, dtype, whisper, length, fps=fps,
            audio_padding_length_left=params.get("audio_padding_length_left", 2), audio_padding_length_right=params.get("audio_padding_length_right", 2))
        del whisper
        torch.cuda.empty_cache()
        # Group concurrent turns so multiple correctly bound faces can be applied.
        scheduled = {}
        for task in tasks:
            for index in range(math.ceil(task["timelineStart"] * fps - 1e-7), math.ceil(task["timelineEnd"] * fps - 1e-7)):
                scheduled.setdefault((task["clipId"], index), []).append(task)
        cap = None
        current_asset = None
        pending = []
        frames = {}
        batch_size = int(params.get("batch_size", 8))

        def flush():
            nonlocal applied
            if not pending:
                return
            for begin in range(0, len(pending), batch_size):
                batch = pending[begin:begin + batch_size]
                latents = torch.cat([item[2] for item in batch])
                audio_features = torch.stack([chunks[item[3]] for item in batch])
                predicted = unet.model(latents, timeline_zero, encoder_hidden_states=pe(audio_features)).sample
                generated = vae.decode_latents(predicted)
                for (key, box, _, _), image in zip(batch, generated):
                    x1, y1, x2, y2 = box
                    image = cv2.resize(image, (x2 - x1, y2 - y1))
                    frames[key] = get_image(frames[key], image, box, mode=params.get("parsing_mode", "jaw"), fp=parser)
                    applied += 1
            for (clip_id, index), frame in frames.items():
                path = patches / f"{clip_id}-{index}.png"
                if not cv2.imwrite(str(path), frame):
                    raise ValueError("Không ghi được frame inference")
                patch_map[(clip_id, index)] = path
            print(f"render applied={applied} skipped={skipped}", flush=True)
            pending.clear()
            frames.clear()

        try:
            for (clip_id, frame_index), frame_tasks in sorted(scheduled.items()):
                task = frame_tasks[0]
                asset_id = task["assetId"]
                if current_asset != asset_id:
                    if cap:
                        cap.release()
                    cap = cv2.VideoCapture(str(project / request["sources"][asset_id]["path"]))
                    current_asset = asset_id
                source_time = task["sourceStart"] + frame_index / fps - task["timelineStart"]
                cap.set(cv2.CAP_PROP_POS_MSEC, source_time * 1000)
                ok, frame = cap.read()
                if not ok:
                    raise ValueError("Không đọc được frame cho inference")
                detections = [(row, match_identity(feature, request["observations"], reviewed_only=True)) for row, feature in faces.detect(frame)]
                counts = {}
                for _, identity in detections:
                    counts[identity] = counts.get(identity, 0) + 1
                key = (clip_id, frame_index)
                seen_identities = set()
                for turn in frame_tasks:
                    if turn["faceId"] in seen_identities:
                        continue
                    seen_identities.add(turn["faceId"])
                    matched = [row for row, identity in detections if identity == turn["faceId"] and counts[identity] == 1]
                    if not matched:
                        skipped += 1
                        continue
                    row = matched[0]
                    x, y, w, h = row[:4]
                    # YuNet reviewed-face crop replaces DWPose's first-person crop.
                    margin = params.get("extra_margin", 10)
                    x1, y1 = max(0, int(x)), max(0, int(y))
                    x2, y2 = min(frame.shape[1], int(x + w)), min(frame.shape[0], int(y + h + margin))
                    if x2 - x1 < 16 or y2 - y1 < 16:
                        skipped += 1
                        continue
                    voice_time = turn["voiceStart"] + frame_index / fps - turn["timelineStart"]
                    audio_index = min(len(chunks) - 1, max(0, round(voice_time * fps)))
                    crop = cv2.resize(frame[y1:y2, x1:x2], (256, 256), interpolation=cv2.INTER_LANCZOS4)
                    latents = vae.get_latents_for_unet(crop).to(dtype=dtype)
                    frames[key] = frame
                    pending.append((key, (x1, y1, x2, y2), latents, audio_index))
                if len(pending) >= batch_size:
                    flush()
            flush()
        finally:
            if cap:
                cap.release()
    if not applied:
        raise ValueError("Không có frame có đúng Face ID đã duyệt trong lượt nói; không tạo After")
    # Compose all visible cuts, including untouched frames, against the shared clock.
    clips = document["clips"]
    layer_ids = [layer["id"] for layer in document["layers"] if layer["enabled"]]
    audio = document["audio"]
    duration = max(1, audio["start"] + audio["outPoint"] - audio["inPoint"], *[clip["start"] + clip["outPoint"] - clip["inPoint"] for clip in clips])
    # Establish the canvas from the first actually visible shot, not clip array
    # order (the selected/upper clip may begin much later or be disabled).
    first_time = min((clip["start"] for clip in clips if clip["layerId"] in layer_ids), default=0)
    first_clip = next((active[-1] for layer in layer_ids
                      if (active := [clip for clip in clips if clip["layerId"] == layer and clip["start"] <= first_time < clip["start"] + clip["outPoint"] - clip["inPoint"]])), clips[0])
    first = cv2.VideoCapture(str(project / request["sources"][first_clip["assetId"]]["path"]))
    width, height = int(first.get(cv2.CAP_PROP_FRAME_WIDTH)), int(first.get(cv2.CAP_PROP_FRAME_HEIGHT))
    first.release()
    scale = min(1., 1920 / max(width, height))
    width, height = max(2, int(width * scale) // 2 * 2), max(2, int(height * scale) // 2 * 2)
    caps = {asset_id: cv2.VideoCapture(str(project / item["path"])) for asset_id, item in request["sources"].items()}

    def read_frame(clip, index, source_time):
        patch = patch_map.get((clip["id"], index))
        if patch:
            return cv2.imread(str(patch))
        cap = caps[clip["assetId"]]
        cap.set(cv2.CAP_PROP_POS_MSEC, source_time * 1000)
        ok, image = cap.read()
        if not ok:
            raise ValueError("Thiếu frame khi ghép composition")
        return image

    def encode(path, frame_count, get_frame, start_audio):
        delay = max(0, round((audio["start"] - start_audio) * 1000))
        audio_in = audio["inPoint"] + max(0, start_audio - audio["start"])
        audio_out = audio["outPoint"]
        filter_audio = f"atrim=start={audio_in}:end={audio_out},asetpts=PTS-STARTPTS,adelay={delay}:all=1,apad"
        args = [ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(fps), "-i", "pipe:0",
                "-i", project / request["audio"]["path"], "-map", "0:v", "-map", "1:a", "-af", filter_audio,
                "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", str(frame_count / fps), "-movflags", "+faststart", path]
        with (job / "encode.log").open("ab") as log:
            process = subprocess.Popen([str(a) for a in args], stdin=subprocess.PIPE, stderr=log, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            try:
                for index in range(frame_count):
                    image = get_frame(index)
                    canvas = np.zeros((height, width, 3), np.uint8)
                    if image is not None:
                        ih, iw = image.shape[:2]
                        factor = min(width / iw, height / ih)
                        target_w, target_h = max(1, round(iw * factor)), max(1, round(ih * factor))
                        resized = cv2.resize(image, (target_w, target_h))
                        left, top = (width - target_w) // 2, (height - target_h) // 2
                        canvas[top:top + target_h, left:left + target_w] = resized
                    process.stdin.write(canvas.tobytes())
                process.stdin.close()
                if process.wait() != 0:
                    raise ValueError("FFmpeg không tạo được video")
            except BaseException:
                process.kill()
                process.wait()
                raise

    def composition_frame(index):
        time = index / fps
        for layer in layer_ids:
            active = [clip for clip in clips if clip["layerId"] == layer and clip["start"] <= time < clip["start"] + clip["outPoint"] - clip["inPoint"]]
            if active:
                clip = active[-1]
                return read_frame(clip, index, clip["inPoint"] + time - clip["start"])
        return None

    derivatives = []
    try:
        encode(job / "after.mp4", math.ceil(duration * fps), composition_frame, 0)
        if document["syncScope"]["mode"] != "visible":
            for clip in clips:
                if not any(task["clipId"] == clip["id"] for task in tasks):
                    continue
                cap = caps[clip["assetId"]]
                source_duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / cap.get(cv2.CAP_PROP_FPS)
                start, end = (0, source_duration) if document["syncScope"]["mode"] == "source" else (clip["inPoint"], clip["outPoint"])
                timeline_start = clip["start"] + start - clip["inPoint"]
                path = job / f"source-{clip['id']}.mp4"
                encode(path, math.ceil((end - start) * fps), lambda i: read_frame(clip, round((timeline_start + i / fps) * fps), start + i / fps), timeline_start)
                derivatives.append({"clipId": clip["id"], "sourceStart": start, "sourceEnd": end, "path": path.relative_to(project).as_posix(), "duration": math.ceil((end-start)*fps)/fps})
    finally:
        for cap in caps.values():
            cap.release()
    return {"path": (job / "after.mp4").relative_to(project).as_posix(), "duration": math.ceil(duration * fps) / fps, "fps": fps,
            "width": width, "height": height, "appliedFaces": applied, "skippedFaces": skipped,
            "derivatives": derivatives, "qualityAccepted": False, "adapter": "reviewed-face-offline-v15"}
