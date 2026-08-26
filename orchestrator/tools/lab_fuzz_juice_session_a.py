# -*- coding: utf-8 -*-
"""POC-A lab: seed History с Cookie → Campaign(source=history) → evidence session-bound.

Бэкенд harness, не PrettyK. Сценарий:
  1) GET search через ZAP с Cookie (попадает в History);
  2) Campaign берёт последнее matching сообщение и replay headers;
  3) Live: заголовок с пометкой session-bound; evidence без значений Cookie.

См. docs/fuzzing-module-complex.md §3.1.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import ZapAdapter
from core.errors import WiredError
from core.fuzzing import (
    Campaign,
    FuzzCampaignRunner,
    FuzzLocation,
    FuzzMessage,
    FuzzPolicy,
    live_projection_titles,
    load_corpus_file,
)
from core.gate_policy import zap_api_key_from_env
from utils.diary_bus import publish, set_meta

BASE_URL = "http://juice-shop:3000"
SEARCH_URL = f"{BASE_URL}/rest/products/search?q=seed"
DEFAULT_CORPUS = ROOT / "data" / "fuzz" / "juice_search_lab.txt"
LAB_COOKIE = "token=pk-lab-session-poc-a"


def _publish_live(summary: dict) -> list[str]:
    titles = live_projection_titles(summary)
    set_meta(session_name="fz-poc-a-session", status="running")
    for i, title in enumerate(titles):
        kind = "STEP" if i == 0 else "NOTE"
        publish(kind, f"Фаззинг | {title}", channel="diary")
    set_meta(status="waiting")
    return titles


def main() -> int:
    parser = argparse.ArgumentParser(description="POC-A Juice session-bound fuzz harness")
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--zap-host", default=pk_env("ZAP_HOST", "127.0.0.1"))
    parser.add_argument(
        "--zap-port",
        type=int,
        default=int(pk_env("ZAP_PORT", "8080")),
    )
    parser.add_argument("--no-live", action="store_true")
    parser.add_argument(
        "--cookie",
        default=LAB_COOKIE,
        help="Cookie для seed-запроса в History (не пишется в evidence)",
    )
    args = parser.parse_args()

    try:
        payloads = load_corpus_file(args.corpus)
    except WiredError as exc:
        raise SystemExit(str(exc)) from exc
    zap = ZapAdapter(
        host=args.zap_host,
        port=args.zap_port,
        api_key=zap_api_key_from_env(),
        base_url=BASE_URL,
    )

    print(
        f"POC-A seed: GET {SEARCH_URL} via ZAP with Cookie (value redacted)",
        flush=True,
    )
    zap.zap_http_request(
        "GET",
        SEARCH_URL,
        headers={"Cookie": args.cookie, "Accept": "application/json"},
        follow_redirects=True,
    )

    campaign = Campaign(
        message=FuzzMessage(
            source="history",
            history_url_contains="/rest/products/search",
            history_method="GET",
        ),
        location=FuzzLocation(kind="query_param", name="q"),
        payloads=payloads,
        policy=FuzzPolicy(max_requests=len(payloads), requests_per_second=1.0),
        module_id="juice_session_a",
    )
    print(
        f"POC-A run: History → Campaign ZAP {args.zap_host}:{args.zap_port}",
        flush=True,
    )
    summary = FuzzCampaignRunner(zap).run(campaign, base_url=BASE_URL)
    evidence_path = summary.get("evidence_path") or ""
    digest_path = summary.get("digest_path") or ""
    print(
        f"evidence: {evidence_path} "
        f"digest: {digest_path} "
        f"cases={summary.get('cases_total')} anomalies={summary.get('anomalies_total')} "
        f"has_cookie={summary.get('has_cookie')} session_bound={summary.get('session_bound')}",
        flush=True,
    )
    leak_blobs = []
    if evidence_path:
        leak_blobs.append(Path(evidence_path).read_text(encoding="utf-8"))
    if digest_path:
        leak_blobs.append(Path(digest_path).read_text(encoding="utf-8"))
    if args.cookie and any(args.cookie in blob for blob in leak_blobs):
        print("FAIL: Cookie value leaked into evidence/digest", flush=True)
        return 4
    if not summary.get("has_cookie"):
        print(
            "WARN: has_cookie=false — History, возможно, не вернул Cookie "
            "(версия ZAP / формат messages). Ядро unit-тестами покрыто.",
            flush=True,
        )

    if not args.no_live:
        titles = _publish_live(summary)
        print("live titles:", flush=True)
        for title in titles:
            print(f"  - {title}", flush=True)

    if int(summary.get("cases_total") or 0) == 0:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
