# -*- coding: utf-8 -*-
"""Idle CBR SecOps Automation Monitoring wrapper (shared diary.ndjson with orchestrator runs)."""
import logging
import os
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.diary_bus import clear_ci_meta, set_meta
from utils.env_dual import pk_env
from utils.live_server import default_novnc_url, live_port, start_live_server

logger = logging.getLogger("orchestrator")


def _env_flag(name: str) -> bool:
    base = name[3:] if name.startswith("PK_") else name
    raw = os.environ.get(f"PK_{base}")
    return (raw or "").strip().lower() in ("1", "true", "yes", "on")


def _maybe_start_gha_poller() -> None:
    """RES-G opt-in: PK_GHA_POLL=1 + TOKEN/REPO → background watch → Live ci/status."""
    if not _env_flag("PK_GHA_POLL"):
        return
    try:
        from utils.gha_poller import load_gha_config_from_env, poll_loop
    except Exception as exc:
        print(f"GHA poller import failed: {exc}", flush=True)
        return
    try:
        cfg = load_gha_config_from_env()
    except ValueError as exc:
        print(f"GHA poller skipped: {exc}", flush=True)
        return
    interval = float(pk_env("GHA_POLL_INTERVAL_SEC") or "30")

    def _run() -> None:
        try:
            poll_loop(cfg, interval_sec=interval, push=True)
        except Exception as exc:
            logger.warning("gha_poller thread stopped: %s", exc)

    threading.Thread(target=_run, name="gha-poller", daemon=True).start()
    print(
        f"GHA poller on ({cfg.repo}, every {interval}s)",
        flush=True,
    )


if __name__ == "__main__":
    from utils.single_instance import AlreadyRunning, ensure_single_instance

    # BOX-IDLE-NORM: refuse to start a zombie duplicate before touching meta.
    # The real Live shell owns :8767; a duplicate would linger in the sleep loop.
    try:
        ensure_single_instance(live_port(), "run_live_idle")
    except AlreadyRunning:
        sys.exit(0)

    # Clean stale CI verdicts from disk before idle — otherwise Results shows old run data.
    clear_ci_meta()
    set_meta(
        session_name="idle",
        status="waiting",
        novnc_url=default_novnc_url("chrome"),
    )
    url = start_live_server(session_name="idle")
    set_meta(status="waiting")
    print("LIVE", url or "FAILED", flush=True)
    _maybe_start_gha_poller()
    while True:
        time.sleep(3600)
