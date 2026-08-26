# -*- coding: utf-8 -*-
"""Bulk WONTFIX open issues by rule (lab triage helper).

Pairs with profile deactivation in sonar_pk_profiles.py so noise does not
return on the next scan. Requires SONAR_TOKEN.

Usage:
  py -3 orchestrator/tools/sonar_wontfix_by_rule.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HOST = os.environ.get("SONAR_HOST", "http://127.0.0.1:9000").rstrip("/")

# (projectKey, rule, comment) — Part-1 packs
PACKS: list[tuple[str, str, str]] = [
    # BE
    (
        "prettyk-backend",
        "python:S8572",
        "SQ-BE-SUPPRESS-style: logging.exception preference — on-touch style, not a defect",
    ),
    (
        "prettyk-backend",
        "python:S6353",
        "SQ-BE-SUPPRESS-style: explicit [A-Za-z0-9_] kept for MethodId/RU safety — not \\w",
    ),
    (
        "prettyk-backend",
        "python:S6546",
        "SQ-BE-SUPPRESS-style: Optional[] vs | union — micro-style",
    ),
    (
        "prettyk-backend",
        "python:S7500",
        "SQ-BE-SUPPRESS-style: comprehension→constructor — micro-style",
    ),
    (
        "prettyk-backend",
        "python:S8513",
        "SQ-BE-SUPPRESS-style: startswith/endswith tuple — micro-style",
    ),
    (
        "prettyk-backend",
        "python:S1172",
        "SQ-BE-SUPPRESS-style: unused facade/adapter params keep call signature",
    ),
    (
        "prettyk-backend",
        "python:S5713",
        "SQ-BE-SUPPRESS-style: redundant Exception in except — noise",
    ),
    (
        "prettyk-backend",
        "python:S125",
        "SQ-BE-SUPPRESS-style: commented stubs/examples — intentional, not dead product code",
    ),
    # FE
    (
        "prettyk-frontend",
        "typescript:S6759",
        "SQ-FE-SUPPRESS-style: readonly props mass on RJSF/antd — style radar",
    ),
    (
        "prettyk-frontend",
        "typescript:S6582",
        "SQ-FE-SUPPRESS-style: prefer optional chain — style radar",
    ),
    (
        "prettyk-frontend",
        "typescript:S6606",
        "SQ-FE-SUPPRESS-style: prefer ??= — style radar",
    ),
    (
        "prettyk-frontend",
        "typescript:S6594",
        "SQ-FE-SUPPRESS-style: RegExp.exec vs match — style radar",
    ),
    (
        "prettyk-frontend",
        "typescript:S6535",
        "SQ-FE-SUPPRESS-style: unnecessary regex escapes — false noise on our patterns",
    ),
    (
        "prettyk-frontend",
        "typescript:S6353",
        "SQ-FE-SUPPRESS-style: explicit char classes for MethodId parity — not \\w/\\d",
    ),
    (
        "prettyk-frontend",
        "typescript:S6571",
        "SQ-FE-SUPPRESS-style: unknown in unions — defensive formData casts",
    ),
    (
        "prettyk-frontend",
        "typescript:S6551",
        "SQ-FE-SUPPRESS-style: object stringification FPs on Record casts",
    ),
    (
        "prettyk-frontend",
        "typescript:S3863",
        "SQ-FE-SUPPRESS-style: monaco dual import pattern — required by typings/split",
    ),
    (
        "prettyk-frontend",
        "typescript:S6819",
        "SQ-FE-SUPPRESS-style: antd role= patterns — native element swap breaks UI kit",
    ),
    (
        "prettyk-frontend",
        "css:S7924",
        "SQ-FE-SUPPRESS-style: contrast vs intentional design tokens / chrome",
    ),
]


def _req(method: str, path: str, data: dict | None = None) -> dict:
    token = (os.environ.get("SONAR_TOKEN") or "").strip()
    if not token:
        raise SystemExit("SONAR_TOKEN required")
    body = None
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        body = urllib.parse.urlencode(data, doseq=True).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(HOST + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> {exc.code}: {err}") from exc


def list_open_keys(project: str, rule: str) -> list[str]:
    keys: list[str] = []
    page = 1
    while True:
        q = urllib.parse.urlencode(
            {
                "componentKeys": project,
                "resolved": "false",
                "rules": rule,
                "ps": "500",
                "p": str(page),
            }
        )
        data = _req("GET", f"/api/issues/search?{q}")
        batch = [i["key"] for i in data.get("issues", [])]
        keys.extend(batch)
        total = int(data.get("total", 0))
        if len(keys) >= total or not batch:
            break
        page += 1
    return keys


def bulk_wontfix(keys: list[str], comment: str) -> tuple[int, int, int]:
    ok = ign = fail = 0
    for i in range(0, len(keys), 100):
        chunk = keys[i : i + 100]
        out = _req(
            "POST",
            "/api/issues/bulk_change",
            {
                "issues": ",".join(chunk),
                "do_transition": "wontfix",
                "comment": comment,
            },
        )
        ok += int(out.get("success", 0))
        ign += int(out.get("ignored", 0))
        fail += int(out.get("failures", 0))
    return ok, ign, fail


def main() -> int:
    total_ok = total_ign = total_fail = 0
    for project, rule, comment in PACKS:
        keys = list_open_keys(project, rule)
        if not keys:
            print(f"skip {project} {rule} (0 open)")
            continue
        ok, ign, fail = bulk_wontfix(keys, comment)
        total_ok += ok
        total_ign += ign
        total_fail += fail
        print(f"{project} {rule}: open={len(keys)} success={ok} ignored={ign} fail={fail}")
    print(f"DONE success={total_ok} ignored={total_ign} fail={total_fail}")
    return 0 if total_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
