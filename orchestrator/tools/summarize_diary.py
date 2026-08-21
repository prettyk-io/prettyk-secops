# -*- coding: utf-8 -*-
"""Print channel/kind counts and sample lines from reports/live/diary.ndjson."""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIARY = ROOT.parent / "reports" / "live" / "diary.ndjson"


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DIARY
    if not path.is_file():
        print(f"NO FILE: {path}")
        return 1
    lines = [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
    if not lines:
        print("EMPTY diary.ndjson")
        return 1

    by_channel_kind: Counter[tuple[str, str]] = Counter()
    samples: dict[tuple[str, str], list[str]] = defaultdict(list)
    for e in lines:
        ch = e.get("channel", "diary")
        kind = e.get("kind", "?")
        by_channel_kind[(ch, kind)] += 1
        key = (ch, kind)
        if len(samples[key]) < 2:
            samples[key].append((e.get("text") or "")[:120])

    print(f"TOTAL events: {len(lines)}")
    print("\n| channel | kind | count |")
    print("|---------|------|-------|")
    for (ch, kind), n in sorted(by_channel_kind.items()):
        print(f"| {ch} | {kind} | {n} |")

    print("\nSample lines:")
    for (ch, kind), n in sorted(by_channel_kind.items()):
        print(f"\n  [{ch}/{kind}] x{n}")
        for s in samples[(ch, kind)]:
            print(f"    - {s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
