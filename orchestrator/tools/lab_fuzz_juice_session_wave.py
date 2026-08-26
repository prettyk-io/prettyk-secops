# -*- coding: utf-8 -*-
"""DF-10 lab: Juice login → History session → SuiteFuzzerRunner (ФаззингВолна).

1) POST /rest/user/login напрямую к Juice (реальный login API; ZAP 2.17
   sendHarRequest ломается на POST JSON — illegal_parameter).
2) Seed GET search **через ZAP** с Bearer/Cookie → History с session headers.
3) ФаззингВолна с session_replay=true без history_url_contains (same-origin fallback).
4) Проверка: session_bound meta, нет утечки значений токена в evidence/digest.

Стенд: ZAP demon :8080. ``--base-url`` — URL глазами ZAP (обычно
``http://juice-shop:3000``). ``--login-url`` — URL с хоста агента
(``http://127.0.0.1:3000``), если Docker DNS недоступен с Windows.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import ZapAdapter
from core.errors import WiredError
from core.fuzzing import SuiteFuzzerRunner, live_projection_titles
from core.gate_policy import zap_api_key_from_env
from utils.diary_bus import publish, set_meta

DEFAULT_BASE = "http://juice-shop:3000"
DEFAULT_LOGIN_URL = "http://127.0.0.1:3000"
DEFAULT_EMAIL = "admin@juice-sh.op"
DEFAULT_PASSWORD = "admin123"


class _EmptyStream:
    def get_path(self, name: str):
        raise WiredError(f"lab session-wave: unexpected stream corpus {name!r}")

    def resolve_arg(self, value):
        return value


def _manifest(base_url: str, corpus: str, max_requests: int) -> SimpleNamespace:
    fuzzer = SimpleNamespace(
        id="juice_session_wave",
        label="Juice session-bound wave",
        algorithm="triples",
        targets=[
            {
                "url": f"{base_url.rstrip('/')}/rest/products/search?q=",
                "method": "GET",
                "corpus": corpus,
            }
        ],
        policy=SimpleNamespace(
            max_requests=max_requests,
            requests_per_second=1.0,
            alert_on_server_error=True,
            latency_multiplier=3.0,
            size_ratio=3.0,
            size_abs_delta=2048,
        ),
        session_replay=True,
        headers={},
        follow_redirects=True,
        message=None,
    )
    return SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer], test_data_constructor=[]),
        security_configuration=SimpleNamespace(base_url_override=base_url),
    )


def _extract_token(body: str) -> str:
    try:
        data = json.loads(body or "")
    except json.JSONDecodeError as exc:
        raise WiredError(f"login: ответ не JSON: {body[:180]!r}") from exc
    auth = data.get("authentication") if isinstance(data, dict) else None
    token = ""
    if isinstance(auth, dict):
        token = str(auth.get("token") or "")
    if not token and isinstance(data, dict):
        token = str(data.get("token") or "")
    if not token:
        raise WiredError("login: в ответе нет authentication.token")
    return token


def _login_direct(login_base: str, email: str, password: str) -> str:
    """Реальный Juice login с хоста (не через sendHarRequest POST)."""
    url = f"{login_base.rstrip('/')}/rest/user/login"
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            status = int(getattr(resp, "status", 200) or 200)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise WiredError(f"login HTTP {exc.code}: {body[:200]!r}") from exc
    except urllib.error.URLError as exc:
        raise WiredError(f"login unreachable {url}: {exc}") from exc
    if status not in (200, 201):
        raise WiredError(f"login status={status} body={body[:200]!r}")
    return _extract_token(body)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="DF-10: Juice login → session_replay ФаззингВолна"
    )
    parser.add_argument(
        "--base-url",
        default=pk_env("JUICE_URL", DEFAULT_BASE),
        help="URL цели для ZAP / same-origin (Docker DNS)",
    )
    parser.add_argument(
        "--login-url",
        default=pk_env("JUICE_LOGIN_URL", DEFAULT_LOGIN_URL),
        help="URL Juice с хоста для прямого login",
    )
    parser.add_argument("--email", default=pk_env("JUICE_EMAIL", DEFAULT_EMAIL))
    parser.add_argument(
        "--password", default=pk_env("JUICE_PASSWORD", DEFAULT_PASSWORD)
    )
    parser.add_argument("--corpus", default="intent_boundary")
    parser.add_argument("--max-requests", type=int, default=5)
    parser.add_argument("--zap-host", default=pk_env("ZAP_HOST", "127.0.0.1"))
    parser.add_argument(
        "--zap-port",
        type=int,
        default=int(pk_env("ZAP_PORT", "8080")),
    )
    parser.add_argument("--no-live", action="store_true")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    zap = ZapAdapter(
        host=args.zap_host,
        port=args.zap_port,
        api_key=zap_api_key_from_env(),
        base_url=base,
    )

    print(f"DF-10 login POST {args.login_url}/rest/user/login (password redacted)", flush=True)
    try:
        token = _login_direct(args.login_url, args.email, args.password)
    except WiredError as exc:
        print(f"FAIL: {exc}", flush=True)
        return 3

    # Seed History: авторизованный запрос same-origin (fallback pick без url_contains).
    seed_url = f"{base}/rest/products/search?q=session-seed"
    print("DF-10 seed GET search with Bearer (value redacted)", flush=True)
    zap.zap_http_request(
        "GET",
        seed_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Cookie": f"token={token}",
            "Accept": "application/json",
        },
        follow_redirects=True,
    )

    try:
        summary = SuiteFuzzerRunner(
            _manifest(base, args.corpus, args.max_requests), zap, _EmptyStream()
        ).run("juice_session_wave")
    except WiredError as exc:
        print(f"FAIL: {exc}", flush=True)
        return 2

    evidence_path = str(summary.get("evidence_path") or "")
    digest_path = str(summary.get("digest_path") or "")
    print(
        f"ok module_id={summary.get('module_id')} "
        f"cases={summary.get('cases_total')} "
        f"session_bound={summary.get('session_bound')} "
        f"has_cookie={summary.get('has_cookie')} "
        f"has_authorization={summary.get('has_authorization')} "
        f"stopped={summary.get('stopped_reason')} "
        f"digest={digest_path}",
        flush=True,
    )

    if not summary.get("session_bound"):
        print("FAIL: session_bound=false after login seed", flush=True)
        return 4

    leak_blobs: list[str] = []
    if evidence_path:
        leak_blobs.append(Path(evidence_path).read_text(encoding="utf-8"))
    if digest_path:
        leak_blobs.append(Path(digest_path).read_text(encoding="utf-8"))
    if token and any(token in blob for blob in leak_blobs):
        print("FAIL: token leaked into evidence/digest", flush=True)
        return 5

    if not args.no_live:
        titles = live_projection_titles(summary)
        set_meta(session_name="fz-df10-session-wave", status="running")
        for i, title in enumerate(titles):
            kind = "STEP" if i == 0 else "NOTE"
            publish(kind, f"ФаззингВолна | {title}", channel="diary")
        set_meta(status="waiting")
        print("live titles:", flush=True)
        for title in titles:
            print(f"  - {title}", flush=True)

    if int(summary.get("cases_total") or summary.get("requests_count") or 0) == 0:
        return 6
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
