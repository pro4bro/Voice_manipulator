from __future__ import annotations

import logging
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.adapters.activity_center import (
    CENTER,
    ActivityCenter,
    ActivityLogHandler,
    LogFileTail,
    source_for,
)
from app.main import create_app
from app.settings import Settings


@pytest.fixture
def center():
    return ActivityCenter(capacity=50)


def messages(center):
    return [(event.message, event.repeat) for event in center.events()]


def test_the_same_line_again_is_counted_where_it_already_is(center):
    """An engine printing one warning per step must not bury the rest of the log."""
    center.log("training", "Bắt đầu")
    for _ in range(129):
        center.log("engine", "UserWarning: DataLoader will create 24 worker processes")
    center.log("training", "Xong")

    assert messages(center) == [
        ("Bắt đầu", 1),
        ("UserWarning: DataLoader will create 24 worker processes", 129),
        ("Xong", 1),
    ]


def test_a_repeat_gets_a_new_sequence_so_a_polling_page_sees_the_count_rise(center):
    center.log("engine", "cùng một dòng")
    first = center.events()[-1].seq
    center.log("engine", "cùng một dòng")

    latest = center.events()[-1]
    assert latest.repeat == 2
    assert latest.seq > first
    assert center.events(after=first) == [latest]


def test_the_same_line_from_two_sources_stays_two_lines(center):
    center.log("stt", "đang nạp model")
    center.log("tts", "đang nạp model")

    assert [event.source for event in center.events()] == ["stt", "tts"]


def test_a_task_runs_moves_and_ends(center):
    task = center.start_task("tts", "Đọc Script · 12 đoạn", fraction=0.0)
    center.update_task(task, detail="Đoạn 3/12", fraction=0.25, eta_seconds=40)

    running = center.tasks()[0]
    assert (running.status, running.detail, running.fraction, running.eta_seconds) == ("running", "Đoạn 3/12", 0.25, 40)

    center.finish_task(task, detail="12 đoạn trong 50 giây")
    done = center.tasks()[0]
    assert (done.status, done.fraction, done.eta_seconds) == ("complete", 1.0, None)
    assert done.seconds is not None
    # Anything after the end is too late to change what happened.
    center.update_task(task, detail="muộn rồi")
    assert center.tasks()[0].detail == "12 đoạn trong 50 giây"


def test_a_failed_task_keeps_its_reason(center):
    task = center.start_task("training", "Training · An")
    center.finish_task(task, status="failed", error="CUDA out of memory")

    assert center.tasks()[0].error == "CUDA out of memory"


@pytest.mark.parametrize(
    ("logger_name", "source"),
    [
        ("pro4bro.training", "training"),
        ("pro4bro.activity", "job"),
        ("app.adapters.voice_changer", "voice-changer"),
        ("app.adapters.engine_worker", "engine"),
        ("uvicorn.access", "api"),
        ("something.else", "app"),
    ],
)
def test_every_logger_lands_under_a_name_a_person_recognises(logger_name, source):
    assert source_for(logger_name) == source


def test_python_logging_reaches_the_stream(center):
    handler = ActivityLogHandler(center)
    logger = logging.getLogger("pro4bro.training.test")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        logger.info("run bắt đầu")
        logger.warning("chậm hơn thường lệ")
    finally:
        logger.removeHandler(handler)

    assert [(event.source, event.level, event.message) for event in center.events()] == [
        ("training", "info", "run bắt đầu"),
        ("training", "warning", "chậm hơn thường lệ"),
    ]


def test_another_process_log_file_is_followed_from_where_it_was(tmp_path, center):
    """The STT sidecar writes to a file; its lines belong in the same stream."""
    path = tmp_path / "studio.log"
    path.write_text("cũ rồi\n", encoding="utf-8")
    tail = LogFileTail([path], center)
    tail.start()
    tail.stop()

    path.write_text("cũ rồi\nINFO loading model large-v3\nERROR không mở được file\n", encoding="utf-8")
    assert tail.read_once() == 2

    assert [(event.level, event.message) for event in center.events()] == [
        ("info", "INFO loading model large-v3"),
        ("error", "ERROR không mở được file"),
    ]


def test_the_endpoint_serves_what_is_running_and_what_was_said(tmp_path):
    CENTER.reset()
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    with TestClient(create_app(settings=settings)) as client:
        task = CENTER.start_task("stt", "Speech to Text · buổi họp", fraction=0.4, detail="40%")
        CENTER.log("stt", "đang nhận dạng")

        first = client.get("/api/activity").json()
        assert [item["label"] for item in first["tasks"]] == ["Speech to Text · buổi họp"]
        assert first["tasks"][0]["fraction"] == 0.4
        assert "đang nhận dạng" in [event["message"] for event in first["events"]]

        CENTER.log("stt", "xong")
        CENTER.finish_task(task)
        later = client.get(f"/api/activity?after={first['seq']}").json()

    assert [event["message"] for event in later["events"]] == ["xong"]
    assert later["tasks"][0]["status"] == "complete"
    CENTER.reset()
