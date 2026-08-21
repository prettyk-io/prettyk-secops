# -*- coding: utf-8 -*-
"""
Экспорт MethodId (RU → component.action) + facades в JSON для Monaco.

  py orchestrator/tools/export_method_ids.py
  py orchestrator/tools/export_method_ids.py --check
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ORCH = REPO_ROOT / "orchestrator"
DEFAULT_OUTPUT = REPO_ROOT / "cosmo" / "src" / "generated" / "method_ids.json"

if str(ORCH) not in sys.path:
    sys.path.insert(0, str(ORCH))

from core.method_id import (  # noqa: E402
    facade_aliases,
    facade_method_aliases,
    facades_payload,
    method_id_aliases,
    method_id_catalog,
    method_tier,
)


def build_payload() -> dict:
    catalog = method_id_catalog()
    methods = [
        {
            "id": name,
            "component": comp,
            "action": action,
            "wirek": f"{comp}|{action}",
            "tier": method_tier(name),
        }
        for name, (comp, action) in sorted(catalog.items(), key=lambda x: x[0])
    ]
    return {
        "methods": methods,
        "aliases": method_id_aliases(),
        "facadeAliases": facade_aliases(),
        "facadeMethodAliases": facade_method_aliases(),
        "facades": facades_payload(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-o", "--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    payload = build_payload()
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.is_file():
            print(f"missing {args.output}", file=sys.stderr)
            return 1
        if args.output.read_text(encoding="utf-8") != text:
            print(f"stale {args.output}", file=sys.stderr)
            return 1
        print("ok")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text, encoding="utf-8")
    n_facade = sum(len(f["methods"]) for f in payload["facades"].values())
    print(
        f"wrote {args.output} "
        f"({len(payload['methods'])} root MethodId, "
        f"{len(payload['facades'])} facades / {n_facade} gated)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
