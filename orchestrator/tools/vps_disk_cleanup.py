# -*- coding: utf-8 -*-
"""Free VPS disk: drop stale Editor trees/zips + vacuum logs. Keeps live + package + API.

Usage (repo root):
  py -3 orchestrator/tools/vps_disk_cleanup.py
  py -3 orchestrator/tools/vps_disk_cleanup.py --dry-run
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_TOOLS = Path(__file__).resolve().parent
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from vps_editor_lib import ssh_connect, ssh_run  # noqa: E402

REMOTE_CLEAN = r"""
set -euo pipefail
echo '=== BEFORE ==='
df -h / | tail -1
du -sh /var/www /var/log /var/log/journal 2>/dev/null || true

# Orphan static (live DocumentRoot is /var/www/www/prettyk)
rm -rf /var/www/prettyk
# Upload leftovers
rm -f /var/www/deploy_vps.zip /var/www/server.log
# Stale /debug and /sandbox agent trees
rm -rf /var/www/debug /var/www/sandbox
# Empty stubs
rm -rf /var/www/html /var/www/my_site /var/www/basis_verification

echo '=== WWW AFTER RM ==='
du -sh /var/www
ls -la /var/www

# Strip sandbox/debug Alias from SSL vhost (DocumentRoot untouched)
SSL=/etc/apache2/sites-enabled/000-default-le-ssl.conf
if [ -f "$SSL" ]; then
  cp -a "$SSL" "${SSL}.bak.cleanup"
  python3 - <<'PY'
from pathlib import Path
p = Path("/etc/apache2/sites-enabled/000-default-le-ssl.conf")
lines = p.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True)
out: list[str] = []
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()
    drop_header = "Sandbox Environment" in line or "Debug Environment" in line
    drop_alias = stripped.startswith("Alias /sandbox") or stripped.startswith("Alias /debug")
    if drop_header or drop_alias:
        i += 1
        while i < len(lines) and lines[i].strip() == "":
            i += 1
        if i < len(lines) and lines[i].strip().startswith("<Directory"):
            i += 1
            while i < len(lines) and "</Directory>" not in lines[i]:
                i += 1
            if i < len(lines):
                i += 1
            while i < len(lines) and lines[i].strip() == "":
                i += 1
        continue
    out.append(line)
    i += 1
new = "".join(out)
while "\n\n\n" in new:
    new = new.replace("\n\n\n", "\n\n")
p.write_text(new, encoding="utf-8")
print("APACHE_REWRITTEN")
PY
  apache2ctl configtest
  systemctl reload apache2
  echo APACHE_RELOAD_OK
fi

# Logs: biggest free space
journalctl --vacuum-size=80M
rm -f /var/log/btmp.1
: > /var/log/btmp
rm -f /var/log/auth.log.2.gz /var/log/auth.log.3.gz /var/log/auth.log.4.gz || true

echo '=== AFTER ==='
df -h / | tail -1
du -sh /var/www /var/log /var/log/journal /var/www/www/prettyk /var/www/orchestrator /var/www/.venv 2>/dev/null
ls -la /var/www
curl -fsSI https://127.0.0.1/ -H 'Host: prettyk.io' --resolve prettyk.io:443:127.0.0.1 2>/dev/null | head -5 || true
echo CLEAN_DONE
"""

REMOTE_DRY = r"""
set -euo pipefail
echo '=== DISK ==='
df -h / | tail -1
echo '=== /var/www ==='
du -xh --max-depth=1 /var/www 2>/dev/null | sort -hr
echo '=== candidates (would delete) ==='
du -sh /var/www/prettyk /var/www/debug /var/www/sandbox \
  /var/www/deploy_vps.zip \
  /var/www/html /var/www/my_site /var/www/basis_verification \
  /var/www/server.log 2>/dev/null || true
echo '=== keep ==='
du -sh /var/www/www/prettyk /var/www/orchestrator /var/www/.venv 2>/dev/null
echo '=== logs ==='
du -sh /var/log /var/log/journal /var/log/btmp /var/log/btmp.1 2>/dev/null || true
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    client = ssh_connect()
    try:
        script = REMOTE_DRY if args.dry_run else REMOTE_CLEAN
        code, out = ssh_run(client, script)
        print(out)
        return 0 if code == 0 else 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
