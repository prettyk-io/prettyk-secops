# -*- coding: utf-8 -*-
"""Цикл A: scannerWorkStream unit (fake scanner)."""
from __future__ import annotations

import pytest

from utils.zap_work_stream import scannerWorkStream


class _Fakescanner:
    def __init__(self):
        self.bursts = []
        self.stop_all = 0
        self.enable_all = 0
        self.pscan_calls = []
        self._remaining = [2, 1, 0]

    def spider_scan(self, url=None, timeout_minutes=None, **_kw):
        self.bursts.append({"url": url, "timeout_minutes": float(timeout_minutes)})
        return 4

    def stop_all_spiders(self):
        self.stop_all += 1

    def enable_all_passive_scanners(self):
        self.enable_all += 1

    def passive_scan_wait_seconds(self, timeout_seconds=60):
        self.pscan_calls.append(float(timeout_seconds))
        return True


def test_stream_start_burst_close():
    scanner = _Fakescanner()
    stream = scannerWorkStream(scanner)
    stream.start()
    assert stream.active
    assert scanner.enable_all == 1
    got = stream.spider_burst("http://juice/#/login", burst_sec=15)
    assert got == 4
    assert len(scanner.bursts) == 1
    assert abs(scanner.bursts[0]["timeout_minutes"] - 0.25) < 1e-6
    assert stream.burst_count == 1
    # stop before + after burst
    assert scanner.stop_all >= 2
    ok = stream.passive_wait_capped(30)
    assert ok is True
    assert scanner.pscan_calls == [30.0]
    stream.close()
    assert not stream.active
    with pytest.raises(RuntimeError):
        stream.spider_burst("http://x")


def test_second_burst_stops_previous():
    scanner = _Fakescanner()
    stream = scannerWorkStream(scanner)
    stream.start()
    stream.spider_burst("http://a", burst_sec=5)
    stream.spider_burst("http://b", burst_sec=5)
    assert stream.burst_count == 2
    assert [b["url"] for b in scanner.bursts] == ["http://a", "http://b"]
    stream.close()


def test_burst_requires_start():
    stream = scannerWorkStream(_Fakescanner())
    with pytest.raises(RuntimeError, match="not started"):
        stream.spider_burst("http://x")
