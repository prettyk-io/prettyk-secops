# -*- coding: utf-8 -*-
"""K1 calibration: Qwen3 classify vs EXP-01 baseline findings.
Usage: .\.venv\Scripts\python.exe orchestrator\lab\calibrate_qwen3.py
"""
from __future__ import annotations

import json
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "exp01_reference"
FIN = BASE / "dojo_baseline_findings.json"
OUT = Path(__file__).resolve().parents[2] / "pure" / "research" / "qw3_calibration_w1.json"

LLM_URL = "http://127.0.0.1:8766/api/ai/classify"
LIVE_URL = "http://127.0.0.1:8767/api/ai/classify"


def load_findings() -> list[dict]:
    raw = json.loads(FIN.read_text("utf-8"))
    findings = raw.get("findings", [])
    return [f for f in findings if isinstance(f, dict) and f.get("title")]


def deduplicate(findings: list[dict]) -> list[dict]:
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for f in findings:
        key = (str(f.get("title", "")).strip(), str(f.get("severity", "")).lower())
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def classify_one(finding: dict, *, via_live: bool = True) -> dict | None:
    url = LIVE_URL if via_live else LLM_URL
    payload = json.dumps({
        "alert": {
            "name": finding.get("title", ""),
            "description": finding.get("title", ""),
            "risk": finding.get("severity", "info"),
            "confidence": "Medium" if finding.get("cwe") else "N/A",
        }
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode("utf-8", errors="replace")}
    except urllib.error.URLError:
        return {"error": "connection_refused"}
    except Exception as exc:
        return {"error": str(exc)}


def run():
    findings = load_findings()
    unique = deduplicate(findings)
    print(f"Baseline findings: {len(findings)} total, {len(unique)} unique\n")
    results: list[dict] = []
    total_ms = 0.0
    ok_count = 0
    for i, f in enumerate(unique):
        t0 = time.perf_counter()
        ai = classify_one(f, via_live=False)
        elapsed = (time.perf_counter() - t0) * 1000
        total_ms += elapsed

        entry = {
            "idx": i,
            "title": f.get("title"),
            "zap_severity": f.get("severity"),
            "cwe": f.get("cwe"),
            "latency_ms": round(elapsed, 1),
        }
        if ai and "error" not in ai:
            entry["ai_severity"] = ai.get("severity")
            entry["ai_fp_confidence"] = ai.get("fp_confidence")
            entry["ai_reasoning"] = ai.get("reasoning", "")[:200]
            ai_sev = str(ai.get("severity", "")).lower()
            zap_sev = str(f.get("severity", "")).lower()
            entry["severity_match"] = ai_sev == zap_sev or ai_sev == zap_sev.replace("informational", "info")
            ok_count += 1
            print(f"  [{i+1}/{len(unique)}] {f['title'][:60]:<60} | {zap_sev:>5} -> {ai_sev:>5} | match={entry['severity_match']} | fp={ai.get('fp_confidence', '?')} | {elapsed:.0f}ms")
        else:
            entry["error"] = ai.get("error", "unknown") if ai else "no_response"
            print(f"  [{i+1}/{len(unique)}] {f['title'][:60]:<60} | ERROR: {entry['error']} | {elapsed:.0f}ms")

        results.append(entry)
        if i < len(unique) - 1:
            time.sleep(0.3)

    # Aggregate
    matching = sum(1 for r in results if r.get("severity_match"))
    avg_ms = total_ms / len(unique) if unique else 0
    fp_vals = [r["ai_fp_confidence"] for r in results if "ai_fp_confidence" in r]

    report = {
        "calibration": "qw3-w1",
        "model": "Qwen3-1.7B Q5_K_M",
        "baseline": "EXP-01",
        "total_findings": len(findings),
        "unique_findings": len(unique),
        "classify_ok": ok_count,
        "classify_errors": len(unique) - ok_count,
        "severity_agreement": f"{matching}/{len(unique)} ({matching*100/len(unique):.0f}%)" if unique else "n/a",
        "avg_latency_ms": round(avg_ms, 1),
        "fp_confidence_mean": round(sum(fp_vals) / len(fp_vals), 3) if fp_vals else None,
        "fp_confidence_range": [round(min(fp_vals), 3), round(max(fp_vals), 3)] if fp_vals else None,
        "results": results,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWritten: {OUT}")
    print(f"Agreement: {report['severity_agreement']} | avg latency: {avg_ms:.0f}ms")
    return report


if __name__ == "__main__":
    run()