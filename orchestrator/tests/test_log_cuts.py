# -*- coding: utf-8 -*-
"""LOG-CUT: опции, open/close, auto-close, feed из publish."""
from __future__ import annotations

from pathlib import Path

import pytest

from core.method_id import resolve_call
from utils import log_cuts


@pytest.fixture(autouse=True)
def _clean_cuts(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_RUN_DIR", str(tmp_path))
    log_cuts.clear()
    log_cuts.set_sidecar_providers(browser_logs=None, perf_logs=None)
    yield
    log_cuts.clear()


def test_parse_options_default_and_compound():
    assert log_cuts.parse_options("") == {"security"}
    assert log_cuts.parse_options("security,error") == {"security", "error"}
    assert log_cuts.parse_options("browser") == {
        "session",
        "driver",
        "console",
        "perf",
    }
    assert log_cuts.parse_options("all") == {"all"}


def test_parse_options_unknown():
    with pytest.raises(ValueError, match="неизвестная опция"):
        log_cuts.parse_options("nope")


def test_match_security_and_fuzz():
    opts = {"security"}
    assert log_cuts.match_event({"kind": "ZAP", "text": "scan"}, opts)
    assert log_cuts.match_event({"kind": "ФАЗЗИНГ", "text": "wave"}, opts)
    assert log_cuts.match_event({"kind": "FUZZ", "text": "wave"}, opts)
    assert log_cuts.match_event({"kind": "LOG", "text": "ЛогАтаки | x"}, opts)
    assert not log_cuts.match_event({"kind": "STEP", "text": "Открыть"}, opts)
    assert log_cuts.match_event({"kind": "ФАЗЗИНГ", "text": "x"}, {"fuzz"})


def test_start_end_cut_writes_file(tmp_path):
    path_hint = log_cuts.start_cut("LEGION", "security,error", comment="wave A")
    assert path_hint.name == "LEGION.log"
    log_cuts.feed_event({"kind": "ZAP", "text": "alert high", "ts": 1_700_000_000.0})
    log_cuts.feed_event({"kind": "STEP", "text": "ignored", "ts": 1_700_000_001.0})
    log_cuts.feed_event({"kind": "ERROR", "text": "boom", "ts": 1_700_000_002.0})
    out = log_cuts.end_cut("LEGION")
    text = Path(out).read_text(encoding="utf-8")
    assert "# wave A" in text
    assert "НачатьЛогирование LEGION security,error" in text
    assert "ZAP" in text and "alert high" in text
    assert "ERROR" in text and "boom" in text
    assert "ignored" not in text


def test_auto_close_on_eof(tmp_path):
    log_cuts.start_cut("fuzzing_session", "security")
    log_cuts.feed_event({"kind": "ФАЗЗИНГ", "text": "digest", "ts": 10.0})
    paths = log_cuts.close_all()
    assert len(paths) == 1
    assert paths[0].name == "fuzzing_session.log"
    assert "ФАЗЗИНГ" in paths[0].read_text(encoding="utf-8")
    assert log_cuts.open_cut_names() == []


def test_browser_sidecar(tmp_path):
    log_cuts.set_sidecar_providers(
        browser_logs=lambda: [{"level": "SEVERE", "message": "x"}],
        perf_logs=None,
    )
    log_cuts.start_cut("ui_probe", "browser")
    log_cuts.end_cut("ui_probe")
    side = tmp_path / "log_cuts" / "ui_probe.browser.log"
    assert side.is_file()
    assert "SEVERE" in side.read_text(encoding="utf-8")


def test_method_id_resolve():
    assert resolve_call("НачатьЛогирование LEGION security,error") == (
        "core|start_log_cut|LEGION|security,error"
    )
    assert resolve_call("ОкончитьЛогирование LEGION") == "core|end_log_cut|LEGION"


def test_publish_feeds_open_cut(tmp_path, monkeypatch):
    from utils import diary_bus

    monkeypatch.setattr(diary_bus, "DIARY_NDJSON", tmp_path / "diary.ndjson")
    monkeypatch.setattr(diary_bus, "LIVE_DIR", tmp_path)
    diary_bus.clear()
    log_cuts.start_cut("PACK", "security")
    diary_bus.publish("ZAP", "from publish", channel="zap")
    out = log_cuts.end_cut("PACK")
    assert "from publish" in Path(out).read_text(encoding="utf-8")
