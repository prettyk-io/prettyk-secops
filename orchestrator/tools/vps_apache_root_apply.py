# -*- coding: utf-8 -*-
"""Patch Apache vhost files: DocumentRoot → prettyk, legacy /editor → /.

Run on the VPS:
  python3 vps_apache_root_apply.py /etc/apache2/sites-enabled/foo.conf ...
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

LIVE = "/var/www/www/prettyk"


def patch_vhost(path: Path, live: str = LIVE) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    text2 = re.sub(
        r"(?im)^(\s*DocumentRoot)\s+\S+",
        r"\1 " + live,
        text,
        count=1,
    )
    if text2 == text and "DocumentRoot" not in text:
        text2 = re.sub(
            r"(?im)^(\s*ServerName\s+\S+\s*)$",
            r"\1\n    DocumentRoot " + live,
            text,
            count=1,
        )
    text = text2
    text = re.sub(r"(?im)^\s*Alias\s+/editor/?\s+\S+\s*\n?", "", text)
    text = re.sub(r"(?im)^\s*Alias\s+/prettyk/?\s+\S+\s*\n?", "", text)
    if f"<Directory {live}>" not in text:
        block = (
            f"\n    <Directory {live}>\n"
            "        Options -Indexes +FollowSymLinks\n"
            "        AllowOverride None\n"
            "        Require all granted\n"
            "        FallbackResource /index.html\n"
            "    </Directory>\n"
        )
        text = text.replace(f"DocumentRoot {live}", f"DocumentRoot {live}" + block, 1)
    if "RedirectMatch 308 ^/editor" not in text:
        text += (
            "# PK root canon\n"
            "RedirectMatch 308 ^/editor/?$ /\n"
            "RedirectMatch 308 ^/editor/(.*)$ /$1\n"
            "RedirectMatch 308 ^/prettyk/?$ /\n"
            "RedirectMatch 308 ^/prettyk/(.*)$ /$1\n"
        )
    path.write_text(text, encoding="utf-8")
    print(f"patched {path}")


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: vps_apache_root_apply.py <vhost.conf>...", file=sys.stderr)
        return 2
    for raw in sys.argv[1:]:
        patch_vhost(Path(raw))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
