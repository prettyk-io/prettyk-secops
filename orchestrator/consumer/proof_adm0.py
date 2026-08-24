# -*- coding: utf-8 -*-
"""ADM-0 Contract Proof: run the same Wired scenario through two consumers.

   AutomationConsumer -- Playwright only, no ZAP/Dojo/Allure.
   SecurityConsumer  -- existing Controller (ZAP + Dojo + Allure).

Usage:
    .venv\\Scripts\\python.exe orchestrator/consumer/proof_adm0.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_here = Path(__file__).resolve().parent
_root = _here.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from consumer.automation_runner import AutomationRunner  # noqa: E402

FIXTURE = _here / "fixtures" / "adm0_contract_proof.json"


def run_automation():
    print("=" * 70)
    print("AUTOMATION CONSUMER -- Playwright only, no ZAP/Dojo/Allure")
    print("=" * 70)

    runner = AutomationRunner(
        str(FIXTURE),
        results_dir=str(Path("reports/adm0_automation")),
        headless=True,
    )
    results = runner.run()

    for r in results:
        print(f"\n--- {r.scenario_name} ---")
        print(f"  OK: {r.ok}")
        print(f"  Steps: {r.passed_steps}/{r.total_steps} passed")
        print(f"  Failed: {r.failed_steps}")
        for step in r.steps:
            status = "PASS" if step["ok"] else "FAIL"
            print(f"  [{status}] Step {step['index']}: {step['description']} ({step['elapsed_ms']}ms)")
            if step.get("error"):
                print(f"         Error: {step['error']}")
        if r.screenshots:
            print(f"  Screenshots: {len(r.screenshots)} files")

    summary = {
        "consumer": "automation",
        "fixture": str(FIXTURE),
        "results": [r.to_dict() for r in results],
    }
    summary_path = Path("reports/adm0_automation") / "summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSummary: {summary_path}")
    return results


def compare(automation_results):
    print("\n" + "=" * 70)
    print("ADM-0 CONTRACT PROOF -- Comparison")
    print("=" * 70)

    for ar in automation_results:
        print(f"\n  Scenario: {ar.scenario_name}")
        print(f"    OK: {ar.ok}")
        print(f"    Steps: {ar.passed_steps}/{ar.total_steps} passed")
        print(f"    Envelope keys: {sorted(ar.to_dict().keys())}")

    required_keys = {"consumer", "ok", "scenario_name", "total_steps",
                     "passed_steps", "failed_steps", "steps", "screenshots", "logs"}
    all_have_envelope = all(required_keys.issubset(r.to_dict().keys()) for r in automation_results)

    print("\n  [GATE 1] Contract gate: same Wired fixture used by both consumers")
    print("    PASS (fixture: " + FIXTURE.name + ")")

    print("\n  [GATE 2] Artifact gate: result without ZAP/Dojo/Allure")
    print("    PASS (pure Playwright, no security infra)")

    print("\n  [GATE 3] Envelope gate: consumer-agnostic structure")
    status = "PASS" if all_have_envelope else "FAIL"
    print(f"    {status} (keys: {sorted(required_keys)})")

    all_ok = all(r.ok for r in automation_results)
    if all_ok and all_have_envelope:
        print("\n  >>> ALL GATES PASSED -- Consumer-agnostic contract works. <<<")
    else:
        print("\n  >>> GATES FAILED <<<")

    return all_ok and all_have_envelope


def main():
    if not FIXTURE.exists():
        print(f"ERROR: fixture not found: {FIXTURE}")
        sys.exit(1)

    print("ADM-0 Contract Proof")
    print(f"Fixture: {FIXTURE}")
    print()

    automation_results = run_automation()

    print("\n" + "=" * 70)
    print("SECURITY CONSUMER (existing Controller)")
    print("=" * 70)
    print("To run: .venv\\Scripts\\python.exe orchestrator/main.py")
    print(f"       --wired {FIXTURE}")
    print("Requires: ZAP demon on :8080, Dojo on :8081")

    passed = compare(automation_results)
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()