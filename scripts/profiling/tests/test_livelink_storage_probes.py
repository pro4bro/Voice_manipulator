"""Safety checks for rejected, isolated profiling helpers; not product gates."""
import os
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import livelink_pair_io_probe as pair_probe
import livelink_group_durability as group_probe


def test_raw_pair_handles_short_writes_and_syncs_before_ordered_publication(tmp_path, monkeypatch):
    write, sync, replace = os.write, os.fsync, os.replace
    synced, published = [], []

    def short_write(fd, data):
        return write(fd, data[:3])

    def counted_sync(fd):
        sync(fd)
        synced.append(fd)

    def publish(source, destination):
        assert len(synced) == 2
        published.append(destination.name)
        replace(source, destination)

    monkeypatch.setattr(os, "write", short_write)
    monkeypatch.setattr(os, "fsync", counted_sync)
    monkeypatch.setattr(os, "replace", publish)
    pair_probe.raw_pair(tmp_path / "chunk.pcm", b"pcm-sample-bytes", tmp_path / "chunk.json", b"metadata")
    assert (tmp_path / "chunk.pcm").read_bytes() == b"pcm-sample-bytes"
    assert (tmp_path / "chunk.json").read_bytes() == b"metadata"
    assert published == ["chunk.pcm", "chunk.json"]


def test_raw_pair_failed_sync_publishes_neither_file(tmp_path, monkeypatch):
    sync = os.fsync

    def fail_metadata(fd):
        if os.fstat(fd).st_size == len(b"metadata"):
            raise OSError("metadata flush failed")
        sync(fd)

    monkeypatch.setattr(os, "fsync", fail_metadata)
    with pytest.raises(OSError, match="metadata flush failed"):
        pair_probe.raw_pair(tmp_path / "chunk.pcm", b"pcm-sample-bytes", tmp_path / "chunk.json", b"metadata")
    assert not (tmp_path / "chunk.pcm").exists()
    assert not (tmp_path / "chunk.json").exists()


@pytest.mark.parametrize("widths", [[2, 2], [2, 3], [1]])
def test_group_probe_rejects_invalid_widths_before_creating_output(tmp_path, monkeypatch, widths):
    output = tmp_path / "not-created"
    monkeypatch.setattr(sys, "argv", ["probe", "--output", str(output), "--widths", *map(str, widths)])
    with pytest.raises(ValueError, match="Unique widths"):
        group_probe.main()
    assert not output.exists()


def test_group_probe_cannot_write_inside_original_recording(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["probe", "--output", str(group_probe.SOURCE), "--widths", "1", "2"])
    with pytest.raises(ValueError, match="outside original recording"):
        group_probe.main()
