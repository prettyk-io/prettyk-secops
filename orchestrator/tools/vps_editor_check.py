# -*- coding: utf-8 -*-
"""Lightweight prod checks for VPS Editor (root host canon).

Usage (from repo root):
  py -3 orchestrator/tools/vps_editor_check.py
  py -3 orchestrator/tools/vps_editor_check.py --full
  py -3 orchestrator/tools/vps_editor_check.py --ssh-only

Default = HTTP surface (no SSH). ``--full`` adds disk + systemd + API via SSH.
Exit 0 = all selected checks green; 1 = at least one red. Never prints password.
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

_TOOLS = Path(__file__).resolve().parent
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from vps_editor_lib import (  # noqa: E402
    API_HEALTH_LOCAL,
    API_UNIT,
    EDITOR_URL,
    LOGIN_VIDEO_POSTER_URL,
    LOGIN_VIDEO_URL,
    LOGIN_VIDEO_WEBM_URL,
    REMOTE_PRETTYK_LIVE,
    ssh_connect,
    ssh_run,
)

CheckFn = Callable[[], tuple[bool, str]]


def _http_head(url: str, timeout: float = 20.0) -> tuple[int, dict[str, str], int]:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "kdt-check/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        headers = {k.lower(): v for k, v in resp.headers.items()}
        length = int(headers.get("content-length") or "0")
        return resp.status, headers, length


def _http_get(url: str, timeout: float = 20.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "kdt-check/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", "replace")
        return resp.status, body


def check_editor_html() -> tuple[bool, str]:
    try:
        status, body = _http_get(EDITOR_URL)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return False, f"editor HTML: FAIL ({exc})"
    if status != 200:
        return False, f"editor HTML: HTTP {status}"
    # Root must be SPA, not Apache directory listing.
    if "Index of /" in body and "index-" not in body:
        return False, (
            "editor HTML: root is Apache listing — apply deploy_vps/apache-prettyk.conf "
            "(DocumentRoot → prettyk)"
        )
    js = re.search(r'src="\./assets/(index-[^"]+\.js)"', body)
    css = re.search(r'href="\./assets/(index-[^"]+\.css)"', body)
    if not js or not css:
        return False, "editor HTML: 200 but missing index-*.js/css refs"
    return True, f"editor HTML: 200 · {js.group(1)} · {css.group(1)}"


def check_login_video() -> tuple[bool, str]:
    bits: list[str] = []
    ok = True
    # mp4 — обязательный fallback; webm/poster — когда залиты (иначе SPA HTML ~1KB)
    required = (("mp4", LOGIN_VIDEO_URL, 1_000_000, "video"),)
    optional = (
        ("webm", LOGIN_VIDEO_WEBM_URL, 500_000, "video"),
        ("poster", LOGIN_VIDEO_POSTER_URL, 5_000, "image"),
    )
    for label, url, min_len, expect_sub in required + optional:
        try:
            status, headers, length = _http_head(url)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            bits.append(f"{label}: FAIL ({exc})")
            if (label, url, min_len, expect_sub) in required:
                ok = False
            continue
        ctype = headers.get("content-type", "")
        cache = headers.get("cache-control", "")
        part_ok = status == 200 and length >= min_len and expect_sub in ctype
        note = "" if part_ok else " (missing/stale)"
        if not part_ok and (label, url, min_len, expect_sub) in required:
            ok = False
        bits.append(
            f"{label}: HTTP {status} · {length} B · {ctype or '?'} · cache={cache or '—'}{note}"
        )
    detail = "login media: " + " | ".join(bits)
    return ok, detail if ok else detail + " (expect mp4 video ≥1MB)"


def check_ssh_disk() -> tuple[bool, str]:
    try:
        client = ssh_connect()
    except Exception as exc:  # noqa: BLE001 — surface connect errors
        return False, f"ssh disk: connect FAIL ({exc})"
    try:
        bits: list[str] = []
        ok = True
        for path in (REMOTE_PRETTYK_LIVE,):
            code, out = ssh_run(
                client,
                f"test -f {path}/index.html && test -f {path}/media/login-bg.mp4 "
                f"&& du -h {path}/media/login-bg.mp4 "
                f"&& (test -f {path}/media/login-bg.webm && du -h {path}/media/login-bg.webm || echo no-webm) "
                f"&& (test -f {path}/media/login-bg-poster.webp && echo poster-ok || echo no-poster) "
                f"&& echo OK || echo MISSING",
            )
            line = out.replace("\n", " | ")
            bits.append(f"{path}: {line}")
            if "MISSING" in out or code != 0:
                ok = False
        return ok, "ssh disk: " + "; ".join(bits)
    finally:
        client.close()


def check_ssh_api() -> tuple[bool, str]:
    try:
        client = ssh_connect()
    except Exception as exc:  # noqa: BLE001
        return False, f"ssh api: connect FAIL ({exc})"
    try:
        _c1, unit = ssh_run(client, f"systemctl is-active {API_UNIT} 2>&1 || true")
        _c2, health = ssh_run(
            client,
            f"curl -fsS --max-time 5 {API_HEALTH_LOCAL} 2>&1 || echo HEALTH_FAIL",
        )
        unit_ok = unit.strip() == "active"
        health_ok = "HEALTH_FAIL" not in health and bool(health.strip())
        ok = unit_ok and health_ok
        return ok, f"ssh api: unit={unit.strip()} · health={health[:120]}"
    finally:
        client.close()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="VPS Editor light checks")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--full", action="store_true", help="HTTP + SSH disk + API")
    g.add_argument("--http-only", action="store_true", help="HTTP only (default)")
    g.add_argument("--ssh-only", action="store_true", help="SSH disk + API only")
    args = ap.parse_args()

    if args.ssh_only:
        checks: list[CheckFn] = [check_ssh_disk, check_ssh_api]
    elif args.full:
        checks = [check_editor_html, check_login_video, check_ssh_disk, check_ssh_api]
    else:
        checks = [check_editor_html, check_login_video]

    failed = 0
    for fn in checks:
        ok, msg = fn()
        print(("OK  " if ok else "RED ") + msg)
        if not ok:
            failed += 1

    print(f"---\n{EDITOR_URL}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
