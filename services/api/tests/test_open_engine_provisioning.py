import hashlib
import importlib.util
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import threading
import time
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

import pytest


SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "provision-open-engines.py"
SPEC = importlib.util.spec_from_file_location("open_engine_provisioning", SCRIPT)
provisioner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(provisioner)


class FakeResponse:
    def __init__(self, data, headers=None):
        self.data = data
        self.offset = 0
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, size=-1):
        if size < 0:
            result = self.data[self.offset :]
            self.offset = len(self.data)
            return result
        result = self.data[self.offset : self.offset + size]
        self.offset += len(result)
        return result


def git_blob_sha1(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def test_interrupted_download_resumes_verified_revision_with_http_range(tmp_path):
    payload = b"complete model bytes"
    target = tmp_path / "model.bin"
    target.with_name("model.bin.part").write_bytes(payload[:8])
    metadata = {"path": "model.bin", "size": len(payload), "lfs": {"oid": hashlib.sha256(payload).hexdigest()}}
    url = f"{provisioner.HF_BASE}/{provisioner.MODELS['cosyvoice']['repo']}/resolve/{provisioner.MODELS['cosyvoice']['revision']}/model.bin?download=true"
    target.with_name("model.bin.part.json").write_text(
        json.dumps({"url": url, "hash": "sha256:" + hashlib.sha256(payload).hexdigest(), "size": len(payload)}),
        encoding="utf-8",
    )
    def resume(request, timeout):
        assert request.get_header("Range") == "bytes=8-"
        return FakeResponse(payload[8:], {"Content-Range": f"bytes 8-{len(payload)-1}/{len(payload)}"})
    with patch.object(provisioner.urllib.request, "urlopen", side_effect=resume):
        provisioner._download_and_verify(metadata, Path("model.bin"), tmp_path, "cosyvoice")
    assert target.read_bytes() == payload
    assert not target.with_name("model.bin.part").exists()


def test_applio_packaged_snapshot_is_reused_without_claiming_git_origin(tmp_path):
    repo = next(item for item in provisioner.REPOSITORIES if item["name"] == "Applio")
    folder = tmp_path / repo["path"]
    for name in ("rvc/realtime/core.py", "rvc/train/train.py", "LICENSE"):
        path = folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("snapshot")
    result = provisioner.provision_repository(repo, root=tmp_path)
    assert result["revision"] == "snapshot-unverified"
    assert result["originVerified"] is False
    assert len(result["files"]) == 3
    assert {item["path"] for item in result["files"]} == {"rvc/realtime/core.py", "rvc/train/train.py", "LICENSE"}
    assert all(item["hash"].startswith("sha256:") for item in result["files"])


def test_partial_lipsync_checkout_receipt_preserves_other_repositories(tmp_path):
    older = {"name": "CosyVoice", "revision": "a" * 40}
    added = {"name": "MuseTalk", "revision": "b" * 40}
    provisioner._write_receipt([older], None, root=tmp_path)
    provisioner._write_receipt([added], None, root=tmp_path)
    receipt = json.loads((tmp_path / ".runtime" / "open-engines-install.json").read_text(encoding="utf-8"))
    assert {item["name"] for item in receipt["repositories"]} == {"CosyVoice", "MuseTalk"}


def test_lipsync_repositories_use_distinct_ignored_runtime_checkouts():
    repos = {item["name"]: item for item in provisioner.REPOSITORIES}
    assert {repos[name]["path"] for name in ("MuseTalk", "LatentSync", "Wav2Lip")} == {
        ".runtime/engines/lipsync/MuseTalk", ".runtime/engines/lipsync/LatentSync", ".runtime/engines/lipsync/Wav2Lip",
    }


def test_ignored_range_restarts_from_zero_and_verifies_full_hash(tmp_path):
    payload = b"complete model bytes"
    target = tmp_path / "model.bin"
    target.with_name("model.bin.part").write_bytes(payload[:8])
    metadata = {"path": "model.bin", "size": len(payload), "lfs": {"oid": hashlib.sha256(payload).hexdigest()}}
    url = f"{provisioner.HF_BASE}/{provisioner.MODELS['cosyvoice']['repo']}/resolve/{provisioner.MODELS['cosyvoice']['revision']}/model.bin?download=true"
    target.with_name("model.bin.part.json").write_text(
        json.dumps({"url": url, "hash": "sha256:" + hashlib.sha256(payload).hexdigest(), "size": len(payload)}),
        encoding="utf-8",
    )
    calls = []

    def server(request, timeout):
        calls.append(request.get_header("Range"))
        return FakeResponse(payload)

    with patch.object(provisioner.urllib.request, "urlopen", side_effect=server):
        provisioner._download_and_verify(metadata, Path("model.bin"), tmp_path, "cosyvoice")

    assert calls == ["bytes=8-", None]
    assert target.read_bytes() == payload
    assert not target.with_name("model.bin.part").exists()


def test_corrupt_resumed_prefix_fails_final_hash_and_cleans_partial(tmp_path):
    payload = b"complete model bytes"
    target = tmp_path / "model.bin"
    target.with_name("model.bin.part").write_bytes(b"corrupt!")
    metadata = {"path": "model.bin", "size": len(payload), "lfs": {"oid": hashlib.sha256(payload).hexdigest()}}
    url = f"{provisioner.HF_BASE}/{provisioner.MODELS['cosyvoice']['repo']}/resolve/{provisioner.MODELS['cosyvoice']['revision']}/model.bin?download=true"
    target.with_name("model.bin.part.json").write_text(
        json.dumps({"url": url, "hash": "sha256:" + hashlib.sha256(payload).hexdigest(), "size": len(payload)}),
        encoding="utf-8",
    )

    def resume(request, timeout):
        return FakeResponse(payload[8:], {"Content-Range": f"bytes 8-{len(payload)-1}/{len(payload)}"})

    with patch.object(provisioner.urllib.request, "urlopen", side_effect=resume):
        with pytest.raises(provisioner.ProvisionError, match="failed sha256 verification"):
            provisioner._download_and_verify(metadata, Path("model.bin"), tmp_path, "cosyvoice")

    assert not target.with_name("model.bin.part").exists()
    assert not target.with_name("model.bin.part.json").exists()
    assert not target.exists()


def test_transient_download_failure_preserves_partial_and_its_pinned_identity(tmp_path):
    payload = b"complete model bytes"
    target = tmp_path / "model.bin"
    partial = target.with_name("model.bin.part")
    partial.write_bytes(payload[:8])
    metadata = {"path": "model.bin", "size": len(payload), "lfs": {"oid": hashlib.sha256(payload).hexdigest()}}
    url = f"{provisioner.HF_BASE}/{provisioner.MODELS['cosyvoice']['repo']}/resolve/{provisioner.MODELS['cosyvoice']['revision']}/model.bin?download=true"
    identity = {"url": url, "hash": "sha256:" + hashlib.sha256(payload).hexdigest(), "size": len(payload)}
    sidecar = partial.with_name(partial.name + ".json")
    sidecar.write_text(json.dumps(identity), encoding="utf-8")

    with patch.object(provisioner, "_request", side_effect=provisioner.ProvisionError("temporary network failure")):
        with pytest.raises(provisioner.ProvisionError, match="temporary network failure"):
            provisioner._download_and_verify(metadata, Path("model.bin"), tmp_path, "cosyvoice")

    assert partial.read_bytes() == payload[:8]
    assert json.loads(sidecar.read_text(encoding="utf-8")) == identity
    assert not target.exists()


def test_truncated_download_preserves_partial_and_pinned_identity_for_resume(tmp_path):
    complete = b"complete model bytes"
    partial_bytes = complete[:8]
    target = tmp_path / "model.bin"
    metadata = {"path": "model.bin", "size": len(complete),
                "lfs": {"oid": hashlib.sha256(complete).hexdigest()}}

    with patch.object(provisioner, "_request", return_value=FakeResponse(partial_bytes)):
        with pytest.raises(provisioner.ProvisionError, match="truncated.*partial preserved for resume"):
            provisioner._download_and_verify(metadata, Path("model.bin"), tmp_path, "cosyvoice")

    partial = target.with_name("model.bin.part")
    sidecar = target.with_name("model.bin.part.json")
    url = f"{provisioner.HF_BASE}/{provisioner.MODELS['cosyvoice']['repo']}/resolve/{provisioner.MODELS['cosyvoice']['revision']}/model.bin?download=true"
    assert partial.read_bytes() == partial_bytes
    assert json.loads(sidecar.read_text(encoding="utf-8")) == {
        "url": url,
        "hash": "sha256:" + hashlib.sha256(complete).hexdigest(),
        "size": len(complete),
    }
    assert not target.exists()


def test_hash_bytes_supports_lfs_sha256_and_git_blob_sha1():
    data = b"model weights"
    assert provisioner.hash_bytes(data, "sha256") == hashlib.sha256(data).hexdigest()
    assert provisioner.hash_bytes(data, "git-sha1") == git_blob_sha1(data)


def test_model_tree_listing_uses_supported_page_limit_and_follows_next_link():
    next_url = "https://huggingface.co/api/models/test/model/tree/revision?cursor=next"
    requested = []
    responses = iter(
        [
            ([{"type": "file", "path": "first.bin"}], f'<{next_url}>; rel="next"'),
            ([{"type": "file", "path": "second.bin"}], None),
        ]
    )

    def fake_json_url(url):
        requested.append(url)
        return next(responses)

    with patch.object(provisioner, "_read_json_url", side_effect=fake_json_url):
        files = provisioner.list_model_files("cosyvoice")

    query = parse_qs(urlsplit(requested[0]).query)
    assert query == {"recursive": ["true"], "expand": ["true"], "limit": ["50"]}
    assert requested[1] == next_url
    assert [item["path"] for item in files] == ["first.bin", "second.bin"]


def test_model_download_replaces_corrupt_local_file_and_skips_excluded_files(tmp_path):
    model = provisioner.MODELS["cosyvoice"]
    model_root = tmp_path / model["path"]
    payload = b"verified checkpoint contents"
    corrupt = model_root / "model.safetensors"
    corrupt.parent.mkdir(parents=True)
    corrupt.write_bytes(b"corrupt old bytes")
    metadata = [
        {"type": "file", "path": "model.safetensors", "lfs": {"oid": "sha256:" + hashlib.sha256(payload).hexdigest()}},
        {"type": "file", "path": "asset/example.png", "blobId": git_blob_sha1(b"ignored")},
        {"type": "file", "path": "README.md", "blobId": git_blob_sha1(b"ignored")},
    ]
    requested = []

    def fake_urlopen(request, timeout):
        requested.append(request.full_url)
        return FakeResponse(payload)

    with patch.object(provisioner, "ROOT", tmp_path), patch.object(provisioner, "list_model_files", return_value=metadata), patch.object(
        provisioner.urllib.request, "urlopen", side_effect=fake_urlopen
    ):
        results = provisioner.provision_model("cosyvoice", root=tmp_path)

    assert corrupt.read_bytes() == payload
    assert len(results) == 1 and results[0]["status"] == "downloaded"
    assert len(requested) == 1 and "model.safetensors" in requested[0]
    assert not list(model_root.rglob("*.part"))
    receipt_path = model_root / provisioner.MODEL_RECEIPT_NAME
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert receipt["modelId"] == model["repo"]
    assert receipt["revision"] == model["revision"]
    assert receipt["files"] == [{
        "path": "model.safetensors",
        "hash": "sha256:" + hashlib.sha256(payload).hexdigest(),
        "size": len(payload),
        "mtimeNs": corrupt.stat().st_mtime_ns,
    }]
    assert not receipt_path.with_name(receipt_path.name + ".part").exists()


def test_model_download_reuses_only_matching_verified_bytes(tmp_path):
    model_root = tmp_path / provisioner.MODELS["vibevoice-streaming"]["path"]
    data = b"shard bytes"
    target = model_root / "weights-00001-of-00008.safetensors"
    target.parent.mkdir(parents=True)
    target.write_bytes(data)
    metadata = [{"type": "file", "path": target.name, "blobId": git_blob_sha1(data)}]
    with patch.object(provisioner, "ROOT", tmp_path), patch.object(provisioner, "list_model_files", return_value=metadata), patch.object(
        provisioner.urllib.request, "urlopen", side_effect=AssertionError("verified bytes should be reused")
    ):
        result = provisioner.provision_model("vibevoice-streaming", root=tmp_path)
    assert result[0]["status"] == "reused"


def test_parallel_model_downloads_are_bounded_and_failure_writes_no_receipt(tmp_path):
    metadata = [
        {"path": name, "size": 1, "lfs": {"oid": hashlib.sha256(name.encode()).hexdigest()}}
        for name in ("first.bin", "bad.bin", "third.bin", "fourth.bin")
    ]
    active = 0
    peak = 0
    completed = []
    lock = threading.Lock()

    def download(item, relative, model_root, model_id):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.04)
        with lock:
            active -= 1
            completed.append(relative.name)
        if relative.name == "bad.bin":
            raise provisioner.ProvisionError("simulated hash verification failure")
        return {"path": relative.as_posix(), "hash": "sha256:verified", "status": "downloaded"}

    with patch.object(provisioner, "ROOT", tmp_path), patch.object(provisioner, "list_model_files", return_value=metadata), patch.object(
        provisioner, "_download_and_verify", side_effect=download
    ):
        result = provisioner.main(["--model", "cosyvoice", "--download-workers", "2"])

    assert result == 1
    assert peak == 2
    assert set(completed) == {item["path"] for item in metadata}
    assert not (tmp_path / ".runtime" / "open-engines-install.json").exists()


def test_parallel_model_download_results_keep_metadata_order(tmp_path):
    metadata = [{"path": f"{index}.bin", "blobId": git_blob_sha1(str(index).encode())} for index in range(3)]

    def download(item, relative, model_root, model_id):
        time.sleep({"0.bin": 0.04, "1.bin": 0.0, "2.bin": 0.01}[relative.name])
        data = relative.stem.encode()
        target = model_root.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {"path": relative.as_posix(), "hash": "git-sha1:" + git_blob_sha1(data), "status": "downloaded"}

    with patch.object(provisioner, "list_model_files", return_value=metadata), patch.object(
        provisioner, "_download_and_verify", side_effect=download
    ):
        results = provisioner.provision_model("cosyvoice", root=tmp_path, download_workers=3)

    assert [item["path"] for item in results] == ["0.bin", "1.bin", "2.bin"]
    model_root = tmp_path / provisioner.MODELS["cosyvoice"]["path"]
    receipt = json.loads((model_root / provisioner.MODEL_RECEIPT_NAME).read_text(encoding="utf-8"))
    assert [item["path"] for item in receipt["files"]] == ["0.bin", "1.bin", "2.bin"]


def test_model_download_emits_expected_size_periodic_rate_and_verified_progress(tmp_path, capsys):
    data = b"abc"
    model_root = tmp_path / "model"
    metadata = {"path": "tiny.bin", "size": len(data), "lfs": {"oid": "sha256:" + hashlib.sha256(data).hexdigest()}}
    with patch.object(provisioner, "_request", return_value=FakeResponse(data)), patch.object(
        provisioner.time, "monotonic", side_effect=[0.0, 6.0, 12.0]
    ):
        result = provisioner._download_and_verify(metadata, provisioner.PurePosixPath("tiny.bin"), model_root, "cosyvoice")

    output = capsys.readouterr().out
    assert "Downloading tiny.bin (3 bytes)" in output
    assert "Progress tiny.bin: 3 bytes / 3 bytes (100.0%)" in output
    assert "MiB/s" in output
    assert "Verified tiny.bin (3 bytes; sha256)" in output
    assert result["status"] == "downloaded"


def test_model_download_rejects_traversal_before_fetching(tmp_path):
    bad = [{"type": "file", "path": "../outside.bin", "blobId": git_blob_sha1(b"x")}]
    with patch.object(provisioner, "list_model_files", return_value=bad), patch.object(
        provisioner.urllib.request, "urlopen", side_effect=AssertionError("must reject before fetching")
    ):
        with pytest.raises(provisioner.ProvisionError, match="Unsafe model path"):
            provisioner.provision_model("cosyvoice", root=tmp_path)


def test_existing_repository_with_wrong_origin_fails_without_clone_or_reset(tmp_path):
    repo = provisioner.REPOSITORIES[0]
    destination = tmp_path / repo["path"]
    (destination / ".git").mkdir(parents=True)
    calls = []

    class Result:
        stdout = "https://example.com/wrong.git\n"

    def fake_run(args, **kwargs):
        calls.append(args)
        return Result()

    with patch.object(provisioner, "subprocess") as subprocess_mock:
        subprocess_mock.run.side_effect = fake_run
        with pytest.raises(provisioner.ProvisionError, match="Wrong origin"):
            provisioner.provision_repository(repo, root=tmp_path)
    assert len(calls) == 1
    assert "clone" not in calls[0] and "reset" not in calls[0]


def test_failed_clone_preserves_racing_checkout_contents_for_inspection(tmp_path):
    repo = provisioner.REPOSITORIES[1]
    destination = tmp_path / repo["path"]
    sentinel = destination / "racing-checkout.txt"

    def competing_clone(_args):
        sentinel.parent.mkdir(parents=True, exist_ok=True)
        sentinel.write_text("created by concurrent clone", encoding="utf-8")
        raise provisioner.ProvisionError("git clone failed")

    with patch.object(provisioner, "_run_git", side_effect=competing_clone):
        with pytest.raises(provisioner.ProvisionError, match="inspect any partial checkout") as error:
            provisioner.provision_repository(repo, root=tmp_path)

    assert str(destination) in str(error.value)
    assert sentinel.read_text(encoding="utf-8") == "created by concurrent clone"


def test_existing_cosyvoice_checkout_requires_initialized_pinned_submodules(tmp_path):
    repo = provisioner.REPOSITORIES[0]
    destination = tmp_path / repo["path"]
    (destination / ".git").mkdir(parents=True)
    outputs = iter([repo["url"], "a" * 40, "-" + "b" * 40 + " submodule/path"])

    class Result:
        def __init__(self, stdout):
            self.stdout = stdout

    with patch.object(provisioner.subprocess, "run", side_effect=lambda *_args, **_kwargs: Result(next(outputs))):
        with pytest.raises(provisioner.ProvisionError, match="Submodules are missing"):
            provisioner.provision_repository(repo, root=tmp_path)


def test_repository_receipt_is_atomic_json_for_verified_results(tmp_path):
    entry = {"name": "CosyVoice", "path": ".runtime/engines/research/CosyVoice", "origin": "https://github.com/QwenAudio/CosyVoice.git", "revision": "a" * 40}
    with patch.object(provisioner, "ROOT", tmp_path):
        provisioner._write_receipt([entry], None, root=tmp_path)
    receipt = json.loads((tmp_path / ".runtime/open-engines-install.json").read_text(encoding="utf-8"))
    assert receipt["repositories"] == [entry]
    assert not (tmp_path / ".runtime/open-engines-install.json.part").exists()


def test_concurrent_model_receipts_merge_without_losing_either_model(tmp_path):
    models = {
        "cosyvoice": [{"path": "a.bin", "hash": "sha256:" + "a" * 64, "status": "downloaded"}],
        "vibevoice-streaming": [{"path": "b.bin", "hash": "git-sha1:" + "b" * 40, "status": "downloaded"}],
    }

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda item: provisioner._write_receipt(None, {item[0]: item[1]}, root=tmp_path), models.items()))

    receipt = json.loads((tmp_path / ".runtime/open-engines-install.json").read_text(encoding="utf-8"))
    assert set(receipt["models"]) == set(models)
