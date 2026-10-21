"""Host-local runtime readiness; source installation is not model readiness."""
import hashlib
import json
import subprocess
from pathlib import Path

MANIFEST = json.loads((Path(__file__).resolve().parents[1] / "resources/lipsync-models.json").read_text(encoding="utf-8"))
COMPONENTS = {key: list(value["files"]) for key, value in MANIFEST.items()}
MUSE_COMMIT = "0a89dec45a0192b824e3cf4daf96c239440c5ed8"


class LipSyncRuntime:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.python = self.root / ".runtime/lipsync-musetalk-py311/Scripts/python.exe"
        self.models = self.root / ".runtime/lipsync-models"
        self.source = self.root / ".runtime/engines/lipsync/MuseTalk"
        self.ffmpeg = self.root / ".tools/ffmpeg/ffmpeg.exe"
        self.ffprobe = self.root / ".tools/ffmpeg/ffprobe.exe"
        self.worker = self.root / "services/api/app/workers/lipsync_worker.py"

    def report(self, *, analysis=False, verify=False):
        blockers = []
        try:
            probe = json.loads((self.python.parent.parent / "pro4bro-ready.json").read_text(encoding="utf-8"))
            if not analysis and not probe["cuda"]:
                blockers.append("CUDA chưa khả dụng trong runtime MuseTalk")
        except (OSError, ValueError, KeyError):
            blockers.append("Chưa qua kiểm tra import/CUDA của runtime LipSync")
        for path in (self.python, self.ffmpeg, self.ffprobe, self.worker):
            if not path.is_file():
                blockers.append(f"Thiếu {path.name}")
        components = ["yunet", "sface"] if analysis else COMPONENTS
        for component in components:
            try:
                directory = self.models / component
                receipt = json.loads((directory / ".pro4bro-model-receipt.json").read_text(encoding="utf-8"))
                if receipt["modelId"] != MANIFEST[component]["repo"] or receipt["revision"] != MANIFEST[component]["revision"]:
                    raise ValueError("Wrong model revision")
                entries = {entry["path"]: entry for entry in receipt["files"]}
                for name in COMPONENTS[component]:
                    entry = entries[name]
                    if {k: entry[k] for k in ("hash", "size")} != MANIFEST[component]["files"][name]:
                        raise ValueError("Unexpected model digest")
                    path = directory / name
                    stat = path.stat()
                    if stat.st_size != entry["size"] or stat.st_mtime_ns != entry["mtimeNs"]:
                        raise ValueError("Model bytes changed; provision again")
                    if verify:
                        kind, expected = entry["hash"].split(":", 1)
                        digest = hashlib.sha256() if kind == "sha256" else hashlib.sha1()
                        if kind == "git-sha1":
                            digest.update(f"blob {stat.st_size}\0".encode())
                        with path.open("rb") as stream:
                            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                                digest.update(chunk)
                        if digest.hexdigest() != expected:
                            raise ValueError("Model hash mismatch")
            except (OSError, ValueError, KeyError, TypeError):
                blockers.append(f"Chưa có model đã xác minh: {component}")
        if not analysis and not (self.source / "musetalk/models/unet.py").is_file():
            blockers.append("Thiếu source MuseTalk")
        if verify and not analysis:
            try:
                revision = subprocess.check_output(["git", "-C", str(self.source), "rev-parse", "HEAD"], text=True).strip()
                changed = subprocess.check_output(["git", "-C", str(self.source), "status", "--porcelain", "--untracked-files=no"], text=True).strip()
                if revision != MUSE_COMMIT or changed:
                    blockers.append("Source MuseTalk khác bản đã kiểm chứng")
            except (OSError, subprocess.CalledProcessError):
                blockers.append("Không xác minh được Git source MuseTalk")
        return {"ready": not blockers, "engineId": "musetalk-lipsync", "adapter": "reviewed-face-offline-v15",
                "blockers": blockers, "automaticIdentityAccepted": False,
                "supported": {"pipeline": ["offline"], "version": ["v15"]}}
