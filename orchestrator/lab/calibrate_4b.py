# -*- coding: utf-8 -*-
"""EXP-02: Qwen3-4B calibration vs EXP-01 baseline findings.
Usage: .\.venv\Scripts\python.exe orchestrator\lab\calibrate_4b.py
"""
from __future__ import annotations

import json, os, time, urllib.request, urllib.error
from pathlib import Path

os.environ["LLAMA_PORT"] = "8769"
os.environ["LLM_MODEL_PATH"] = "services/llm-model/Qwen3-4B-Instruct-2507.Q5_K_M.gguf"

BASE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "exp01_reference"
FIN = BASE / "dojo_baseline_findings.json"
OUT = Path(__file__).resolve().parents[2] / "pure" / "research" / "qw3_4b_calibration.json"

LLM_URL = "http://127.0.0.1:8769/v1/chat/completions"


def ask_4b(prompt, thinking=False, max_tokens=128, timeout=120):
    body = {"messages": [{"role": "user", "content": prompt}], "max_tokens": max_tokens, "temperature": 0.1}
    if not thinking:
        body["chat_template_kwargs"] = {"enable_thinking": False}
    req = urllib.request.Request(LLM_URL, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read())
    ms = (time.perf_counter() - t0) * 1000
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    if not content:
        content = data.get("choices", [{}])[0].get("message", {}).get("reasoning_content", "").strip()
    return content, ms


def extract_json(text):
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    import re
    for pat in [r'\{[\s\S]*\}', r'\[[\s\S]*\]']:
        m = re.search(pat, text)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                continue
    return {}


def load_findings():
    raw = json.loads(FIN.read_text("utf-8"))
    return [f for f in raw.get("findings", []) if isinstance(f, dict) and f.get("title")]


def deduplicate(findings):
    seen = set()
    out = []
    for f in findings:
        key = (str(f.get("title", "")).strip(), str(f.get("severity", "")).lower())
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def run():
    findings = deduplicate(load_findings())
    print(f"4B calibration: {len(findings)} unique findings\n")
    results = []
    total_ms = 0.0

    for i, f in enumerate(findings):
        prompt = (
            'Classify this security alert. Return ONLY valid JSON:\n'
            f'Alert: {f["title"]}\n'
            f'Risk: {f.get("severity", "info")}\n'
            f'Confidence: Medium\n\n'
            '{"severity":"<critical|high|medium|low|info>","fp_confidence":<0.0-1.0>,"reasoning":"<short>"}'
        )
        output, ms = ask_4b(prompt, thinking=False, max_tokens=128, timeout=120)
        total_ms += ms
        result = extract_json(output)
        entry = {"idx": i, "title": f["title"], "zap_severity": f.get("severity"), "cwe": f.get("cwe"), "latency_ms": round(ms, 1)}
        if isinstance(result, dict) and result:
            ai_sev = str(result.get("severity", "info")).lower()
            zap_sev = str(f.get("severity", "info")).lower()
            entry["ai_severity"] = ai_sev
            entry["ai_fp_confidence"] = result.get("fp_confidence", 0.5)
            entry["ai_reasoning"] = str(result.get("reasoning", ""))[:200]
            entry["severity_match"] = ai_sev == zap_sev or ai_sev == zap_sev.replace("informational", "info")
            print(f"  [{i+1}/{len(findings)}] {f['title'][:55]:<55} {zap_sev:>5} -> {ai_sev:>5} | match={entry['severity_match']} | fp={entry.get('ai_fp_confidence','.')} | {ms:.0f}ms")
        else:
            entry["error"] = "parse_fail"
            print(f"  [{i+1}/{len(findings)}] {f['title'][:55]:<55} PARSE FAIL | {ms:.0f}ms")

        results.append(entry)
        if i < len(findings) - 1:
            time.sleep(0.5)

    matching = sum(1 for r in results if r.get("severity_match"))
    avg_ms = total_ms / len(findings)
    fp_vals = [r["ai_fp_confidence"] for r in results if "ai_fp_confidence" in r]

    report = {
        "calibration": "qw3-4b",
        "model": "Qwen3-4B-Instruct-2507 Q5_K_M",
        "baseline": "EXP-01",
        "unique_findings": len(findings),
        "severity_agreement": f"{matching}/{len(findings)} ({matching*100//len(findings)}%)",
        "avg_latency_ms": round(avg_ms, 1),
        "fp_confidence_mean": round(sum(fp_vals) / len(fp_vals), 3) if fp_vals else None,
        "results": results,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWritten: {OUT}")
    print(f"Agreement: {report['severity_agreement']} | avg latency: {avg_ms:.0f}ms | fp mean: {report.get('fp_confidence_mean','n/a')}")
    return report


if __name__ == "__main__":
    run()