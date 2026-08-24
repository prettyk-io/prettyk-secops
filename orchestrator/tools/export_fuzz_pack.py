# -*- coding: utf-8 -*-
"""Copy orchestrator/data/fuzz/pack.json → frontend/src/generated/fuzz_pack.json.

Source of truth for curated intent corpora is the orchestrator pack.
Studio imports the FE mirror; do not edit the mirror by hand.

Usage:
    python orchestrator/tools/export_fuzz_pack.py
    python orchestrator/tools/export_fuzz_pack.py --check
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ORCHESTRATOR_DIR = REPO_ROOT / "orchestrator"
SRC_PACK = ORCHESTRATOR_DIR / "data" / "fuzz" / "pack.json"
DEFAULT_OUTPUT = REPO_ROOT / "cosmo" / "src" / "generated" / "fuzz_pack.json"


def _load_pack(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(f"fuzz pack missing: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("fuzz pack: root must be object")
    return data


def export_pack(*, output: Path = DEFAULT_OUTPUT) -> Path:
    pack = _load_pack(SRC_PACK)
    # Validate via shared util when available (keeps CI/local consistent).
    sys.path.insert(0, str(ORCHESTRATOR_DIR))
    from utils.fuzz_dict_pack import validate_fuzz_pack  # noqa: E402

    errors = validate_fuzz_pack(path=SRC_PACK)
    if errors:
        raise SystemExit("fuzz pack invalid:\n  - " + "\n  - ".join(errors))
    output.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(pack, ensure_ascii=False, indent=2) + "\n"
    output.write_text(text, encoding="utf-8")
    return output


def check_pack(*, output: Path = DEFAULT_OUTPUT) -> int:
    pack = _load_pack(SRC_PACK)
    if not output.is_file():
        print(f"FAIL: missing FE mirror {output}", file=sys.stderr)
        return 1
    mirror = json.loads(output.read_text(encoding="utf-8"))
    if pack != mirror:
        print(
            f"FAIL: {output.relative_to(REPO_ROOT)} out of sync with "
            f"{SRC_PACK.relative_to(REPO_ROOT)}. Run: npm run generate:fuzz-pack",
            file=sys.stderr,
        )
        return 1
    print(f"OK: fuzz_pack in sync ({output.relative_to(REPO_ROOT)})")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="FE mirror path",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if FE mirror differs from orchestrator pack",
    )
    args = parser.parse_args(argv)
    if args.check:
        return check_pack(output=args.output)
    out = export_pack(output=args.output)
    print(f"Wrote {out.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
