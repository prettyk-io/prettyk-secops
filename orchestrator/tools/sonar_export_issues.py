# -*- coding: utf-8 -*-
"""Export SonarQube issues summary for a projectKey (lab helper).

Usage:
  set SONAR_TOKEN=squ_...
  python orchestrator/tools/sonar_export_issues.py prettyk-frontend
  python orchestrator/tools/sonar_export_issues.py prettyk-backend --out reports/sonar-be-raw
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path


def _get(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_key")
    parser.add_argument("--host", default="http://127.0.0.1:9000")
    parser.add_argument("--out", default="")
    args = parser.parse_args()
    token = (os.environ.get("SONAR_TOKEN") or "").strip()
    if not token:
        print("SONAR_TOKEN required", file=sys.stderr)
        return 2
    out = Path(args.out or f"reports/sonar-{args.project_key}-raw")
    out.mkdir(parents=True, exist_ok=True)
    host = args.host.rstrip("/")
    key = urllib.parse.quote(args.project_key, safe="")

    measures = _get(
        f"{host}/api/measures/component?component={key}"
        "&metricKeys=bugs,vulnerabilities,code_smells,security_hotspots,"
        "coverage,duplicated_lines_density,ncloc,sqale_rating,"
        "reliability_rating,security_rating,alert_status",
        token,
    )
    (out / "measures.json").write_text(
        json.dumps(measures, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    facets = _get(
        f"{host}/api/issues/search?componentKeys={key}"
        "&resolved=false&ps=1&facets=types,severities,rules",
        token,
    )
    (out / "facets.json").write_text(
        json.dumps(facets, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    for name, q in (
        ("bugs.json", "types=BUG"),
        ("vulns.json", "types=VULNERABILITY"),
        ("smells-crit.json", "types=CODE_SMELL&severities=CRITICAL,BLOCKER"),
    ):
        data = _get(
            f"{host}/api/issues/search?componentKeys={key}"
            f"&resolved=false&{q}&ps=50&s=SEVERITY&asc=false",
            token,
        )
        (out / name).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(f"OK wrote {out} total_issues={facets.get('total')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
