# -*- coding: utf-8 -*-
"""LIVE-SUMMARY-TREND-MEMORY: тренд больших объёмов не роняет live-shell.

- `handle_get_trend` считает totals скалярно (SQL) и ограничивает по-прогонный
  ряд капом (нет материализации тысяч строк → нет OOM при json.dumps);
- `_serve_summary_trend` честно отвечает 500 при сбое кодирования/памяти и
  остаётся живым (не падает); повторные отказы не «залипают».
- эндпоинт определён/диспатчится ровно один раз (нет дубля-тени).
"""
from __future__ import annotations

import inspect
from datetime import datetime, timedelta, timezone


def _fresh_models_db(tmp_path, monkeypatch):
    from models import db as dbmod

    monkeypatch.setenv("PK_DATABASE_URL", f"sqlite:///{(tmp_path / 'pk.db').as_posix()}")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'pk.db').as_posix()}")
    monkeypatch.setattr(dbmod, "_engine", None, raising=False)
    monkeypatch.setattr(dbmod, "_SessionLocal", None, raising=False)


def _seed_runs(count: int, *, days: int = 10):
    from api.runs_api import _ensure_tables
    from models.db import get_session
    from models.run_record import RunRecord

    _ensure_tables()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    s = get_session()
    try:
        rows = []
        for i in range(count):
            rows.append(
                RunRecord(
                    id=f"r{i:08d}",
                    status=("succeeded", "failed", "cancelled")[i % 3],
                    findings_count=(i % 5),
                    finished_at=now - timedelta(hours=i % (days * 24)),
                    created_at=now - timedelta(hours=i % (days * 24)),
                )
            )
        s.add_all(rows)
        s.commit()
    finally:
        s.close()


def test_trend_large_input_is_bounded(tmp_path, monkeypatch):
    _fresh_models_db(tmp_path, monkeypatch)
    _seed_runs(5000)

    from api.runs_api import handle_get_trend

    data = handle_get_trend(days=30)
    assert data["ok"] is True
    assert data["total_runs"] == 5000
    # по-прогонный ряд ограничен капом — не 5000 строк.
    assert len(data["by_day"]) <= data["by_day_limit"] == 500
    assert data["by_day_truncated"] is True
    # форма прежняя (совместимость с UI).
    assert all({"date", "status", "findings"} <= set(e) for e in data["by_day"])
    assert data["passed"] == sum(1 for i in range(5000) if i % 3 == 0)


def test_trend_days_clamped(tmp_path, monkeypatch):
    _fresh_models_db(tmp_path, monkeypatch)
    from api.runs_api import handle_get_trend

    assert handle_get_trend(days=10**9)["days"] == 365
    assert handle_get_trend(days=0)["days"] == 30  # falsy → дефолт


def test_serve_summary_trend_survives_memory_error(monkeypatch):
    import utils.live_server as ls

    monkeypatch.setattr("api.runs_api.handle_get_trend", lambda **k: {"ok": True, "x": 1})

    def _boom(*a, **k):
        raise MemoryError("simulated")

    monkeypatch.setattr(ls.json, "dumps", _boom)

    captured: list = []

    class _Fake:
        def _json_error(self, code, msg):
            captured.append((code, msg))

    ls._LiveHandler._serve_summary_trend(_Fake(), days=30)
    assert captured and captured[0][0] == 500


def test_serve_summary_trend_survives_encode_type_error(monkeypatch):
    import utils.live_server as ls

    class _Unserializable:
        pass

    monkeypatch.setattr(
        "api.runs_api.handle_get_trend", lambda **k: {"ok": True, "bad": _Unserializable()}
    )

    captured: list = []

    class _Fake:
        def _json_error(self, code, msg):
            captured.append((code, msg))

    ls._LiveHandler._serve_summary_trend(_Fake(), days=30)
    assert captured and captured[0][0] == 500


def test_single_trend_method_and_dispatch():
    import utils.live_server as ls

    src = inspect.getsource(ls)
    assert src.count("def _serve_summary_trend") == 1
    assert src.count("/api/summary/trend") == 1


def test_trend_recovers_after_failures(monkeypatch):
    import utils.live_server as ls

    monkeypatch.setattr("api.runs_api.handle_get_trend", lambda **k: {"ok": True})
    real_dumps = ls.json.dumps
    calls = {"n": 0}

    def _flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] <= 2:
            raise MemoryError("boom")
        return real_dumps(*a, **k)

    monkeypatch.setattr(ls.json, "dumps", _flaky)

    events: list = []

    class _Fake:
        def _json_error(self, code, msg):
            events.append(("err", code))

        def send_response(self, code):
            events.append(("ok", code))

        def send_header(self, *a):
            pass

        def _cors_headers(self):
            pass

        def end_headers(self):
            pass

        class wfile:  # noqa: N801 — stub
            @staticmethod
            def write(_b):
                events.append(("written", 1))

    for _ in range(3):
        ls._LiveHandler._serve_summary_trend(_Fake(), days=30)

    assert ("err", 500) in events and ("ok", 200) in events  # два отказа → затем успех
