# -*- coding: utf-8 -*-
"""K5: Baseline integrity verification — EXP-01 fixtures must never mutate.
Usage: .\.venv\Scripts\python.exe orchestrator\tools\verify_baseline_integrity.py
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "exp01_reference"

# Frozen SHA256 — captured 2026-08-20 W1 acceptance
# DO NOT EDIT unless deliberately rotating the baseline.
EXPECTED: dict[str, str] = {
    "dojo_baseline_findings.json": "952be4c758a2dccb3c350d431975b2a4f5b9c56fc06fdaa6d7582518be86e7a3",
    "zap_raw_alerts_from_xml.json": "d9ec3807ce88bbef73e6fba8e7060b275a8b125c76cee6736f8edf2c07ef7dbb",
    "zap_raw_report.xml": "a7528434fbcd61f515124973743903471f8d58d2ecc8eebe7736d6fb7bcd9102",
    "Wired.json": "c5603cc407cb2ba6bdaf7ff69213116e0ea2cef5d5ead0824887ee2696c6bdab",
    "spider_urls.json": "5eb6e973721794618c4f0e5b22a4a13131d0e26cb86b12a64f48e963d93d1a9b",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    ok = 0
    fail = 0
    for name, expected_hash in EXPECTED.items():
        path = BASE / name
        if not path.is_file():
            print(f"  MISSING  {name}")
            fail += 1
            continue
        actual = sha256(path)
        if actual == expected_hash:
            print(f"  OK       {name}")
            ok += 1
        else:
            print(f"  FAIL     {name}  (expected {expected_hash[:12]}..., got {actual[:12]}...)")
            fail += 1

    print(f"\n{ok} OK, {fail} FAILED out of {len(EXPECTED)}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())