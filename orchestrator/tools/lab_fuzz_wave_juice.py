# -*- coding: utf-8 -*-
"""Wave L lab: SuiteFuzzer (ФаззингВолна) → Campaign on Juice search.

Harness без полного Controller: тот же SuiteFuzzerRunner, что MethodId.
Login не обязателен (публичный search). Session-bound — lab_fuzz_juice_session_a.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import argparse
import os
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import ZapAdapter
from core.errors import WiredError
from core.fuzzing import SuiteFuzzerRunner, live_projection_titles
from core.gate_policy import zap_api_key_from_env
from utils.diary_bus import publish, set_meta

BASE_URL = "http://juice-shop:3000"
SEARCH_URL = f"{BASE_URL}/rest/products/search?q="


def _manifest(corpus: str, max_requests: int) -> SimpleNamespace:
    fuzzer = SimpleNamespace(
        id="juice_search_q",
        label="Juice search q",
        algorithm="triples",
        targets=[
            {
                "url": SEARCH_URL,
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
        session_replay=False,
        headers={},
        follow_redirects=True,
    )
    return SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer], test_data_constructor=[]),
        security_configuration=SimpleNamespace(base_url_override=BASE_URL),
    )


class _EmptyStream:
    def get_path(self, name: str):
        raise WiredError(f"lab wave: unexpected stream corpus {name!r}")

    def resolve_arg(self, value):
        return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Wave L: ФаззингВолна juice_search_q")
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

    zap = ZapAdapter(
        host=args.zap_host,
        port=args.zap_port,
        api_key=zap_api_key_from_env(),
        base_url=BASE_URL,
    )
    try:
        summary = SuiteFuzzerRunner(
            _manifest(args.corpus, args.max_requests), zap, _EmptyStream()
        ).run("juice_search_q")
    except WiredError as exc:
        raise SystemExit(str(exc)) from exc

    if not args.no_live:
        titles = live_projection_titles(summary)
        set_meta(session_name="fz-wave-juice", status="running")
        for i, title in enumerate(titles):
            kind = "STEP" if i == 0 else "NOTE"
            publish(kind, f"ФаззингВолна | {title}", channel="diary")
        set_meta(status="waiting")

    print(
        f"ok module_id={summary.get('module_id')} "
        f"cases_total={summary.get('cases_total')} "
        f"session_bound={summary.get('session_bound')} "
        f"digest={summary.get('digest_path')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
