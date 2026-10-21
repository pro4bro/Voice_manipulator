import hashlib
import json
from app.adapters.lipsync_runtime import LipSyncRuntime, COMPONENTS, MUSE_COMMIT


def test_readiness_requires_every_receipted_file_and_detects_mutation(tmp_path, monkeypatch):
    pinned = {component: {"repo": f"fixture/{component}", "revision": "fixture", "files": {name: {"size": 7, "hash": "sha256:" + hashlib.sha256(b"fixture").hexdigest()} for name in names}} for component, names in COMPONENTS.items()}
    monkeypatch.setattr("app.adapters.lipsync_runtime.MANIFEST", pinned)
    monkeypatch.setattr("app.adapters.lipsync_runtime.subprocess.check_output", lambda command, **_: MUSE_COMMIT if "rev-parse" in command else "")
    runtime = LipSyncRuntime(tmp_path)
    assert not runtime.report()["ready"]
    for path in (runtime.python, runtime.ffmpeg, runtime.ffprobe, runtime.worker, runtime.source / "musetalk/models/unet.py"):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"fixture")
    for component, names in COMPONENTS.items():
        directory = runtime.models / component
        directory.mkdir(parents=True, exist_ok=True)
        entries = []
        for name in names:
            path = directory / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"fixture")
            entries.append({"path": name, "size": 7, "mtimeNs": path.stat().st_mtime_ns, "hash": "sha256:" + hashlib.sha256(b"fixture").hexdigest()})
        (directory / ".pro4bro-model-receipt.json").write_text(json.dumps({"files": entries, "modelId": f"fixture/{component}", "revision": "fixture"}))
    (runtime.python.parent.parent / "pro4bro-ready.json").write_text(json.dumps({"cuda": True}))
    assert runtime.report(verify=True)["ready"]
    (runtime.models / "sface" / COMPONENTS["sface"][0]).write_bytes(b"changed")
    assert not runtime.report(analysis=True, verify=True)["ready"]
