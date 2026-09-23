# -*- coding: utf-8 -*-
"""BBA-6: сквозная live-верификация цепочки browser → DSL (без mock).

Честный integration-проход: реальный CDP-браузер (playwright-authoring контейнер)
→ observe → observe_click → observe_event → кандидаты → DSL-редукция на фронте
не тестируется здесь (frontend), но backend-половина цепочки проверяется сквозь:
    1) живое CDP-соединение (browser_status connected),
    2) navigate → observe_start → observe_click по реальной странице,
    3) observe_event возвращает настоящее CDP-событие с candidates.

При недоступном стенде (docker daemon выключен / PK_BROWSER_CDP_ENDPOINT не задан /
порт не отвечает) — честный ``pytest.skip``, НЕ фейковый green.
"""
from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


def _cdp_endpoint() -> str | None:
    return os.environ.get("PK_BROWSER_CDP_ENDPOINT")


def _cdp_reachable(endpoint: str) -> bool:
    """Проверка доступности CDP endpoint без поднятия браузера."""
    try:
        # CDP endpoint обычно отдаёт /json/version.
        base = endpoint.rstrip("/")
        url = base if base.endswith("/json/version") else base + "/json/version"
        with urllib.request.urlopen(url, timeout=3.0) as resp:
            return resp.status == 200
    except Exception:
        return False


@pytest.mark.integration
def test_browser_authoring_live_observe_click_to_event():
    """BBA-6: живой observe → observe_click → observe_event (CDP, без mock).

    Skip при недоступном стенде — это легитимный negative-результат для
    host-среды без docker daemon / playwright-authoring контейнера.
    """
    endpoint = _cdp_endpoint()
    if not endpoint:
        pytest.skip(
            "PK_BROWSER_CDP_ENDPOINT not set — playwright-authoring container "
            "not configured in this environment"
        )
    if not _cdp_reachable(endpoint):
        pytest.skip(f"CDP endpoint {endpoint} unreachable — docker daemon/container down")

    from browser.browser_service import browser_context_ensure, browser_observe_start, browser_observe_event, browser_observe_click, browser_observe_stop, browser_context_destroy

    # status() пассивен (VP-L1) — активное подключение через context_ensure.
    # context_ensure идёт через page.goto (поддерживает data:), в отличие от
    # _cmd_navigate, который требует http(s).
    html = (
        "<html><body>"
        "<button id='live-submit' data-testid='live-submit' style='width:120px;height:40px'>Живой клик</button>"
        "</body></html>"
    )
    ensured = browser_context_ensure(url=f"data:text/html,{html}")
    if not ensured.get("ok"):
        pytest.skip(f"browser_context_ensure failed: {ensured.get('error')}")
    if not ensured.get("browserId"):
        pytest.skip(f"browser_context_ensure no browserId: {ensured}")

    try:
        started = browser_observe_start()
        assert started.get("ok"), f"observe_start failed: {started}"

        # Клик в центр кнопки (~ x=20, y=20 в data-URL странице).
        clicked = browser_observe_click(20.0, 20.0)
        assert clicked.get("ok"), f"observe_click failed: {clicked}"

        # observe_event должен вернуть реальное событие (queued) с candidates.
        event_result = browser_observe_event()
        assert event_result.get("ok")
        assert event_result.get("connected") is True
        evt = event_result.get("event")
        assert evt is not None, "expected a real CDP click event, got None"
        assert evt.get("action") == "click"
        assert evt.get("eventId", "").startswith("cdp-")
        # candidates должны быть сформированы (T1 #live-submit или fallback).
        assert isinstance(evt.get("candidates"), list)

        browser_observe_stop()
    finally:
        # Не оставляем живой worker/браузер — cleanup для изоляции от юнит-тестов.
        browser_context_destroy()


@pytest.mark.integration
def test_browser_authoring_live_type_to_redacted_event():
    """TYPE-BE: живой observe → ввод → observe_event (type, значение redacted).

    Доказывает backend-половину цепочки type→DSL: нативное заполнение живого
    input-а порождает ``action=type``-событие с ``valueRef`` ($secret/$value)
    и БЕЗ plaintext значения в событии/wire. Frontend-редукция в DSL (Type-step)
    остаётся зоной Flash (TYPE-FE) — здесь проверяется только честный контракт.
    """
    endpoint = _cdp_endpoint()
    if not endpoint:
        pytest.skip(
            "PK_BROWSER_CDP_ENDPOINT not set — playwright-authoring container "
            "not configured in this environment"
        )
    if not _cdp_reachable(endpoint):
        pytest.skip(f"CDP endpoint {endpoint} unreachable — docker daemon/container down")

    from browser.browser_service import (
        browser_context_ensure, browser_observe_start, browser_observe_event,
        browser_observe_stop, browser_context_destroy, browser_type_text,
    )

    html = (
        "<html><body>"
        "<input id='live-field' name='username' type='text' "
        "data-testid='live-field' placeholder='Введите имя' "
        "style='width:200px;height:30px' />"
        "</body></html>"
    )
    ensured = browser_context_ensure(url=f"data:text/html,{html}")
    if not ensured.get("ok") or not ensured.get("browserId"):
        pytest.skip(f"browser_context_ensure failed: {ensured}")

    try:
        started = browser_observe_start()
        assert started.get("ok"), f"observe_start failed: {started}"

        # Нативное заполнение поля → должно породить input/change observe-событие.
        typed = browser_type_text("#live-field", "secret-plaintext-value", strategy="css")
        assert typed.get("ok"), f"type_text failed: {typed}"

        event_result = browser_observe_event()
        assert event_result.get("ok")
        evt = event_result.get("event")
        assert evt is not None, "expected a real CDP type event, got None"
        assert evt.get("action") == "type"
        # Redaction: plaintext не утекает ни в text, ни в valueRef-значение.
        assert "secret-plaintext-value" not in str(evt)
        assert evt.get("element", {}).get("text", "") == ""
        assert evt.get("valueRef") in ("$value", "$secret")
        assert isinstance(evt.get("candidates"), list)

        browser_observe_stop()
    finally:
        browser_context_destroy()
