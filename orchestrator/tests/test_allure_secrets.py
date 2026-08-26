# -*- coding: utf-8 -*-
"""Секреты не должны утекать в semantic trace-заголовки."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import SECRET_LOG_MASK, DataStream
from core.method_id import render_execution_title


def test_mask_for_log_recursive():
    stream = DataStream()
    stream.set("password", "s3cret!", secret=True)
    stream.set("plain", "ok")
    assert stream.mask_for_log("user:s3cret!") == f"user:{SECRET_LOG_MASK}"
    assert stream.mask_for_log({"p": "s3cret!", "x": 1}) == {"p": SECRET_LOG_MASK, "x": 1}
    assert stream.mask_for_log(["s3cret!", "ok"]) == [SECRET_LOG_MASK, "ok"]
    assert stream.mask_for_log("plain") == "plain"


def test_execution_title_masks_secrets():
    stream = DataStream()
    stream.set("token", "TOPSECRET", secret=True)

    title = render_execution_title(
        "webdriver",
        "send_keys",
        {"strategy": "css", "selector": "#p", "text": "TOPSECRET"},
        mask=stream.mask_for_log,
    )
    assert "TOPSECRET" not in title
    assert SECRET_LOG_MASK.strip() in title


def test_execution_title_masks_sensitive_parameter_by_name():
    title = render_execution_title(
        "http",
        "send",
        {"authorization": "Bearer TOPSECRET"},
    )
    assert "TOPSECRET" not in title
    assert "***" in title
