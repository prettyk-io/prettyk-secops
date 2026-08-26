# -*- coding: utf-8 -*-
"""FZ-B5 Juice lab harness: Campaign on search API via ZAP demon → evidence + Live.

Внутренний wire/harness, не продуктовая поверхность PrettyK.
Login не обязателен: /rest/products/search публичен.
Session-bound (History+Cookie): tools/lab_fuzz_juice_session_a.py (POC-A).
"""
from __future__ import annotations
from utils.env_dual import pk_env

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
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
SEARCH_URL = f"{BASE_URL}/rest/products/search?q="
DEFAULT_CORPUS = ROOT / "data" / "fuzz" / "juice_search_lab.txt"


def _publish_live(summary: dict) -> list[str]:
    titles = live_projection_titles(summary)
    set_meta(session_name="fz-b5-juice", status="running")
    for i, title in enumerate(titles):
        kind = "STEP" if i == 0 else "NOTE"
        publish(kind, f"Фаззинг | {title}", channel="diary")
    set_meta(status="waiting")
    return titles


def main() -> int:
    parser = argparse.ArgumentParser(description="FZ-B5 Juice fuzz lab harness")
    parser.add_argument(
        "--corpus",
        type=Path,
        default=DEFAULT_CORPUS,
        help="lab .txt corpus (#-комментарии ок; ≤25 строк)",
    )
    parser.add_argument("--zap-host", default=pk_env("ZAP_HOST", "127.0.0.1"))
    parser.add_argument(
        "--zap-port",
        type=int,
        default=int(pk_env("ZAP_PORT", "8080")),
    )
    parser.add_argument("--no-live", action="store_true", help="не писать в diary.ndjson")
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
    campaign = Campaign(
        message=FuzzMessage(
            source="template",
            method="GET",
            url=SEARCH_URL,
        ),
        location=FuzzLocation(kind="query_param", name="q"),
        payloads=payloads,
        policy=FuzzPolicy(max_requests=len(payloads), requests_per_second=1.0),
        module_id="juice_search_b5",
    )
    print(f"FZ-B5: ZAP {args.zap_host}:{args.zap_port} → {SEARCH_URL}", flush=True)
    print(f"corpus: {args.corpus} ({len(payloads)} строк)", flush=True)

    summary = FuzzCampaignRunner(zap).run(campaign, base_url=BASE_URL)
    evidence_path = summary.get("evidence_path") or ""
    digest_path = summary.get("digest_path") or ""
    print(
        f"evidence: {evidence_path} "
        f"digest: {digest_path} "
        f"cases={summary.get('cases_total')} anomalies={summary.get('anomalies_total')}",
        flush=True,
    )

    if not args.no_live:
        titles = _publish_live(summary)
        print("live titles:", flush=True)
        for title in titles:
            print(f"  - {title}", flush=True)

    # Ненулевой exit только при полном провале транспорта всех кейсов.
    if int(summary.get("cases_total") or 0) == 0:
        return 2
    transport_all = all(
        (c.get("transport_error") for c in (summary.get("cases") or []))
    )
    if transport_all:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
