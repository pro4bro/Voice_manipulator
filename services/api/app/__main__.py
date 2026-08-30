from __future__ import annotations

from copy import deepcopy

import uvicorn
from uvicorn.config import LOGGING_CONFIG


def timestamped_logging_config() -> dict:
    config = deepcopy(LOGGING_CONFIG)
    config["formatters"]["default"].update(
        {"fmt": "%(asctime)s | %(levelprefix)s%(message)s", "datefmt": "%Y-%m-%d %H:%M:%S"}
    )
    config["formatters"]["access"].update(
        {"fmt": '%(asctime)s | %(levelprefix)s%(client_addr)s - "%(request_line)s" %(status_code)s', "datefmt": "%Y-%m-%d %H:%M:%S"}
    )
    # Successful polls are dropped so the log reads as a record of what happened
    # rather than a record of the UI asking whether anything happened yet.
    config["filters"] = {"quiet_polls": {"()": "app.adapters.activity_logging.QuietPollFilter"}}
    config["handlers"]["access"]["filters"] = ["quiet_polls"]
    # Its own stdout handler: uvicorn's "default" handler writes to stderr, which
    # would scatter the record of what a job did across a second file.
    config["handlers"]["activity"] = {
        "formatter": "default",
        "class": "logging.StreamHandler",
        "stream": "ext://sys.stdout",
    }
    config["loggers"]["pro4bro.activity"] = {
        "handlers": ["activity"],
        "level": "INFO",
        "propagate": False,
    }
    return config


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=18120, reload=False, log_config=timestamped_logging_config())
