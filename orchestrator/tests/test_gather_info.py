# -*- coding: utf-8 -*-
"""Gather harden: modes / caps / wall (fake WD/ZAP). S3."""
from __future__ import annotations

from utils.gather_info import (
    resolve_gather_caps,
    resolve_gather_mode,
    run_gather_info,
)


class _FakeWd:
    def __init__(self, base_url="http://juice-shop:3000"):
        self.base_url = base_url
        self.opened = []

    def _normalize_url_source(self, source):
        if isinstance(source, (list, tuple)):
            return [str(x).strip() for x in source if str(x).strip()]
        return [ln.strip() for ln in str(source).splitlines() if ln.strip()]

    def _navigate(self, url):
        self.opened.append(url)


class _FakeZap:
    def __init__(self):
        self.bursts = []
        self.stop_all = 0
        self.enable_all = 0

    def spider_scan(self, url=None, timeout_minutes=None, **_kw):
        self.bursts.append(url)
        return 1

    def stop_all_spiders(self):
        self.stop_all += 1

    def enable_all_passive_scanners(self):
        self.enable_all += 1

    def passive_scan_wait_seconds(self, timeout_seconds=60):
        return True


def test_run_gather_info_after_default(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    monkeypatch.delenv("PK_GATHER_BURST_SEC", raising=False)
    wd = _FakeWd()
    zap = _FakeZap()
    summary = run_gather_info(
        wd,
        zap,
        ["/#/login", "/#/register"],
        settle_sec=0,
        spider_sec=30,
        pscan_timeout_sec=10,
    )
    assert summary["mode"] == "after"
    assert summary["urls"] == 2
    assert summary["bursts"] == 1  # one spider after browse
    assert summary["pscan_ok"] is True
    assert len(wd.opened) == 2
    assert zap.bursts == [wd.opened[0]]
    assert zap.enable_all == 1


def test_run_gather_info_interleaved(monkeypatch):
    monkeypatch.delenv("PK_GATHER_BURST_SEC", raising=False)
    wd = _FakeWd()
    zap = _FakeZap()
    summary = run_gather_info(
        wd,
        zap,
        ["/#/login", "/#/register"],
        burst_sec=5,
        settle_sec=0,
        pscan_timeout_sec=10,
        mode="interleaved",
    )
    assert summary["mode"] == "interleaved"
    assert summary["bursts"] == 2
    assert zap.bursts == wd.opened


def test_max_urls_cap(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MAX_URLS", raising=False)
    wd = _FakeWd()
    zap = _FakeZap()
    summary = run_gather_info(
        wd,
        zap,
        ["http://a/1", "http://a/2", "http://a/3"],
        settle_sec=0,
        max_urls=2,
        pscan_timeout_sec=5,
        spider_sec=10,
    )
    assert summary["urls"] == 2
    assert len(wd.opened) == 2


def test_resolve_caps_env(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    monkeypatch.setenv("PK_GATHER_BURST_SEC", "9")
    caps = resolve_gather_caps()
    assert caps["burst_sec"] == 9.0
    assert caps["mode"] == "after"


def test_resolve_gather_mode_aliases(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    assert resolve_gather_mode(None) == "after"
    assert resolve_gather_mode("AFTER") == "after"
    assert resolve_gather_mode("interleaved") == "interleaved"
    assert resolve_gather_mode("per_node") == "interleaved"
    assert resolve_gather_mode("burst") == "interleaved"
    assert resolve_gather_mode("garbage") == "after"


def test_empty_urls_no_spider(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    wd = _FakeWd()
    zap = _FakeZap()
    summary = run_gather_info(
        wd,
        zap,
        [],
        settle_sec=0,
        pscan_timeout_sec=5,
    )
    assert summary["urls"] == 0
    assert summary["bursts"] == 0
    assert summary["wall_hit"] is False
    assert summary["pscan_ok"] is False
    assert zap.bursts == []
    assert wd.opened == []


def test_blank_lines_only_no_silent_success(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    wd = _FakeWd()
    zap = _FakeZap()
    summary = run_gather_info(
        wd,
        zap,
        ["", "  ", "\t"],
        settle_sec=0,
        pscan_timeout_sec=5,
    )
    assert summary["urls"] == 0
    assert summary["bursts"] == 0
    assert summary["pscan_ok"] is False
    assert zap.bursts == []


def test_relative_url_without_base_raises(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    wd = _FakeWd(base_url="")
    zap = _FakeZap()
    try:
        run_gather_info(wd, zap, ["/#/login"], settle_sec=0, pscan_timeout_sec=5)
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "base_url_override" in str(exc)


def test_pscan_false_reflected_in_summary(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    wd = _FakeWd()
    zap = _FakeZap()
    zap.passive_scan_wait_seconds = lambda timeout_seconds=60: False  # noqa: ARG005
    summary = run_gather_info(
        wd,
        zap,
        ["http://a/1"],
        settle_sec=0,
        spider_sec=10,
        pscan_timeout_sec=5,
        mode="after",
    )
    assert summary["urls"] == 1
    assert summary["pscan_ok"] is False


def test_diary_and_meta_after(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    published = []
    meta = {}

    def fake_publish(kind, msg, channel="diary"):
        published.append((kind, msg, channel))

    def fake_set_meta(**kw):
        meta.update(kw)

    monkeypatch.setattr("utils.diary_bus.publish", fake_publish)
    monkeypatch.setattr("utils.diary_bus.set_meta", fake_set_meta)
    wd = _FakeWd()
    zap = _FakeZap()
    summary = run_gather_info(
        wd,
        zap,
        ["http://a/1"],
        settle_sec=0,
        spider_sec=10,
        pscan_timeout_sec=5,
        mode="after",
    )
    assert meta.get("gather_info_last") == summary
    kinds = [k for k, _, _ in published]
    assert "GATHER" in kinds
    assert any("mode=after" in m for _, m, _ in published)
    assert any("done mode=after" in m for _, m, _ in published)


def test_diary_and_meta_interleaved(monkeypatch):
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    published = []
    meta = {}

    def fake_publish(kind, msg, channel="diary"):
        published.append((kind, msg, channel))

    def fake_set_meta(**kw):
        meta.update(kw)

    monkeypatch.setattr("utils.diary_bus.publish", fake_publish)
    monkeypatch.setattr("utils.diary_bus.set_meta", fake_set_meta)
    wd = _FakeWd()
    zap = _FakeZap()
    summary = run_gather_info(
        wd,
        zap,
        ["http://a/1", "http://a/2"],
        settle_sec=0,
        burst_sec=5,
        pscan_timeout_sec=5,
        mode="interleaved",
    )
    assert meta.get("gather_info_last") == summary
    assert summary["mode"] == "interleaved"
    assert any("mode=interleaved" in m for _, m, _ in published)
    assert any("node burst ok" in m for _, m, _ in published)


def test_wall_sec_stops_before_after_spider(monkeypatch):
    """wall_hit mid-browse → no BrowseThenSpider burst."""
    monkeypatch.delenv("PK_GATHER_MODE", raising=False)
    wd = _FakeWd()
    zap = _FakeZap()
    # t0=0; first URL check=1 (< wall); second URL check=100 (≥ wall)
    clock = {"t": 0.0}

    def fake_time():
        return clock["t"]

    real_navigate = _FakeWd._navigate

    def navigate_and_advance(self, url):
        real_navigate(self, url)
        clock["t"] = 100.0

    monkeypatch.setattr("utils.gather_info.time.time", fake_time)
    monkeypatch.setattr(_FakeWd, "_navigate", navigate_and_advance)
    summary = run_gather_info(
        wd,
        zap,
        ["http://a/1", "http://a/2", "http://a/3"],
        settle_sec=0,
        wall_sec=10,
        spider_sec=30,
        pscan_timeout_sec=5,
        mode="after",
    )
    assert summary["wall_hit"] is True
    assert summary["urls"] == 1
    assert summary["bursts"] == 0
    assert zap.bursts == []


def test_after_uses_spider_sec_env(monkeypatch):
    monkeypatch.setenv("PK_GATHER_MODE", "after")
    monkeypatch.setenv("PK_GATHER_SPIDER_SEC", "42")
    caps = resolve_gather_caps()
    assert caps["mode"] == "after"
    assert caps["spider_sec"] == 42.0
