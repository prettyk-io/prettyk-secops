# -*- coding: utf-8 -*-
"""QG-AF-9: Juice ZAP XML → live DefectDojo → admission gate (lab field)."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "orchestrator"))

from adapters.defectdojo_client import (  # noqa: E402
    resolve_dojo_gate_counts,
    trigger_defectdojo_import_detailed,
)
from core.gate_policy import AdmissionPolicy, evaluate_admission_gate  # noqa: E402
from core.gate_policy_load import load_gate_policy_bundle  # noqa: E402
from utils.paths import REPORTS_DIR  # noqa: E402


def main() -> int:
    xml = REPORTS_DIR / "scanner-results" / "juice_dojo.xml"
    if not xml.is_file():
        print(f"MISSING_XML {xml}")
        return 1

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    out_dir = REPORTS_DIR / "trials" / f"qg-af-field-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    # engagement from lab .env.example if unset
    os.environ.setdefault("KDT_DEFECTDOJO_ENGAGEMENT_MODE", "fixed")

    result = trigger_defectdojo_import_detailed(
        xml,
        check_id=f"qg-af-field-{stamp}",
        product_name="juice-shop-qg-af",
    )
    (out_dir / "import.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    if not result.get("ok") or result.get("skipped"):
        print(f"IMPORT_FAIL {result}")
        return 1

    dojo = result.get("dojo") if isinstance(result.get("dojo"), dict) else {}
    bundle = load_gate_policy_bundle()
    counts, src, err, audit, _collapsed = resolve_dojo_gate_counts(
        dojo,
        filter_policy=bundle.filter,
        waivers=bundle.waivers,
    )
    gate = evaluate_admission_gate(
        counts,
        bundle.admission
        if bundle.admission.enabled
        else AdmissionPolicy(max_critical=0, max_high=0, enabled=True),
        source=src or "dojo",
    )
    exit_code = 2 if gate.failed else 0
    if err:
        exit_code = 1

    summary = {
        "xml": str(xml),
        "counts": counts,
        "counts_source": src,
        "error": err,
        "filter_audit": audit,
        "gate_failed": gate.failed,
        "gate_label": gate.gate_label,
        "risk_hints": gate.risk_hints,
        "exit_code_simulated": exit_code,
        "dojo_test_id": dojo.get("test_id"),
        "dojo_engagement_id": dojo.get("engagement_id"),
        "policy_source": bundle.source_path,
    }
    (out_dir / "gate.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"EVIDENCE {out_dir}")
    return exit_code if exit_code in (0, 2) else 1


if __name__ == "__main__":
    raise SystemExit(main())
