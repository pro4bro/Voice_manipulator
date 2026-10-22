"""Read only complete Matroska clusters from a file that is still growing.

The scanner walks EBML element boundaries. A byte pattern inside a Block is
never mistaken for a Cluster, and an unknown-size final Cluster is held until
another Segment child arrives or the caller explicitly finalizes the source.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO


EBML = 0x1A45DFA3
SEGMENT = 0x18538067
CLUSTER = 0x1F43B675
SEGMENT_CHILDREN = {
    0x114D9B74,  # SeekHead
    0x1549A966,  # Info
    0x1654AE6B,  # Tracks
    0x1F43B675,  # Cluster
    0x1C53BB6B,  # Cues
    0x1941A469,  # Attachments
    0x1043A770,  # Chapters
    0x1254C367,  # Tags
    # Void and CRC-32 are global elements and may also occur inside a Cluster.
}


@dataclass(frozen=True)
class Element:
    element_id: int
    start: int
    payload: int
    end: int | None


@dataclass(frozen=True)
class Cluster:
    start: int
    end: int
    sha256: str


@dataclass(frozen=True)
class ScanResult:
    header_end: int | None
    committed_end: int
    clusters: tuple[Cluster, ...]
    visible_size: int


def _vint(stream: BinaryIO, limit: int, *, size: bool) -> int | None:
    if stream.tell() >= limit:
        return None
    first = stream.read(1)
    if not first:
        return None
    byte = first[0]
    mask, width = 0x80, 1
    while width <= 8 and not byte & mask:
        mask >>= 1
        width += 1
    if width > (8 if size else 4):
        raise ValueError("Matroska VINT width is invalid")
    if stream.tell() + width - 1 > limit:
        return None
    tail = stream.read(width - 1)
    if len(tail) != width - 1:
        return None
    value = byte & (mask - 1) if size else byte
    for part in tail:
        value = (value << 8) | part
    if size and value == (1 << (7 * width)) - 1:
        return -1
    return value


def _element(stream: BinaryIO, limit: int) -> Element | None:
    start = stream.tell()
    element_id = _vint(stream, limit, size=False)
    if element_id is None:
        return None
    length = _vint(stream, limit, size=True)
    if length is None:
        return None
    payload = stream.tell()
    end = None if length < 0 else payload + length
    if end is not None and end < payload:
        raise ValueError("Matroska element length is invalid")
    return Element(element_id, start, payload, end)


def _digest(stream: BinaryIO, start: int, end: int) -> str:
    digest = hashlib.sha256()
    stream.seek(start)
    remaining = end - start
    while remaining:
        block = stream.read(min(1024 * 1024, remaining))
        if not block:
            raise ValueError("Matroska source changed during scan")
        digest.update(block)
        remaining -= len(block)
    return digest.hexdigest()


def _unknown_cluster_end(stream: BinaryIO, payload: int, limit: int, final: bool) -> int | None:
    stream.seek(payload)
    while stream.tell() < limit:
        child_start = stream.tell()
        child = _element(stream, limit)
        if child is None:
            return None
        if child.element_id in SEGMENT_CHILDREN:
            return child_start
        if child.end is None:
            raise ValueError("Unknown-size nested Matroska Cluster element")
        if child.end > limit:
            return None
        stream.seek(child.end)
    return limit if final else None


def scan_committed(path: Path, *, from_offset: int = 0, final: bool = False,
                   max_clusters: int | None = None) -> ScanResult:
    """Return byte ranges ending at complete Cluster boundaries.

    ``from_offset`` must be a previously returned ``committed_end``. It lets a
    follower avoid rescanning historical clusters on every poll.
    """
    if max_clusters is not None and max_clusters < 1:
        raise ValueError("max_clusters must be positive")
    size = path.stat().st_size
    with path.open("rb") as stream:
        stream.seek(0)
        ebml = _element(stream, size)
        if ebml is None or ebml.element_id != EBML or ebml.end is None:
            raise ValueError("Matroska EBML header is incomplete or invalid")
        if ebml.end > size:
            return ScanResult(None, 0, (), size)
        stream.seek(ebml.end)
        segment = _element(stream, size)
        if segment is None or segment.element_id != SEGMENT:
            raise ValueError("Matroska Segment is incomplete or invalid")
        segment_end = min(size, segment.end) if segment.end is not None else size
        if from_offset and from_offset < segment.payload:
            raise ValueError("Matroska checkpoint precedes Segment payload")
        stream.seek(from_offset or segment.payload)
        header_end: int | None = None
        committed_end = from_offset
        found: list[Cluster] = []
        while stream.tell() < segment_end:
            item = _element(stream, segment_end)
            if item is None:
                break
            if item.element_id == CLUSTER:
                if header_end is None and not from_offset:
                    header_end = item.start
                end = item.end
                if end is None:
                    end = _unknown_cluster_end(stream, item.payload, segment_end, final)
                if end is None or end > size:
                    break
                found.append(Cluster(item.start, end, _digest(stream, item.start, end)))
                committed_end = end
                stream.seek(end)
                if max_clusters is not None and len(found) >= max_clusters:
                    break
            else:
                if item.end is None:
                    raise ValueError("Unknown-size Segment child cannot be skipped safely")
                if item.end > size:
                    break
                stream.seek(item.end)
        if header_end is None and from_offset:
            header_end = from_offset
        return ScanResult(header_end, committed_end, tuple(found), size)


def has_closed_segment(path: Path) -> bool:
    """A seekable Matroska writer seals Segment length when closing the file.

    An idle/paused growing file still has unknown length (or a length past EOF).
    Never infer closure from silence or an unchanged file size alone.
    """
    size = path.stat().st_size
    with path.open("rb") as stream:
        ebml = _element(stream, size)
        if ebml is None or ebml.element_id != EBML or ebml.end is None or ebml.end > size:
            return False
        stream.seek(ebml.end)
        segment = _element(stream, size)
        return bool(segment and segment.element_id == SEGMENT and segment.end == size)


def source_identity(path: Path, header_end: int) -> dict[str, int | str]:
    stat = path.stat()
    with path.open("rb") as stream:
        header_sha256 = _digest(stream, 0, header_end)
    return {
        "device": stat.st_dev, "inode": stat.st_ino,
        "createdNs": getattr(stat, "st_birthtime_ns", None) or stat.st_ctime_ns,
        "headerSha256": header_sha256,
    }


def assert_same_source(path: Path, identity: dict, cursor: int,
                       last_cluster: dict | None = None, *,
                       allow_header_change: bool = False) -> None:
    stat = path.stat()
    if stat.st_size < cursor:
        raise ValueError("MKV source was truncated below its durable cursor")
    if (stat.st_dev, stat.st_ino) != (identity["device"], identity["inode"]):
        raise ValueError("MKV source was replaced; reconnect the new file explicitly")
    with path.open("rb") as stream:
        if not allow_header_change and _digest(stream, 0, int(identity["headerEnd"])) != identity["headerSha256"]:
            raise ValueError("MKV header changed after follow began")
        if last_cluster and _digest(stream, last_cluster["start"], last_cluster["end"]) != last_cluster["sha256"]:
            raise ValueError("Previously committed MKV Cluster was modified")
