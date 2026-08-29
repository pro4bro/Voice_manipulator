from __future__ import annotations

from app.adapters.runtime_status import RuntimeStatus


def test_runtime_log_lines_have_timestamps_without_double_prefixing(tmp_path):
    log_path = tmp_path / "logs" / "service.log"
    log_path.parent.mkdir()
    log_path.write_text(
        "plain legacy line\n2026-08-28 12:00:00 | INFO: already timestamped\ntraceback continuation\n",
        encoding="utf-8",
    )

    result = RuntimeStatus(tmp_path).logs()

    assert "[" in result.text and "] plain legacy line" in result.text
    assert "2026-08-28 12:00:00 | INFO: already timestamped" in result.text
    assert "[2026-08-28 12:00:00] traceback continuation" in result.text
    assert result.text.count("already timestamped") == 1
