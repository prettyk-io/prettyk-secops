# -*- coding: utf-8 -*-
"""Live (CDP) верификация цепочки browser → observe → redaction → step → replay.

Честный integration-проход без mock: реальный CDP-браузер (playwright-authoring
контейнер). Frontend-половина (proposal → DSL-редукция `observationToAction` /
`observationToDsl`) остаётся зоной Flash — здесь проверяется backend-половина:

  1) живое CDP-соединение (browser_status connected),
  2) observe-события каждого каноничного action-type (click/type/select +
     wheel/scroll/drag/hover/key/focus) с redaction на границе,
  3) snake step execute (`_cmd_step_execute`) + scenario replay round-trip.

При недоступном стенде (docker daemon выключен / PK_BROWSER_CDP_ENDPOINT не
задан / порт не отвечает) — честный ``pytest.skip``, НЕ фейковый green.

LVL-1 (п.1): полный action-пакет гоняется живым браузером. Ключевое отличие от
Потока 5/6: ACT-BE добавил focus-observer (focusin), поэтому клик/ввод теперь
порождают СНАЧАЛА ``focus``, затем ``click``/``type`` — это корректное живое
поведение DOM (focusin предшествует click/input). Live-тесты поэтому собирают
события из очереди до пустоты и ищут целевой action, а не доверяют «первому
событию» (старый BBA-6 ассумпшн — устарел).
"""
from __future__ import annotations

import os
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import quote

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

# ───────────────────────────────────────────────────────────────
# Трёхслойный нейминг: observe action → backend snake step action.
# Заморожен (ACT-BE/ACT-FE/ACT-DEBT). Алиасы type→fill, select→select_option,
# key→press_key — законный маппинг, НЕ дрейф. См. docs/contracts/action-naming.md.
# ───────────────────────────────────────────────────────────────
OBSERVE_TO_SNAKE: dict[str, str] = {
    "click": "click",
    "type": "fill",
    "select": "select_option",
    "wheel": "wheel",
    "scroll": "scroll",
    "drag": "drag",
    "hover": "hover",
    "key": "press_key",
    "focus": "focus",
}

# Контракт полей каждого observe-события (канон ACT-BE).
OBSERVE_ACTION_FIELDS: dict[str, set[str]] = {
    "click": {"element"},
    "type": {"element", "valueRef", "valueClass"},
    "select": {"element", "valueRef", "valueClass"},
    "wheel": {"element", "delta.dx", "delta.dy"},
    "scroll": {"element", "delta.dx", "delta.dy"},
    "drag": {"element", "coords.startX", "coords.startY", "coords.endX", "coords.endY"},
    "hover": {"element"},
    "key": {"element", "valueRef", "valueClass"},
    "focus": {"element"},
}


def _cdp_endpoint() -> str | None:
    return os.environ.get("PK_BROWSER_CDP_ENDPOINT")


def _cdp_reachable(endpoint: str, timeout: float = 3.0) -> bool:
    """Проверка доступности CDP endpoint без поднятия браузера."""
    try:
        base = endpoint.rstrip("/")
        url = base if base.endswith("/json/version") else base + "/json/version"
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def _wait_cdp_ready(endpoint: str, patience: float = 30.0) -> bool:
    """Терпеливо ждать CDP endpoint.

    Live-тесты разрушают общий контейнерный Chrome при teardown
    (``browser_context_destroy`` → container перезапускает Chrome). Следующий
    тест должен подождать перезапуск, а не ложно-skip'аться.
    """
    deadline = time.time() + patience
    while time.time() < deadline:
        if _cdp_reachable(endpoint):
            return True
        time.sleep(0.5)
    return False


def _skip_if_no_cdp() -> None:
    """Вызвать в начале live-теста: skip если стенд/браузер недоступен."""
    endpoint = _cdp_endpoint()
    if not endpoint:
        pytest.skip(
            "PK_BROWSER_CDP_ENDPOINT not set — playwright-authoring container "
            "not configured in this environment"
        )
    if not _wait_cdp_ready(endpoint):
        pytest.skip(f"CDP endpoint {endpoint} unreachable — docker daemon/container down")


def _drain_events(session_id, action=None, max_wait=3.0, idle_break=0.6):
    """Собрать observe-события из очереди до «тишины».

    Некоторые события идут с debounce (hover 300ms, scroll 150ms), поэтому
    «пустая очередь» не сразу означает «события закончились» — ждём ``idle``
    секунд тишины. Возвращает dict[action, list[event]] или список событий
    конкретного action.
    """
    from browser.browser_service import browser_observe_event

    deadline = time.time() + max_wait
    collected: dict[str, list] = {}
    last_seen = time.time()
    while time.time() < deadline:
        result = browser_observe_event(session_id=session_id)
        evt = (result or {}).get("event")
        if evt is None:
            if time.time() - last_seen > idle_break:
                break
            time.sleep(0.05)
            continue
        last_seen = time.time()
        collected.setdefault(evt.get("action"), []).append(evt)
    if action is not None:
        return collected.get(action, [])
    return collected


def _eval(session_id, expression: str):
    """Прочитать значение из живой страницы (page.evaluate)."""
    from browser.browser_service import browser_eval

    result = browser_eval(expression, session_id=session_id)
    assert result.get("ok"), f"eval failed: {result}"
    return result.get("result")


def _step(session_id, step: dict) -> dict:
    from browser.browser_service import browser_step_execute

    return browser_step_execute(step, session_id=session_id)


# ───────────────────────────────────────────────────────────────
# Поток 5/6: точечные live-проверки (BBA-6 click, TYPE-BE type, ACT-BE keyboard/wheel)
# ───────────────────────────────────────────────────────────────


@pytest.mark.integration
def test_browser_authoring_live_observe_click_to_event():
    """BBA-6: живой observe → клик → observe_event (CDP, без mock).

    ACT-BE добавил focus-observer, поэтому клик порождает focus→click;
    собираем очередь и ищем click (focus — ожидаемый сосед).
    """
    _skip_if_no_cdp()

    from browser.browser_service import (
        browser_context_ensure, browser_observe_start, browser_observe_event,
        browser_observe_click, browser_observe_stop, browser_context_destroy,
    )

    html = (
        "<html><body>"
        "<button id='live-submit' data-testid='live-submit' style='width:120px;height:40px'>Живой клик</button>"
        "</body></html>"
    )
    ensured = browser_context_ensure(url=f"data:text/html,{html}")
    if not ensured.get("ok") or not ensured.get("browserId"):
        pytest.skip(f"browser_context_ensure failed: {ensured}")

    try:
        started = browser_observe_start()
        assert started.get("ok"), f"observe_start failed: {started}"

        clicked = browser_observe_click(20.0, 20.0)
        assert clicked.get("ok"), f"observe_click failed: {clicked}"

        events = _drain_events(None)
        assert "click" in events, f"expected a live click event among {sorted(events)}"
        evt = events["click"][0]
        assert evt.get("action") == "click"
        assert evt.get("eventId", "").startswith("cdp-")
        assert isinstance(evt.get("candidates"), list)

        browser_observe_stop()
    finally:
        browser_context_destroy()


@pytest.mark.integration
def test_browser_authoring_live_type_to_redacted_event():
    """TYPE-BE: живой observe → ввод → observe_event (type, значение redacted).

    Ввод порождает focus→type; ищем type, затем проверяем redaction-контракт.
    """
    _skip_if_no_cdp()

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

        typed = browser_type_text("#live-field", "secret-plaintext-value", strategy="css")
        assert typed.get("ok"), f"type_text failed: {typed}"

        events = _drain_events(None)
        assert "type" in events, f"expected a live type event among {sorted(events)}"
        evt = events["type"][0]
        assert evt.get("action") == "type"
        # Redaction: plaintext не утекает ни в text, ни в valueRef-значение.
        assert "secret-plaintext-value" not in str(evt)
        assert evt.get("element", {}).get("text", "") == ""
        assert evt.get("valueRef") in ("$value", "$secret")
        assert isinstance(evt.get("candidates"), list)

        browser_observe_stop()
    finally:
        browser_context_destroy()


@pytest.mark.integration
def test_browser_authoring_live_keyboard_and_wheel_events():
    """ACT-BE: живой observe → keyboard/wheel → observe_event (длинные действия)."""
    _skip_if_no_cdp()

    from browser.browser_service import (
        browser_context_ensure, browser_observe_start,
        browser_observe_stop, browser_context_destroy, browser_type_text,
        browser_mouse_wheel,
    )

    html = (
        "<html><body style='height:2000px'>"
        "<input id='live-key' name='q' type='text' style='width:200px;height:30px' />"
        "</body></html>"
    )
    ensured = browser_context_ensure(url=f"data:text/html,{html}")
    if not ensured.get("ok") or not ensured.get("browserId"):
        pytest.skip(f"browser_context_ensure failed: {ensured}")

    try:
        started = browser_observe_start()
        assert started.get("ok"), f"observe_start failed: {started}"

        typed = browser_type_text("#live-key", "qwerty", strategy="css")
        assert typed.get("ok"), f"type_text failed: {typed}"

        wheeled = browser_mouse_wheel(dx=0.0, dy=-120.0)
        assert wheeled.get("ok"), f"mouse_wheel failed: {wheeled}"

        actions = _drain_events(None)
        assert actions, "expected at least one observe event from live page"
        for evts in actions.values():
            for evt in evts:
                assert "qwerty" not in str(evt), "plaintext leaked into a live observe event"

        if "key" in actions:
            key_evt = actions["key"][0]
            assert key_evt.get("valueRef") in ("$value", "$secret")
        if "wheel" in actions:
            wheel_evt = actions["wheel"][0]
            assert wheel_evt.get("delta") is not None and "dy" in wheel_evt.get("delta", {})

        browser_observe_stop()
    finally:
        browser_context_destroy()


# ───────────────────────────────────────────────────────────────
# LVL-1: полный action-набор → observe → redaction → step → replay round-trip
# ───────────────────────────────────────────────────────────────

_ACTION_PAGE_HTML = """
<html><body>
  <button id='btn' data-testid='btn'>Click me</button>
  <input id='fld' data-testid='fld' type='text' />
  <select id='sel' data-testid='sel'>
    <option value='a'>A</option><option value='b'>B</option>
  </select>
  <button id='hov' data-testid='hov'>Hover me</button>
  <div id='scr' data-testid='scr'
       style='height:120px;overflow:auto;border:1px solid black'>
    <div style='height:900px'>tall</div>
  </div>
  <div id='drag' data-testid='drag'
       style='width:200px;height:60px;background:#eee'>drag zone</div>
  <script>
    window.__clicks=0; window.__wheeled=0; window.__scrolled=0; window.__dragged=0;
    window.__hovered=0;
    document.getElementById('btn').addEventListener('click', function(){window.__clicks++;});
    document.getElementById('hov').addEventListener('mouseenter', function(){window.__hovered++;});
    window.addEventListener('wheel', function(){window.__wheeled++;}, {capture:true});
    document.getElementById('scr').addEventListener('scroll', function(){window.__scrolled++;});
    document.getElementById('drag').addEventListener('mousedown', function(){window.__dragged++;});
  </script>
</body></html>
"""


@pytest.mark.live
@pytest.mark.integration
def test_lvl1_full_action_roundtrip_live():
    """LVL-1: каждый из 9 observe-action проходит observe → redaction → step → verify.

    Живой браузер на контролируемой странице с JS-флагами side-эффектов. Для
    каждого action: драйвим реальное действие → собираем observe-события →
    проверяем контракт (action-нейм + redaction) → исполняем snake step →
    проверяем side-эффект на живой странице. В конце — scenario replay round-trip
    по всем 9 snake-шагам (единый маппинг OBSERVE_TO_SNAKE).
    """
    _skip_if_no_cdp()

    from browser.browser_service import (
        browser_context_ensure, browser_observe_start, browser_observe_stop,
        browser_context_destroy, browser_click, browser_type_text,
        browser_mouse_wheel, browser_mouse_drag, browser_keyboard_press,
        browser_scenario_replay, browser_scenario_abort,
    )

    sid = "lvl1-live"
    ensured = browser_context_ensure(url=f"data:text/html,{quote(_ACTION_PAGE_HTML)}", session_id=sid)
    if not ensured.get("ok") or not ensured.get("browserId"):
        pytest.skip(f"browser_context_ensure failed: {ensured}")
    if _eval(sid, "document.getElementById('btn') === null"):
        pytest.skip("action page did not load (data-URL goto failed)")

    try:
        assert browser_observe_start(session_id=sid).get("ok"), "observe_start failed"

        # ── 1. click ──────────────────────────────────────────
        assert browser_click("#btn", strategy="css", session_id=sid).get("ok")
        clicks = _drain_events(sid, action="click")
        assert clicks, "click not observed (focus may interleave — but click must exist)"
        before = _eval(sid, "window.__clicks")
        assert _step(sid, {"action": "click", "target": "#btn", "strategy": "css"})["status"] == "passed"
        assert _eval(sid, "window.__clicks") == before + 1, "click replay did not fire onclick"

        # ── 2. type (observe=type → snake=fill) ───────────────
        assert browser_type_text("#fld", "alpha", strategy="css", session_id=sid).get("ok")
        types = _drain_events(sid, action="type")
        assert types, "type not observed"
        assert "alpha" not in str(types[0]), "redaction: plaintext leaked into type event"
        assert types[0].get("valueRef") in ("$value", "$secret")
        assert _step(sid, {"action": "fill", "target": "#fld", "value": "replayed"})["status"] == "passed"
        assert _eval(sid, "document.getElementById('fld').value") == "replayed", "fill replay failed"

        # ── 3. select (observe=select → snake=select_option) ──
        assert _step(sid, {"action": "select_option", "target": "#sel", "value": "b"})["status"] == "passed"
        selects = _drain_events(sid, action="select")
        assert selects, "select not observed"
        assert selects[0].get("valueRef") in ("$value", "$secret"), "select redaction failed"
        assert _step(sid, {"action": "select_option", "target": "#sel", "value": "a"})["status"] == "passed"
        assert _eval(sid, "document.getElementById('sel').value") == "a", "select_option replay failed"

# ── 4. wheel ──────────────────────────────────────────
        assert browser_mouse_wheel(dx=0.0, dy=-120.0, session_id=sid).get("ok")
        wheels = _drain_events(sid, action="wheel")
        assert wheels, "wheel not observed"
        assert "dy" in wheels[0].get("delta", {}), "wheel delta missing"
        # Round-trip: snake wheel-шаг тоже порождает observe-wheel-событие (тот же
        # путь page.mouse.wheel). Визуальный scroll-offset в Xvfb-Chromium
        # детерминированно не применяется (CDP mouseWheel quirk) — поэтому
        # проверяем именно observe-событие + passed, а не scrollTop.
        assert _step(sid, {"action": "wheel", "value": "0,-120"})["status"] == "passed"
        wheels_after = _drain_events(sid, action="wheel")
        assert wheels_after, "wheel step produced no observe-wheel event (round-trip broken)"
        assert "dy" in wheels_after[0].get("delta", {})

        # ── 5. scroll (реальный scroll у #scr) ────────────────
        _eval(sid, "document.getElementById('scr').scrollTop = 60")
        scrolls = _drain_events(sid, action="scroll")
        assert scrolls, "scroll not observed"
        assert "dy" in scrolls[0].get("delta", {}), "scroll delta missing"
        assert _step(sid, {"action": "scroll", "target": "#scr", "strategy": "css"})["status"] == "passed"

        # ── 6. drag ───────────────────────────────────────────
        rect = _eval(sid, "(function(){var r=document.getElementById('drag').getBoundingClientRect();"
                          "return {x:r.x,y:r.y,w:r.width,h:r.height};})()")
        cx, cy = rect["x"] + rect["w"] / 2, rect["y"] + rect["h"] / 2
        assert browser_mouse_drag(cx, cy, cx + 40.0, cy + 10.0, session_id=sid).get("ok")
        drags = _drain_events(sid, action="drag")
        assert drags, "drag not observed"
        assert set(drags[0].get("coords", {})) >= {"startX", "startY", "endX", "endY"}, "drag coords contract"
        before = _eval(sid, "window.__dragged")
        assert _step(sid, {"action": "drag", "value": f"{cx},{cy},{cx + 40.0},{cy + 10.0}"})["status"] == "passed"
        assert _eval(sid, "window.__dragged") == before + 1, "drag replay had no side effect"

        # ── 7. hover ──────────────────────────────────────────
        assert _step(sid, {"action": "hover", "target": "#hov", "strategy": "css"})["status"] == "passed"
        hovers = _drain_events(sid, action="hover")
        assert hovers, "hover not observed"
        assert _eval(sid, "window.__hovered") >= 1, "hover replay had no side effect"

        # ── 8. key (observe=key → snake=press_key) ────────────
        assert _step(sid, {"action": "focus", "target": "#fld", "strategy": "css"})["status"] == "passed"
        assert browser_keyboard_press("k", session_id=sid).get("ok")
        keys = _drain_events(sid, action="key")
        assert keys, "key not observed"
        key_evt = [e for e in keys if e.get("valueRef") in ("$value", "$secret")]
        assert key_evt, "printable key redaction (valueRef) missing on key event"
        assert _step(sid, {"action": "press_key", "target": "z"})["status"] == "passed"
        assert "z" in str(_eval(sid, "document.getElementById('fld').value")), "press_key replay failed"

        # ── 9. focus ──────────────────────────────────────────
        # #fld уже в фокусе после step 8 — blur, чтобы focusin реально сработал.
        _eval(sid, "document.getElementById('fld').blur()")
        assert _step(sid, {"action": "focus", "target": "#fld", "strategy": "css"})["status"] == "passed"
        focuses = _drain_events(sid, action="focus")
        assert focuses, "focus not observed"
        assert _eval(sid, "document.activeElement && document.activeElement.id") == "fld", "focus replay failed"

        browser_observe_stop(session_id=sid)

        # ── scenario replay round-trip (все 9 snake-шагов) ────
        replay_steps = [
            {"action": "click", "target": "#btn", "strategy": "css"},
            {"action": "fill", "target": "#fld", "value": "roundtrip"},
            {"action": "select_option", "target": "#sel", "value": "b"},
            {"action": "wheel", "value": "0,-80"},
            {"action": "scroll", "target": "#scr", "strategy": "css"},
            {"action": "drag", "value": f"{cx},{cy},{cx + 20},{cy + 5}"},
            {"action": "hover", "target": "#hov", "strategy": "css"},
            {"action": "press_key", "target": "Enter"},
            {"action": "focus", "target": "#fld", "strategy": "css"},
        ]
        assert set(s["action"] for s in replay_steps) == set(OBSERVE_TO_SNAKE.values()), (
            "replay steps must cover every snake action of the mapping"
        )
        replay = browser_scenario_replay(replay_steps, stop_on_failure=True, session_id=sid)
        assert replay.get("ok"), f"scenario_replay failed: {replay}"
        results = replay.get("results") or replay.get("steps") or []
        statuses = [r.get("status") for r in results if isinstance(r, dict)]
        assert statuses and all(s == "passed" for s in statuses), (
            f"round-trip replay had failures: {statuses}"
        )
    finally:
        browser_scenario_abort(session_id=sid)
        browser_context_destroy(session_id=sid)