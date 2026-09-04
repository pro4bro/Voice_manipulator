from __future__ import annotations

import json
import os

import pytest

from app.adapters.gpu_lease import GpuBusy, GpuLease


@pytest.fixture
def lease(tmp_path):
    return GpuLease(tmp_path / "gpu.json")


def test_a_free_gpu_has_no_holder(lease):
    assert lease.available() is True
    assert lease.holder() is None


def test_claiming_it_names_who_took_it(lease):
    holder = lease.acquire("training · run-abc")

    assert holder.label == "training · run-abc"
    assert holder.pid == os.getpid()
    assert lease.available() is False


def test_a_second_claimant_is_refused_and_told_who_has_it(lease):
    lease.acquire("training · run-abc")

    with pytest.raises(GpuBusy) as failure:
        lease.acquire("transcription · asset-1")

    assert "training · run-abc" in str(failure.value)
    assert failure.value.holder.label == "training · run-abc"


def test_releasing_hands_it_back(lease):
    holder = lease.acquire("training")

    assert lease.release(holder.token) is True
    assert lease.available() is True
    assert lease.acquire("transcription").label == "transcription"


def test_only_the_holder_may_release_it(lease):
    """A late release from a finished job must not free somebody else's card."""
    lease.acquire("training")

    assert lease.release("some-other-token") is False
    assert lease.available() is False


def test_a_dead_holder_does_not_keep_the_card(lease, tmp_path):
    """One crashed run must not lock the GPU until a person notices."""
    lease.acquire("training")
    stale = json.loads((tmp_path / "gpu.json").read_text(encoding="utf-8"))
    stale["pid"] = 999_999          # a pid nothing is using
    (tmp_path / "gpu.json").write_text(json.dumps(stale), encoding="utf-8")

    assert lease.holder() is None
    assert lease.acquire("transcription").label == "transcription"


def test_a_half_written_lease_is_not_a_lease(lease, tmp_path):
    """Otherwise a torn write hands the GPU to nobody, permanently."""
    (tmp_path / "gpu.json").write_text('{"token": "abc", "lab', encoding="utf-8")

    assert lease.available() is True


def test_waiting_gives_up_at_the_deadline_rather_than_hanging(lease):
    lease.acquire("training")

    with pytest.raises(GpuBusy):
        lease.acquire("transcription", wait_seconds=0.2, poll=0.05)


def test_a_heartbeat_only_counts_from_the_holder(lease):
    holder = lease.acquire("training")

    assert lease.heartbeat(holder.token) is True
    assert lease.heartbeat("not-the-holder") is False
