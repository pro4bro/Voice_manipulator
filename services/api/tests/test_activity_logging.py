from __future__ import annotations

import logging

from app.adapters.activity_logging import QuietPollFilter


def _record(message: str) -> logging.LogRecord:
    return logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, message, None, None)


def test_successful_polls_are_dropped_from_the_access_log():
    """97% of a real log was these two routes returning 200."""
    quiet = QuietPollFilter()

    assert not quiet.filter(_record('127.0.0.1:1 - "GET /api/system/status HTTP/1.1" 200'))
    assert not quiet.filter(
        _record('127.0.0.1:1 - "GET /api/projects/p/media/diarization-status HTTP/1.1" 200')
    )
    assert not quiet.filter(
        _record('127.0.0.1:1 - "GET /api/projects/p/media/transcription-status HTTP/1.1" 200')
    )


def test_everything_worth_reading_survives():
    quiet = QuietPollFilter()

    # A poll that starts failing is the whole reason to keep watching these routes.
    assert quiet.filter(_record('127.0.0.1:1 - "GET /api/system/status HTTP/1.1" 500'))
    assert quiet.filter(_record('127.0.0.1:1 - "GET /api/system/status HTTP/1.1" 404'))
    # Real work is never a poll.
    assert quiet.filter(_record('127.0.0.1:1 - "POST /api/projects/p/media/import HTTP/1.1" 201'))
    assert quiet.filter(_record('127.0.0.1:1 - "GET /api/projects/p/media HTTP/1.1" 200'))
    # Anything that is not an access line passes through untouched.
    assert quiet.filter(_record("Application startup complete."))
