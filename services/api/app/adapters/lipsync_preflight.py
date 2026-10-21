import hashlib
import json
from datetime import datetime, timezone
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.lipsync_coverage import coverage
from app.domain.lipsync_preflight import speech_intersections, conflicting_source_anchors, needs_more_detection
from app.domain.lipsync_settings import resolve_lipsync_settings


def digest_file(path):
    before = path.stat()
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError("Source thay đổi trong lúc kiểm tra; thử lại.")
    return {"sha256": digest.hexdigest(), "bytes": after.st_size}


def prepare_lipsync(store, project_id, document):
    if store.get(project_id) != document:
        raise ScriptRevisionConflict("Lưu bố cục hiện tại trước khi tạo kế hoạch xử lý.")
    assets = store.validate_sources(project_id, document)
    detection = coverage(document, assets, document.detection_scope)
    sync = coverage(document, assets, document.sync_scope, "sync")
    output = store.outputs.get(project_id, document.audio.output_id) if document.audio else None
    tasks = speech_intersections(document, sync, output)
    blockers = ["Preflight nguồn chưa kèm bản duyệt Face ID. Chọn bản phân tích ở khung nhận diện để kiểm tra lịch render."]
    if not detection:
        blockers.append("Phạm vi nhận diện không có video.")
    if not sync:
        blockers.append("Phạm vi LipSync không có video.")
    if not output:
        blockers.append("Chưa chọn Voice Output.")
    elif not output.segments:
        blockers.append("Voice Output chưa có timing lượt thoại; không đoán người nói.")
    if not tasks:
        blockers.append("Không có lượt thoại có Speaker Profile giao với video đã chọn.")
    if needs_more_detection(tasks, detection):
        blockers.append("Có đoạn LipSync nằm ngoài phạm vi nhận diện. Mở rộng phạm vi nhận diện hoặc thu hẹp LipSync.")
    if document.sync_scope.mode == "source" and conflicting_source_anchors(tasks):
        blockers.append("Cùng source/time có audio khác nhau ở nhiều clip. Chọn từng clip hoặc dùng chế độ clip đã đặt.")
    engine = store.catalog.get(document.engine_id) if document.engine_id else None
    resolved = resolve_lipsync_settings(engine, document.engine_settings.get(engine.id, {})) if engine else None
    if not engine or not engine.available:
        blockers.append(engine.status if engine else "Chưa chọn engine LipSync.")
    if engine and engine.engine == "wav2lip":
        blockers.append("Wav2Lip public chỉ dành cho mục đích cá nhân/nghiên cứu/học thuật theo README.")
    used = {part["assetId"] for part in detection + sync}
    inputs = [{"assetId": asset_id, **digest_file(store.media.resolve_video_path(project_id, asset_id))} for asset_id in sorted(used)]
    audio = {"outputId": output.id, **digest_file(store.outputs.audio_path(project_id, output.id)),
             "metadataSha256": hashlib.sha256(output.model_dump_json(by_alias=True).encode()).hexdigest()} if output else None
    packet = {"kind": "lipsync-preflight", "executed": False, "readyForRender": False,
              "composition": document.model_dump(by_alias=True), "inputs": inputs, "audio": audio,
              "engine": resolved, "detection": detection, "sync": sync, "speechCandidates": tasks,
              "blockers": blockers}
    canonical = json.dumps(packet, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    plan_id = hashlib.sha256(canonical.encode()).hexdigest()
    packet.update(id=plan_id, createdAt=datetime.now(timezone.utc).isoformat())
    with store._lock:
        if store.get(project_id) != document:
            raise ScriptRevisionConflict("Bố cục đã đổi trong lúc kiểm tra; tạo lại kế hoạch.")
        FileProjectRepository._atomic_write(store.jobs_root(project_id) / f"preflight-{plan_id}.json", json.dumps(packet, ensure_ascii=False, indent=2))
    return packet
