#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CLI: манифест → ZAP AF YAML (G-38). Только пишет файл, не запускает план.

  py -3.11 tools/gen_af_plan.py --wired manifests/x.json -o plans/out.yaml
  py -3.11 tools/gen_af_plan.py --base-url http://juice-shop:3000 --policy custom_policy -o plans/out.yaml
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.af_plan import (  # noqa: E402
    DEFAULT_CONTEXT,
    build_af_plan,
    plan_from_manifest_dict,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Generate ZAP Automation Framework YAML from KDT wired"
    )
    p.add_argument("--wired", "-m", help="Путь к JSON-манифесту")
    p.add_argument("--base-url", help="URL цели (если без --wired)")
    p.add_argument(
        "--policy",
        default="custom_policy",
        help="scan_policy: custom_policy|scanner_crawler|scanner_fuzzing|openapi_schema|api_scanner",
    )
    p.add_argument("--context", default=DEFAULT_CONTEXT, help="Имя ZAP context в env")
    p.add_argument("-o", "--output", required=True, help="Выходной YAML")
    p.add_argument(
        "--check",
        action="store_true",
        help="Сравнить с существующим файлом (CI); не перезаписывать",
    )
    args = p.parse_args(argv)

    if args.wired:
        data = json.loads(Path(args.wired).read_text(encoding="utf-8"))
        text = plan_from_manifest_dict(
            data, context_name=args.context, report_file=Path(args.output).stem
        )
    elif args.base_url:
        text = build_af_plan(
            base_url=args.base_url,
            context_name=args.context,
            scan_policy=args.policy,
            report_file=Path(args.output).stem,
        )
    else:
        p.error("нужен --wired или --base-url")

    out = Path(args.output)
    if args.check:
        if not out.is_file():
            print(f"FAIL: missing {out}", file=sys.stderr)
            return 1
        existing = out.read_text(encoding="utf-8")
        if existing.replace("\r\n", "\n") != text.replace("\r\n", "\n"):
            print(f"FAIL: {out} drifts from generator", file=sys.stderr)
            return 1
        print(f"OK: {out}")
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(out.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
