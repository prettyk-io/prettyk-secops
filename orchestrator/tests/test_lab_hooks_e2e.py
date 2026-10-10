# -*- coding: utf-8 -*-
"""
Lab e2e: clear hooks on start → spawn short run → Allure+Dojo hooks back.

Requires local lab: playground :8765, Live :8767, allure3-secops :5050, Dojo :8081.
Skip if stack is down.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

FIX = Path(__file__).resolve().parents[1] / "fixtures" / "validate_ok.json"
PLAY = "http://127.0.0.1:8765"
LIVE = "http://127.0.0.1:8767"
SCANNER_RESULTS = Path(__file__).resolve().parents[2] / "reports" / "scanner-results"


def _http_json(method: str, url: str, body: dict | None = None, timeout: float = 10):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            payload = {"error": raw}
        return e.code, payload


def _lab_up() -> bool:
    try:
        for url in (
            f"{PLAY}/api/health",
            f"{LIVE}/api/meta",
            "http://127.0.0.1:5050/health",
            "http://127.0.0.1:8081/",
        ):
            urllib.request.urlopen(url, timeout=3).read()
        return True
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


@pytest.mark.heavy
@pytest.mark.lab
@pytest.mark.skipif(not _lab_up(), reason="lab stack not up")
def test_e2e_start_clears_then_finalize_hooks():
    # Seed stale hooks (as after previous green run).
    code, seeded = _http_json(
        "POST",
        f"{LIVE}/api/results/hooks",
        {
            "allure_report_url": "http://127.0.0.1:5050/?stale=1",
            "dojo_report_url": "http://127.0.0.1:8081/engagement/999",
        },
    )
    assert code == 200
    assert seeded.get("ok") is True

    # Wait idle lab runner.
    deadline = time.time() + 30
    while time.time() < deadline:
        _, st = _http_json("GET", f"{PLAY}/api/run/status")
        if st.get("phase") != "running":
            break
        time.sleep(0.5)
    else:
        pytest.fail("lab runner stuck running")

    wired = json.loads(FIX.read_text(encoding="utf-8"))
    infra = wired.setdefault("infrastructure", {})
    infra.setdefault("base_url_override", "http://juice-shop:3000")
    infra.setdefault("allowed_extra_domains", "")
    code, started = _http_json(
        "POST",
        f"{PLAY}/api/run/start",
        {"wired": wired, "session_name": "hooks-e2e"},
        timeout=30,
    )
    assert code == 200, started
    assert started.get("ok") is True
    run_id = started.get("run_id")

    # Immediately after start: hooks cleared (grey tiles / lock downloads).
    _, hooks = _http_json("GET", f"{LIVE}/api/results/hooks")
    assert hooks.get("allure") in (None, {}), hooks
    assert hooks.get("dojo") in (None, {}), hooks

    # Wait finish + finalize hooks.
    deadline = time.time() + 180
    while time.time() < deadline:
        _, st = _http_json("GET", f"{PLAY}/api/run/status")
        if st.get("run_id") == run_id and st.get("phase") == "finished":
            break
        time.sleep(1)
    else:
        pytest.fail(f"run {run_id} did not finish")

    deadline = time.time() + 60
    hooks: dict = {}
    allure_url = None
    while time.time() < deadline:
        _, hooks = _http_json("GET", f"{LIVE}/api/results/hooks")
        a = hooks.get("allure") or {}
        allure_url = a.get("report_url") if isinstance(a, dict) else None
        if allure_url:
            break
        time.sleep(1)

    assert allure_url, f"allure hook не восстановлен: {hooks}"
    time.sleep(2)  # finalize дописывает dojo/scanner хуки
    _, hooks = _http_json("GET", f"{LIVE}/api/results/hooks")
    d = hooks.get("dojo") or {}
    dojo_url = d.get("report_url") if isinstance(d, dict) else None

    # BOX-SAN fail-closed: прогон без scanner XML (validate-only) не импортируется
    # в DefectDojo → dojo-хука нет by design; при наличии XML — хук обязателен.
    xml_present = any(SCANNER_RESULTS.glob("*.xml"))
    if xml_present:
        assert dojo_url, f"scanner XML есть, а dojo hook не восстановлен: {hooks}"
    else:
        assert dojo_url is None, f"scanner XML нет, а dojo hook есть: {dojo_url!r}"

    assert allure_url.startswith("http://127.0.0.1:5050"), allure_url
    assert "allure-docker-service" not in allure_url
    # Канон движка 3: базовый :5050/ или per-project /projects/<id>/reports/latest/
    # (legacy-форма «/5050/» больше не существует).
    assert allure_url.rstrip("/").endswith("5050") or "/reports/latest/" in allure_url, allure_url
    assert "stale=1" not in allure_url
    if dojo_url:
        assert dojo_url.startswith("http://127.0.0.1:8081/"), dojo_url
        assert "engagement" in dojo_url
        assert "/engagement/999" not in dojo_url
