# -*- coding: utf-8 -*-
"""CLI: python -m tools.lab_run_stub --sleep 2 --exit-code 0"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.lab_run_stub import main

if __name__ == "__main__":
    raise SystemExit(main())
