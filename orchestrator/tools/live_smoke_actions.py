# -*- coding: utf-8 -*-
"""LVL-1-RW: честный live smoke — Record → DSL-редукция → step → replay.

В отличие от прежнего ``live_smoke_actions.ps1`` (который просто гонял pytest
и печатал зелёный verdict даже при отсутствии ``replay_timeline.json``), здесь
сквозная цепочка исполняется явно, а ВЕРДИКТ вычисляется строго из свежего
``replay_timeline.json``:

    1) Record: observe_start + реальные CDP-действия → очередь observe-событий;
    2) Reduce: события → snake DSL-шаги (backend-маппинг OBSERVE_TO_SNAKE —
       proposal/Accept/observationToAction — зона Flash, здесь backend-редукция);
    3) Execute: snake step execute accept (replay-совместимых шагов);
    4) Replay: scenario_replay всех шагов → replay_id + timeline_path;
    5) Freshness: ``replay_timeline.json`` существует, mtime >= start этого
       запуска, встроенный ``replay_id`` совпадает с возвращённым. Любое
       расхождение (absent / stale / mismatch) → verdict FAIL.

Exit-коды: 0 ok · 2 стенд недоступен · 3 шаг chain FAIL · 4 timeline stale/absent.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import quote

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

SNAKE_FROM_ACTION = {
    "click": {"action": "click", "target": "#btn", "strategy": "css"},
    "type": {"action": "fill", "target": "#fld", "value": "smoke"},
    "select": {"action": "select_option", "target": "#sel", "value": "b"},
    "wheel": {"action": "wheel", "value": "0,-80"},
    "scroll": {"action": "scroll", "target": "#scr", "strategy": "css"},
    "drag": {"action": "drag", "value": "__DRAG__"},
    "hover": {"action": "hover", "target": "#hov", "strategy": "css"},
    "key": {"action": "press_key", "target": "Enter"},
    "focus": {"action": "focus", "target": "#fld", "strategy": "css"},
}

_PAGE = """
<html><body style='height:2600px;margin:0'>
  <button id='btn' data-testid='btn'>Click me</button>
  <input id='fld' data-testid='fld' type='text' />
  <select id='sel' data-testid='sel'><option value='a'>A</option><option value='b'>B</option></select>
  <button id='hov' data-testid='hov'>Hover me</button>
  <div id='scr' style='height:120px;overflow:auto;border:1px solid black'><div style='height:900px'>tall</div><div id='scrinner'>INNER</div></div>
  <div id='drag' style='width:200px;height:60px;background:#eee'>drag zone</div>
  <div id='bottom' style='margin-top:2400px'>BOTTOM</div>
</body></html>
"""


def _cdp_reachable(endpoint: str, timeout: float = 3.0) -> bool:
    try:
        base = endpoint.rstrip("/")
        url = base if base.endswith("/json/version") else base + "/json/version"
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def _drain(session_id, action=None, max_wait=3.0, idle=0.6):
    from browser.browser_service import browser_observe_event
    deadline = time.time() + max_wait
    collected = {}
    last = time.time()
    while time.time() < deadline:
        evt = (browser_observe_event(session_id=session_id) or {}).get("event")
        if evt is None:
            if time.time() - last > idle:
                break
            time.sleep(0.05)
            continue
        last = time.time()
        collected.setdefault(evt.get("action"), []).append(evt)
    if action is not None:
        return collected.get(action, [])
    return collected


def run(endpoint: str, artifacts_dir: str | None = None) -> dict:
    os.environ["PK_BROWSER_CDP_ENDPOINT"] = endpoint
    if artifacts_dir:
        os.environ["PK_REPLAY_ARTIFACTS_DIR"] = artifacts_dir

    from browser.browser_service import (
        browser_context_ensure, browser_observe_start, browser_observe_stop,
        browser_click, browser_type_text, browser_eval, browser_mouse_wheel,
        browser_mouse_drag, browser_keyboard_press, browser_step_execute,
        browser_scenario_replay, browser_context_destroy,
    )

    if not _cdp_reachable(endpoint):
        return {"ok": False, "stage": "cdp", "error": f"CDP {endpoint} unreachable"}

    sid = "lvl1-rw-smoke"
    ensured = browser_context_ensure(url=f"data:text/html,{quote(_PAGE)}", session_id=sid)
    if not ensured.get("ok") or not ensured.get("browserId"):
        return {"ok": False, "stage": "context", "error": f"context_ensure failed: {ensured}"}

    replay_id = None
    timeline_path = None
    run_start_ms = int(time.time() * 1000)
    try:
        assert browser_observe_start(session_id=sid).get("ok"), "observe_start failed"

        # ── 1. Record: реальные CDP-действия (не type, чтобы не пачкать тест) ──
        browser_click("#btn", strategy="css", session_id=sid)
        browser_type_text("#fld", "smoke-value", strategy="css", session_id=sid)
        browser_step_execute({"action": "select_option", "target": "#sel", "value": "b"}, session_id=sid)
        browser_mouse_wheel(dx=0.0, dy=-80.0, session_id=sid)
        browser_step_execute({"action": "scroll", "target": "#scrinner", "strategy": "css"}, session_id=sid)
        _drag = browser_eval("(function(){var r=document.getElementById('drag').getBoundingClientRect();"
                             "return (r.x+r.width/2)+','+(r.y+r.height/2);})()", session_id=sid)["result"]
        x1, y1 = (float(v) for v in str(_drag).split(","))
        browser_mouse_drag(x1, y1, x1 + 30, y1 + 5, session_id=sid)
        browser_step_execute({"action": "hover", "target": "#hov", "strategy": "css"}, session_id=sid)
        browser_keyboard_press("k", session_id=sid)
        browser_step_execute({"action": "focus", "target": "#fld", "strategy": "css"}, session_id=sid)

        events = _drain(sid)
        browser_observe_stop(session_id=sid)

        observed_actions = {a for a in events if a in SNAKE_FROM_ACTION}
        if not observed_actions:
            return {"ok": False, "stage": "record", "error": "no observe events recorded"}

        # ── 2. Reduce: события → snake DSL-шаги ──
        steps = []
        for action in ("click", "type", "select", "wheel", "scroll", "drag", "hover", "key", "focus"):
            if action not in observed_actions:
                continue
            s = dict(SNAKE_FROM_ACTION[action])
            if s.get("value") == "__DRAG__":
                s["value"] = f"{x1},{y1},{x1 + 30},{y1 + 5}"
            steps.append(s)

        # ── 3/4. Execute + replay (scenario_replay сам исполняет шаги + пишет timeline) ──
        replay = browser_scenario_replay(steps, stop_on_failure=True, session_id=sid)
        replay_id = replay.get("replay_id")
        timeline_path = replay.get("timeline_path")
        verdict = replay.get("verdict")
        statuses = [r.get("status") for r in (replay.get("steps") or [])]

        # ── 5. Freshness (ЖЕЛЕЗНО): HEAD решает verdict, не pytest ──
        fresh = True
        reason = "ok"
        if not replay_id or not timeline_path:
            fresh, reason = False, "replay did not persist timeline (replay_id/timeline_path empty)"
        else:
            store_base = Path(os.environ.get("PK_REPLAY_ARTIFACTS_DIR") or "replay_artifacts")
            tpath = store_base / replay_id / "replay_timeline.json"
            if not tpath.exists():
                fresh, reason = False, f"timeline missing on disk: {tpath}"
            else:
                mtime_ms = int(tpath.stat().st_mtime * 1000)
                if mtime_ms < run_start_ms:
                    fresh, reason = False, (
                        f"timeline stale: mtime {mtime_ms} < run start {run_start_ms}"
                    )
                else:
                    loaded = json.loads(tpath.read_text(encoding="utf-8"))
                    if loaded.get("replay_id") != replay_id:
                        fresh, reason = False, (
                            f"timeline replay_id mismatch: {loaded.get('replay_id')} != {replay_id}"
                        )

        return {
            "ok": fresh and verdict == "passed" and (not statuses or all(s == "passed" for s in statuses)),
            "stage": "replay",
            "observed_actions": sorted(observed_actions),
            "steps": len(steps),
            "verdict": verdict,
            "statuses": statuses,
            "replay_id": replay_id,
            "timeline_path": timeline_path,
            "fresh": fresh,
            "reason": reason,
            "error": None if fresh else reason,
        }
    finally:
        browser_context_destroy(session_id=sid)


def main() -> int:
    endpoint = (
        os.environ.get("PK_BROWSER_CDP_ENDPOINT")
        or (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:9223")
    )
    res = run(endpoint)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    if not res.get("ok"):
        stage = res.get("stage")
        if stage == "cdp":
            return 2
        if stage == "replay" and not res.get("fresh"):
            return 4
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())