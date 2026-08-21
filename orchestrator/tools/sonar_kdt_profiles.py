# -*- coding: utf-8 -*-
"""Create/assign KDT Sonar Quality Profiles + lab Quality Gate (lab helper).

Usage:
  set SONAR_TOKEN=squ_...
  python orchestrator/tools/sonar_kdt_profiles.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HOST = os.environ.get("SONAR_HOST", "http://127.0.0.1:9000").rstrip("/")


def _req(method: str, path: str, data: dict | None = None) -> dict | list | None:
    token = (os.environ.get("SONAR_TOKEN") or "").strip()
    if not token:
        raise SystemExit("SONAR_TOKEN required")
    body = None
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(HOST + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> {exc.code}: {err}") from exc


def _get(path: str) -> dict | list:
    out = _req("GET", path)
    assert out is not None
    return out


def _post(path: str, data: dict) -> dict | list | None:
    return _req("POST", path, data)


def find_profile(language: str, name: str) -> dict | None:
    data = _get("/api/qualityprofiles/search")
    assert isinstance(data, dict)
    for p in data.get("profiles", []):
        if p.get("language") == language and p.get("name") == name:
            return p
    return None


def ensure_copy(language: str, from_name: str, to_name: str) -> dict:
    existing = find_profile(language, to_name)
    if existing:
        print(f"profile exists {language}/{to_name} key={existing['key']}")
        return existing
    src = find_profile(language, from_name)
    if not src:
        raise RuntimeError(f"source profile missing {language}/{from_name}")
    _post(
        "/api/qualityprofiles/copy",
        {"fromKey": src["key"], "toName": to_name},
    )
    created = find_profile(language, to_name)
    if not created:
        raise RuntimeError(f"copy failed {to_name}")
    print(f"copied {language}/{from_name} -> {to_name} key={created['key']}")
    return created


def deactivate(profile_key: str, rule: str) -> None:
    try:
        _post(
            "/api/qualityprofiles/deactivate_rule",
            {"key": profile_key, "rule": rule},
        )
        print(f"  deactivated {rule}")
    except RuntimeError as exc:
        msg = str(exc)
        if "not found" in msg.lower() or "404" in msg:
            print(f"  skip missing {rule}")
            return
        # already inactive often returns 400
        if "400" in msg or "already" in msg.lower():
            print(f"  ok/skip {rule}: {msg[:120]}")
            return
        raise


def assign(language: str, profile_name: str, project: str) -> None:
    _post(
        "/api/qualityprofiles/add_project",
        {
            "language": language,
            "qualityProfile": profile_name,
            "project": project,
        },
    )
    print(f"assigned {profile_name} ({language}) -> {project}")


def ensure_lab_gate() -> str:
    """Quality gate without new_coverage; return gate name."""
    name = "KDT-lab"
    gates = _get("/api/qualitygates/list")
    assert isinstance(gates, dict)
    exists = any(g.get("name") == name for g in gates.get("qualitygates", []))
    if not exists:
        created = _post("/api/qualitygates/create", {"name": name})
        print(f"created gate {name}: {created}")
        for metric, op, error in (
            ("new_bugs", "GT", "0"),
            ("new_vulnerabilities", "GT", "0"),
        ):
            try:
                _post(
                    "/api/qualitygates/create_condition",
                    {
                        "gateName": name,
                        "metric": metric,
                        "op": op,
                        "error": error,
                    },
                )
                print(f"  condition {metric} {op} {error}")
            except RuntimeError as exc:
                print(f"  skip condition {metric}: {str(exc)[:160]}")
    else:
        print(f"gate exists {name}")

    # Sonar CE may seed CAYC conditions — drop lab-noise metrics.
    show = _get(f"/api/qualitygates/show?name={urllib.parse.quote(name)}")
    assert isinstance(show, dict)
    for cond in show.get("conditions", []):
        metric = cond.get("metric")
        if metric in ("new_coverage", "new_violations"):
            try:
                _post("/api/qualitygates/delete_condition", {"id": cond["id"]})
                print(f"  removed {metric} condition")
            except RuntimeError as exc:
                print(f"  skip delete {metric}: {str(exc)[:160]}")
    return name


def select_gate(project: str, gate_name: str) -> None:
    _post(
        "/api/qualitygates/select",
        {"projectKey": project, "gateName": gate_name},
    )
    print(f"gate {gate_name} -> {project}")


def main() -> int:
    py = ensure_copy("py", "Sonar way", "KDT-Python")
    ts = ensure_copy("ts", "Sonar way", "KDT-TypeScript")

    print("deactivate KDT-Python noise rules")
    for rule in (
        # Wave-0 lab / MethodId / tests
        "python:S5332",  # lab http
        "python:S1192",  # MethodId/RU literal mass
        "python:S9073",  # composite assert tests
        "python:S5778",  # exception tests
        # Part-1 style radar (SQ-BE-SUPPRESS-style) — not product defects
        "python:S8572",  # logging.exception preference
        "python:S6353",  # \w vs [A-Za-z0-9_] — explicit classes for MethodId
        "python:S6546",  # Optional[] vs |
        "python:S7500",  # comprehension → constructor micro-style
        "python:S8513",  # startswith/endswith tuple micro-style
        "python:S1172",  # unused params on adapter/facade signatures
        "python:S5713",  # redundant Exception in except tuple
        "python:S125",  # commented-out stubs / MethodId examples
    ):
        deactivate(py["key"], rule)

    print("deactivate KDT-TypeScript noise rules")
    for rule in (
        # Wave-0 lab / unicorn
        "typescript:S5332",  # Juice/lab http
        "typescript:S7744",  # unicorn mass
        "typescript:S7781",
        "typescript:S7778",
        "typescript:S7780",
        "typescript:S7761",
        "typescript:S7755",
        # Part-1 style radar (SQ-FE-SUPPRESS-style) — extend unicorn philosophy
        "typescript:S6759",  # readonly props mass on RJSF/antd
        "typescript:S6582",  # prefer optional chain
        "typescript:S6606",  # prefer ??=
        "typescript:S6594",  # RegExp.exec vs match
        "typescript:S6535",  # unnecessary regex escapes
        "typescript:S6353",  # \w/\d vs explicit classes (MethodId parity)
        "typescript:S6571",  # unknown overrides union — defensive casts
        "typescript:S6551",  # object stringification false-positives
        "typescript:S3863",  # monaco dual import pattern
        "typescript:S6819",  # antd role= vs native element a11y
    ):
        deactivate(ts["key"], rule)

    # CSS rules live on language=css, not the TS profile.
    css = ensure_copy("css", "Sonar way", "KDT-CSS")
    print("deactivate KDT-CSS noise rules")
    for rule in (
        "css:S7924",  # contrast vs intentional design tokens
    ):
        deactivate(css["key"], rule)

    assign("py", "KDT-Python", "prettyk-backend")
    assign("ts", "KDT-TypeScript", "prettyk-frontend")
    assign("css", "KDT-CSS", "prettyk-frontend")

    gate = ensure_lab_gate()
    select_gate("prettyk-backend", gate)
    select_gate("prettyk-frontend", gate)
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
