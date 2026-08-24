# -*- coding: utf-8 -*-
"""DF-11 lab: sniper {MASK} + pitchfork MASK_1/MASK_2 (+ TAB) на Juice search.

Стенд: ZAP demon :8080, Juice через Docker DNS ``juice-shop:3000``.
Публичный search — login не нужен.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import argparse
import os
import sys
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

BASE_URL = "http://juice-shop:3000"


class _EmptyStream:
    def get_path(self, name: str):
        raise WiredError(f"lab df11: unexpected stream corpus {name!r}")

    def resolve_arg(self, value):
        return value


def _policy(max_requests: int) -> SimpleNamespace:
    return SimpleNamespace(
        max_requests=max_requests,
        requests_per_second=1.0,
        alert_on_server_error=True,
        latency_multiplier=3.0,
        size_ratio=3.0,
        size_abs_delta=2048,
    )


def _wired_sniper(corpus: str, max_requests: int) -> SimpleNamespace:
    fuzzer = SimpleNamespace(
        id="juice_df11_sniper",
        label="DF-11 sniper MASK",
        algorithm="triples",
        targets=[
            {
                "url": f"{BASE_URL}/rest/products/search?q={{MASK}}",
                "method": "GET",
                "corpus": corpus,
            }
        ],
        policy=_policy(max_requests),
        session_replay=False,
        headers={},
        follow_redirects=True,
    )
    return SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer], test_data_constructor=[]),
        security_configuration=SimpleNamespace(base_url_override=BASE_URL),
    )


def _wired_pitchfork(max_requests: int) -> SimpleNamespace:
    fuzzer = SimpleNamespace(
        id="juice_df11_pitchfork",
        label="DF-11 pitchfork MASK_1/MASK_2",
        algorithm="triples",
        targets=[
            {
                "url": (
                    f"{BASE_URL}/rest/products/search?"
                    "q={MASK_1}&d={MASK_2}"
                ),
                "method": "GET",
                "corpus": "intent_lab_a,intent_lab_b",
            }
        ],
        policy=_policy(max_requests),
        session_replay=False,
        headers={},
        follow_redirects=True,
    )
    return SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer], test_data_constructor=[]),
        security_configuration=SimpleNamespace(base_url_override=BASE_URL),
    )


def _wired_tab(max_requests: int) -> SimpleNamespace:
    fuzzer = SimpleNamespace(
        id="juice_df11_tab",
        label="DF-11 TAB slots",
        algorithm="triples",
        targets=[
            {
                "url": (
                    f"{BASE_URL}/rest/products/search?"
                    "q={MASK_1}&d={MASK_2}"
                ),
                "method": "GET",
                "corpus": "intent_pairs_lab",
            }
        ],
        policy=_policy(max_requests),
        session_replay=False,
        headers={},
        follow_redirects=True,
    )
    return SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer], test_data_constructor=[]),
        security_configuration=SimpleNamespace(base_url_override=BASE_URL),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="DF-11 lab: sniper / pitchfork / tab")
    parser.add_argument(
        "--mode",
        choices=("sniper", "pitchfork", "tab", "all"),
        default="all",
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

    modes = (
        ["sniper", "pitchfork", "tab"] if args.mode == "all" else [args.mode]
    )
    zap = ZapAdapter(
        host=args.zap_host,
        port=args.zap_port,
        api_key=zap_api_key_from_env(),
        base_url=BASE_URL,
    )

    for mode in modes:
        if mode == "sniper":
            wired = _wired_sniper(args.corpus, args.max_requests)
            fuzzer_id = "juice_df11_sniper"
        elif mode == "pitchfork":
            wired = _wired_pitchfork(args.max_requests)
            fuzzer_id = "juice_df11_pitchfork"
        else:
            wired = _wired_tab(args.max_requests)
            fuzzer_id = "juice_df11_tab"

        try:
            summary = SuiteFuzzerRunner(Wired, zap, _EmptyStream()).run(fuzzer_id)
        except WiredError as exc:
            raise SystemExit(f"{mode}: {exc}") from exc

        if not args.no_live:
            titles = live_projection_titles(summary)
            set_meta(session_name=f"fz-df11-{mode}", status="running")
            for i, title in enumerate(titles):
                kind = "STEP" if i == 0 else "NOTE"
                publish(kind, f"ФаззингВолна | {title}", channel="diary")
            set_meta(status="waiting")

        print(
            f"ok mode={mode} module_id={summary.get('module_id')} "
            f"cases_total={summary.get('cases_total')} "
            f"requests_count={summary.get('requests_count')} "
            f"digest={summary.get('digest_path')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
