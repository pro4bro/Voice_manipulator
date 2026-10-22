"""Provisioning verifies bytes against upstream, not a new receipt of bad bytes."""
import hashlib
import importlib.util
from pathlib import Path

import pytest


@pytest.fixture
def setup_module():
    path = Path(__file__).resolve().parents[3] / "scripts/setup-subtitle-neural.py"
    spec = importlib.util.spec_from_file_location("subtitle_neural_setup", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_download_cannot_relabel_a_corrupt_existing_weight_as_verified(tmp_path, setup_module):
    source = tmp_path / "upstream.bin"
    source.write_bytes(b"verified weights")
    target = tmp_path / "model.bin"
    target.write_bytes(b"truncated")
    expected = hashlib.sha256(source.read_bytes()).hexdigest()
    assert setup_module.download(source.as_uri(), target, expected) == expected
    assert target.read_bytes() == source.read_bytes()


def test_failed_upstream_checksum_preserves_existing_file(tmp_path, setup_module):
    source = tmp_path / "upstream.bin"
    source.write_bytes(b"bad upstream response")
    target = tmp_path / "model.bin"
    target.write_bytes(b"preserve existing")
    with pytest.raises(ValueError, match="checksum"):
        setup_module.download(source.as_uri(), target, "0" * 64)
    assert target.read_bytes() == b"preserve existing"
    assert not target.with_suffix(".bin.download").exists()


def test_small_huggingface_files_use_pinned_git_blob_digest(tmp_path, setup_module):
    source = tmp_path / "config.json"
    source.write_bytes(b'{"rate":16000}')
    target = tmp_path / "download.json"
    # Compute the Git header from actual length: unlike SHA256 of a bare file,
    # Hugging Face blobId hashes Git's object header and content together.
    blob = hashlib.sha1(b"blob " + str(source.stat().st_size).encode() + b"\0" + source.read_bytes()).hexdigest()
    setup_module.download(source.as_uri(), target, git_blob=blob)
    assert target.read_bytes() == source.read_bytes()


def test_no_model_download_without_trusted_digest(tmp_path, setup_module):
    with pytest.raises(ValueError, match="trusted upstream"):
        setup_module.download("https://example.invalid/model", tmp_path / "model")
