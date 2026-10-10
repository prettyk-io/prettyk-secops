# -*- coding: utf-8 -*-
"""MONITOR-DEEPLINK-LIVE-CLIENT: browser-контракт страницы Monitor (изолированный Live).

Поднимает отдельный live_server (tmp-пути, свой порт) и гоняет РЕАЛЬНУЮ страницу
в Chromium (playwright):
  1) deep-link на активный ран → live-режим; события своего рана видны; чужие и
     неустановленные (чужой/пустой run_id) не подмешиваются;
  2) финал рана → авто-переход в архив на ТОМ ЖЕ run_id; показанные события
     сохраняются; recording честно «готовится», при появлении MP4 — ready + src;
  3) unknown run → честный empty-state; глобальная мета его не подменяет.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils import diary_bus  # noqa: E402
from utils.live_server import start_live_server, stop_live_server  # noqa: E402

pytestmark = pytest.mark.heavy

PROBE_RUN = "run-browser-probe"
PORT = "18769"


@pytest.fixture()
def live_env(monkeypatch, tmp_path):
    stop_live_server()
    live_dir = tmp_path / "live"
    exports = live_dir / "exports"
    exports.mkdir(parents=True)
    video_dir = live_dir / "video"
    video_dir.mkdir()
    monkeypatch.setattr("utils.paths.LIVE_DIR", live_dir)
    monkeypatch.setattr("utils.paths.DIARY_NDJSON", live_dir / "diary.ndjson")
    monkeypatch.setattr("utils.paths.LIVE_META_JSON", live_dir / "meta.json")
    monkeypatch.setattr("utils.paths.RESULTS_HOOKS_JSON", live_dir / "results_hooks.json")
    monkeypatch.setattr("utils.paths.LIVE_EXPORTS_DIR", exports)
    monkeypatch.setattr("utils.paths.VIDEO_DIR", video_dir)
    monkeypatch.setattr("utils.diary_bus.LIVE_DIR", live_dir)
    monkeypatch.setattr("utils.diary_bus.DIARY_NDJSON", live_dir / "diary.ndjson")
    monkeypatch.setattr("utils.diary_bus.LIVE_META_JSON", live_dir / "meta.json")
    monkeypatch.setattr("utils.diary_bus.RESULTS_HOOKS_JSON", live_dir / "results_hooks.json")
    monkeypatch.setattr("utils.diary_bus.LIVE_EXPORTS_DIR", exports)
    monkeypatch.setattr("utils.run_recording.VIDEO_DIR", video_dir)
    monkeypatch.setenv("PK_LIVE", "1")
    monkeypatch.setenv("PK_LIVE_PORT", PORT)
    monkeypatch.setenv("PK_RUN_ID", PROBE_RUN)
    # Владелец рана — admin: нужен для честного 403 чужому caller (ACL-негатив).
    index = tmp_path / "runs_index.ndjson"
    index.write_text(
        json.dumps({"run_id": PROBE_RUN, "owner_user_id": "admin", "status": "running"}) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("PK_RUNS_INDEX_PATH", str(index))
    diary_bus.clear()
    yield {"diary": live_dir / "diary.ndjson", "video_dir": video_dir}
    stop_live_server()
    diary_bus.clear()


def _append_raw(path: Path, **event) -> None:
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=False) + "\n")


def test_bound_run_live_browser_contract(live_env):
    sync_api = pytest.importorskip("playwright.sync_api")

    diary_bus.set_meta(session_name="browser-probe", status="running")
    diary_bus.publish("STEP", "step-own-1", channel="diary")
    diary_bus.publish("ERROR", "error-own-1", channel="diary")
    _append_raw(
        live_env["diary"],
        ts=time.time(),
        kind="STEP",
        channel="diary",
        text="foreign-step",
        run_id="run-other",
    )
    _append_raw(
        live_env["diary"], ts=time.time(), kind="STEP", channel="diary", text="unstamped-step"
    )

    url = start_live_server(session_name="browser-probe")
    assert url, "live server failed to start"

    with sync_api.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # 1) live-режим: активный ран + события своего рана; изоляция от чужих
        # LIVE-MONITOR-REVIVE: живой прогон подписан явно («живой прогон»).
        page.goto(f"{url}?run_id={PROBE_RUN}", wait_until="domcontentloaded")
        page.wait_for_function(
            "() => (document.getElementById('statusLabel')||{}).textContent === 'живой прогон'",
            timeout=6000,
        )
        page.wait_for_function(
            "() => (document.body.innerText || '').includes('step-own-1')",
            timeout=5000,
        )
        text = page.inner_text("body")
        assert "step-own-1" in text and "error-own-1" in text
        assert "foreign-step" not in text, "cross-run событие не должно отображаться"
        assert "unstamped-step" not in text, "неустановленный run_id не подмешивается"
        assert page.eval_on_selector("#recordingState", "el => el.dataset.state") == "live"

        # 2) финал: авто-переход в архив на том же id; события сохранены; видео готово
        t0 = time.monotonic()
        diary_bus.publish("STEP", "step-own-2", channel="diary")
        page.wait_for_function(
            "() => (document.body.innerText || '').includes('step-own-2')",
            timeout=5000,
        )
        latency = time.monotonic() - t0
        print(f"live event latency: {latency:.2f}s")
        assert latency <= 2.5, f"live-событие появилось за {latency:.2f}s"
        (live_env["video_dir"] / f"{PROBE_RUN}.mp4").write_bytes(b"\x00" * 64)
        diary_bus.set_meta(status="waiting")
        page.wait_for_function(
            "() => ((document.getElementById('statusLabel')||{}).textContent || '').startsWith('архив')",
            timeout=9000,
        )
        page.wait_for_function(
            "() => (document.getElementById('recordingState')||{}).dataset.state === 'ready'",
            timeout=9000,
        )
        text2 = page.inner_text("body")
        assert "step-own-1" in text2 and "step-own-2" in text2, "показанные события не потеряны"
        assert "foreign-step" not in text2 and "unstamped-step" not in text2
        dupes = page.evaluate(
            """() => Array.from(document.querySelectorAll('#diaryLog .row'))
                 .filter(r => (r.textContent||'').includes('step-own-1')).length"""
        )
        assert dupes == 1, f"событие продублировано после перехода: {dupes}"
        src = page.eval_on_selector("#replayVideo", "el => el.getAttribute('src') || ''")
        assert PROBE_RUN in src, "recording src — того же рана"

        # 3) unknown run → честный empty-state, без подмены глобальной метой
        page.goto(f"{url}?run_id=no-such-run-xyz", wait_until="domcontentloaded")
        page.wait_for_function(
            "() => (document.getElementById('statusLabel')||{}).textContent === 'неизвестный прогон'",
            timeout=6000,
        )
        banner = page.inner_text("#runStateBanner")
        assert "не найден" in banner
        page.wait_for_timeout(2600)
        assert page.inner_text("#statusLabel") == "неизвестный прогон"

        # 4) чужой caller → честный 403-баннер (без маскировки под «не найден»)
        page.context.add_cookies(
            [{"name": "pk_user", "value": "appsec-expert", "url": url}]
        )
        page.goto(f"{url}?run_id={PROBE_RUN}", wait_until="domcontentloaded")
        page.wait_for_function(
            "() => /403/.test(document.getElementById('runStateBanner')?.textContent || '')",
            timeout=6000,
        )

        assert not errors, f"page errors: {errors}"
        browser.close()
