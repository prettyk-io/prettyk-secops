#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Зашифровать строку для манифеста (G-61).

  set KDT_WIRED_KEY=...   # Fernet.generate_key()
  py -3.13 tools/encrypt_wired_secret.py "my-password"

Печатает одну строку: kdt:enc:v1:…
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.wired_crypto import ENV_WIRED_KEY, encrypt_string


def main() -> int:
    parser = argparse.ArgumentParser(description="Encrypt a wired secret (Fernet)")
    parser.add_argument("plaintext", help="Значение для kdt:enc:v1:…")
    args = parser.parse_args()
    try:
        print(encrypt_string(args.plaintext))
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        print(f"Задайте {ENV_WIRED_KEY} (Fernet key).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
