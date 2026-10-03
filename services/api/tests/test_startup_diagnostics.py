from __future__ import annotations

import logging
import threading

import pytest

from app.adapters.startup_diagnostics import StartupDiagnostics


def test_slow_startup_records_bounded_python_wait_locations(caplog):
    logger = logging.getLogger("test.startup.stalled")
    captured = threading.Event()

    class Evidence(logging.Handler):
        def emit(self, record):
            captured.set()

    evidence = Evidence()
    logger.addHandler(evidence)
    try:
        with caplog.at_level(logging.WARNING), StartupDiagnostics(logger, delay=.02, samples=1):
            assert captured.wait(1)
        records = [r for r in caplog.records if "[startup-stall]" in r.message]
        assert len(records) == 1
        assert "test_slow_startup_records_bounded_python_wait_locations" in records[0].message
        assert "thread=MainThread" in records[0].message
        assert "elapsedSeconds=" in records[0].message
        assert not any(t.name == "pro4bro-startup-watch" for t in threading.enumerate())
    finally:
        logger.removeHandler(evidence)


@pytest.mark.parametrize("terminal", ["Uvicorn running on http://127.0.0.1:18120",
                                     "Application startup failed. Exiting."])
def test_binding_or_startup_failure_cancels_stack_capture(caplog, terminal):
    logger = logging.getLogger("test.startup.finished")
    watchdog = StartupDiagnostics(logger, delay=1)
    with caplog.at_level(logging.INFO), watchdog:
        logger.info(terminal)
        assert watchdog._finished.wait(.2)
    assert "[startup-stall]" not in caplog.text
    assert not watchdog._thread.is_alive()


def test_lifespan_completion_does_not_hide_a_stall_before_binding(caplog):
    logger = logging.getLogger("test.startup.lifespan")
    with caplog.at_level(logging.INFO), StartupDiagnostics(logger, delay=1) as watchdog:
        logger.info("Application startup complete.")
        assert not watchdog._finished.is_set()
    assert not watchdog._thread.is_alive()
