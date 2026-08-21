# -*- coding: utf-8 -*-
"""G-60: авто-имена секретов, locals, diary / ЛогАтаки / playground wire."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.controller import Controller
from core.data_stream import SECRET_LOG_MASK, DataStream
from tools.data_playground import eval_script
from utils import diary_bus


def test_auto_secret_name_on_let():
    stream = DataStream()
    stream.set("password", "qwerty-auto")
    assert stream.is_secret("password")
    assert stream.mask_for_log("x=qwerty-auto") == f"x={SECRET_LOG_MASK}"


def test_auto_secret_login_and_cyrillic():
    stream = DataStream()
    stream.set("login", "admin@bank")
    stream.set("Пароль", "s3cret-ru")
    assert stream.mask_for_log("admin@bank / s3cret-ru") == (
        f"{SECRET_LOG_MASK} / {SECRET_LOG_MASK}"
    )


def test_mask_locals_stack_password_slot():
    stream = DataStream()
    stream.push_locals({"password": "page-slot-secret", "email": "a@b.c"})
    assert stream.is_secret("password")
    assert stream.mask_for_log("typed page-slot-secret") == f"typed {SECRET_LOG_MASK}"
    assert stream.mask_for_log("a@b.c") == "a@b.c"


def test_diary_masks_constructor(monkeypatch):
    published = []

    def fake_publish(kind, text, channel="diary"):
        published.append((channel, kind, text))

    monkeypatch.setattr(diary_bus, "publish", fake_publish)

    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {}
    stream = DataStream()
    stream.set("token", "LEAKME", secret=True)
    ctrl._diary("STEP", "Ввод", "webdriver|send_keys|css|#p|LEAKME", stream=stream)
    assert published
    _ch, _kind, text = published[-1]
    assert "LEAKME" not in text
    assert SECRET_LOG_MASK.strip() in text


def test_log_attack_masks_message(monkeypatch):
    published = []

    def fake_publish(kind, text, channel="diary"):
        published.append((channel, kind, text))

    monkeypatch.setattr(diary_bus, "publish", fake_publish)

    ctrl = Controller.__new__(Controller)
    stream = DataStream()
    stream.set("password", "atk-secret")
    ctrl._publish_log_attack_live(
        {"message": "payload atk-secret"},
        stream=stream,
    )
    assert any(
        ch == "zap" and "atk-secret" not in text and SECRET_LOG_MASK in text
        for ch, _k, text in published
    )


def test_playground_wire_redacts_secret_rhs():
    out = eval_script('Секрет $password = "playground-secret"\n')
    assert out["ok"] is True
    assert out["variables"]["password"] == SECRET_LOG_MASK
    blob = repr(out["steps"])
    assert "playground-secret" not in blob
    assert SECRET_LOG_MASK in blob


def test_explicit_secret_still_works():
    stream = DataStream()
    stream.set("note", "visible", secret=False)
    stream.set("vault", "hidden-val", secret=True)
    assert not stream.is_secret("note")
    assert stream.mask_for_log("hidden-val") == SECRET_LOG_MASK


def test_login_page_slots_mask_username():
    """G-63: page id=login → username/password слоты в mask."""
    stream = DataStream()
    stream.push_locals(
        {"username": "bank-user", "password": "bank-pass", "email": "a@b.c"},
        page_key="login",
    )
    assert stream.mask_for_log("bank-user / bank-pass") == (
        f"{SECRET_LOG_MASK} / {SECRET_LOG_MASK}"
    )
    assert stream.mask_for_log("a@b.c") == "a@b.c"
