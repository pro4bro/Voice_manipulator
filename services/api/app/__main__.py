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
    return config


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=18120, reload=False, log_config=timestamped_logging_config())
