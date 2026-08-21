# -*- coding: utf-8 -*-
"""
СборИнформации: browser teleport + ZAP spider via ZapWorkStream.

Default mode ``after`` (BrowseThenSpider): обойти URL → один spider по обогащённому
Sites tree. Mode ``interleaved``: per-node burst (таймбокс, не default max).
"""
from __future__ import annotations
from utils.env_dual import pk_env

import logging
import os
import time
from typing import Any, List
from urllib.parse import urljoin

from utils.zap_work_stream import ZapWorkStream

logger = logging.getLogger("orchestrator")

_DEFAULT_BURST = 15.0
_DEFAULT_SETTLE = 1.0
_DEFAULT_PSCAN = 60.0
_DEFAULT_SPIDER_AFTER = 60.0
_DEFAULT_MODE = "after"


def _env_float(name: str, default: float) -> float:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def resolve_gather_mode(mode: Any = None) -> str:
    raw = (mode if mode not in (None, "") else pk_env("GATHER_MODE") or _DEFAULT_MODE)
    m = str(raw).strip().lower()
    if m in ("interleaved", "node", "burst", "per_node"):
        return "interleaved"
    return "after"


def resolve_gather_caps(
    *,
    burst_sec: Any = None,
    settle_sec: Any = None,
    max_urls: Any = None,
    pscan_timeout_sec: Any = None,
    wall_sec: Any = None,
    spider_sec: Any = None,
    mode: Any = None,
) -> dict:
    burst = float(burst_sec) if burst_sec not in (None, "") else _env_float(
        "KDT_GATHER_BURST_SEC", _DEFAULT_BURST
    )
    settle = float(settle_sec) if settle_sec not in (None, "") else _env_float(
        "KDT_GATHER_SETTLE_SEC", _DEFAULT_SETTLE
    )
    max_u = int(max_urls) if max_urls not in (None, "") else _env_int(
        "KDT_GATHER_MAX_URLS", 0
    )
    pscan = (
        float(pscan_timeout_sec)
        if pscan_timeout_sec not in (None, "")
        else _env_float("KDT_GATHER_PSCAN_SEC", _DEFAULT_PSCAN)
    )
    wall = float(wall_sec) if wall_sec not in (None, "") else _env_float(
        "KDT_GATHER_WALL_SEC", 0.0
    )
    spider = (
        float(spider_sec)
        if spider_sec not in (None, "")
        else _env_float("KDT_GATHER_SPIDER_SEC", _DEFAULT_SPIDER_AFTER)
    )
    return {
        "mode": resolve_gather_mode(mode),
        "burst_sec": max(1.0, burst),
        "settle_sec": max(0.0, settle),
        "max_urls": max(0, max_u),
        "pscan_timeout_sec": max(1.0, pscan),
        "wall_sec": max(0.0, wall),
        "spider_sec": max(1.0, spider),
    }


def _abs_url(row: str, base: str) -> str:
    row = str(row).strip()
    if row.startswith(("http://", "https://")):
        return row
    if not base:
        raise ValueError(
            f"относительный URL {row!r}: задайте base_url_override "
            f"или передайте абсолютный адрес"
        )
    return urljoin(base if base.endswith("/") else base + "/", row)


def _navigate(webdriver: Any, url: str) -> None:
    navigate = getattr(webdriver, "_navigate", None)
    if navigate is None:
        webdriver.open(url)
    else:
        navigate(url)


def run_gather_info(
    webdriver: Any,
    zap: Any,
    source: Any,
    burst_sec: Any = None,
    settle_sec: Any = None,
    max_urls: Any = None,
    pscan_timeout_sec: Any = None,
    wall_sec: Any = None,
    mode: Any = None,
    spider_sec: Any = None,
) -> dict:
    """
    Keyword: СборИнформации <source> [burst_sec] [settle_sec] …

    Default mode=after: browse all → one spider. interleaved: per-node burst.
    """
    caps = resolve_gather_caps(
        burst_sec=burst_sec,
        settle_sec=settle_sec,
        max_urls=max_urls,
        pscan_timeout_sec=pscan_timeout_sec,
        wall_sec=wall_sec,
        spider_sec=spider_sec,
        mode=mode,
    )
    normalize = getattr(webdriver, "_normalize_url_source", None)
    if normalize is None:
        from adapters.webdriver_adapter import WebDriverAdapter

        urls = WebDriverAdapter._normalize_url_source(source)
    else:
        urls = normalize(source)
    if caps["max_urls"] > 0:
        urls = urls[: caps["max_urls"]]

    base = (getattr(webdriver, "base_url", None) or "").strip()
    stream = ZapWorkStream(zap)
    visited: List[str] = []
    wall_hit = False
    pscan_ok = False
    t0 = time.time()
    stream.start()
    _publish(f"GATHER mode={caps['mode']}")
    try:
        for raw in urls:
            if caps["wall_sec"] > 0 and (time.time() - t0) >= caps["wall_sec"]:
                wall_hit = True
                logger.warning("GATHER wall_sec=%.0f reached — stop loop", caps["wall_sec"])
                _publish(f"GATHER wall cap hit after {len(visited)} urls")
                break
            if not str(raw).strip():
                continue
            url = _abs_url(str(raw), base)
            _navigate(webdriver, url)
            if caps["settle_sec"] > 0:
                time.sleep(caps["settle_sec"])
            visited.append(url)
            if caps["mode"] == "interleaved":
                stream.spider_burst(url, burst_sec=caps["burst_sec"])
                _publish(f"GATHER node burst ok {url}")
            else:
                _publish(f"GATHER browse ok {url}")

        if visited and caps["mode"] == "after" and not wall_hit:
            seed = visited[0]
            stream.spider_burst(seed, burst_sec=caps["spider_sec"])
            _publish(
                f"GATHER after-spider seed={seed} sec={caps['spider_sec']:.0f}"
            )

        if visited:
            pscan_ok = stream.passive_wait_capped(caps["pscan_timeout_sec"])
        else:
            # empty / all-blank source: no silent "pscan success"
            pscan_ok = False
            _publish("GATHER skip pscan — no urls visited")
    finally:
        stream.close()

    summary = {
        "mode": caps["mode"],
        "urls": len(visited),
        "bursts": stream.burst_count,
        "pscan_ok": pscan_ok,
        "wall_hit": wall_hit,
        "visited": visited,
    }
    logger.info("GATHER done %s", summary)
    _publish(
        f"GATHER done mode={summary['mode']} urls={summary['urls']} "
        f"bursts={summary['bursts']} pscan_ok={summary['pscan_ok']}"
    )
    try:
        from utils.diary_bus import set_meta

        set_meta(gather_info_last=summary)
    except Exception:
        pass
    return summary


def _publish(msg: str) -> None:
    try:
        from utils.diary_bus import publish

        publish("GATHER", msg, channel="diary")
    except Exception:
        pass
