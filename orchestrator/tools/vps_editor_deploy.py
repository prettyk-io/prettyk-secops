# -*- coding: utf-8 -*-
"""Deploy local ``deploy_vps/www/prettyk`` to VPS root DocumentRoot paths.

Usage (from repo root, after package_vps):
  py -3 orchestrator/tools/vps_editor_deploy.py
  py -3 orchestrator/tools/vps_editor_deploy.py --check
  py -3 orchestrator/tools/vps_editor_deploy.py --apply-apache --check

Requires gitignored ``vps-access.md`` or ``VPS_PASSWORD``. Never prints password.
Syncs to live Apache DocumentRoot, restarts API unit.
Canon URL: ``https://prettyk.io/`` (see ``apache-prettyk.conf``).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_TOOLS = Path(__file__).resolve().parent
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from vps_editor_lib import (  # noqa: E402
    API_UNIT,
    LOCAL_PRETTYK,
    REMOTE_TARGETS,
    ROOT,
    ssh_connect,
    ssh_run,
)

APACHE_SNIPPET = ROOT / "deploy_vps" / "apache-prettyk.conf"
REMOTE_APACHE_SNIPPET = "/etc/apache2/conf-available/kdt-prettyk-root.conf"
# Private root cache — not world-writable /tmp (python:S5443).
REMOTE_APACHE_APPLY_DIR = "/root/.cache/kdt"
REMOTE_APACHE_APPLY = f"{REMOTE_APACHE_APPLY_DIR}/vps_apache_root_apply.py"
LOCAL_APACHE_APPLY = _TOOLS / "vps_apache_root_apply.py"


def sftp_mkdirs(sftp, remote: str) -> None:
    parts = remote.strip("/").split("/")
    cur = ""
    for part in parts:
        cur += "/" + part
        try:
            sftp.stat(cur)
        except OSError:
            sftp.mkdir(cur)


def sftp_put_tree(sftp, local: Path, remote: str) -> None:
    sftp_mkdirs(sftp, remote)
    for root, _dirs, files in os.walk(local):
        rel = Path(root).relative_to(local).as_posix()
        rdir = remote if rel == "." else f"{remote}/{rel}"
        sftp_mkdirs(sftp, rdir)
        for name in files:
            sftp.put(str(Path(root) / name), f"{rdir}/{name}")


def deploy() -> None:
    if not LOCAL_PRETTYK.joinpath("index.html").is_file():
        raise SystemExit(
            f"missing {LOCAL_PRETTYK / 'index.html'} — run cosmo vite build "
            "+ py -3 orchestrator/tools/package_vps.py first"
        )

    client = ssh_connect()
    try:
        sftp = client.open_sftp()
        for remote in REMOTE_TARGETS:
            print(f"Uploading -> {remote} ...")
            ssh_run(
                client,
                f"rm -rf {remote}/* {remote}/.[!.]* 2>/dev/null || true; "
                f"mkdir -p {remote}",
            )
            sftp_put_tree(sftp, LOCAL_PRETTYK, remote)
            code, out = ssh_run(
                client,
                f"test -f {remote}/index.html && ls -la {remote}/index.html "
                f"&& test -f {remote}/media/login-bg.mp4 && echo OK_INDEX",
            )
            print(out)
            if code != 0 or "OK_INDEX" not in out:
                raise SystemExit(f"verify failed for {remote}")
        sftp.close()
        _c, unit = ssh_run(client, f"systemctl restart {API_UNIT} 2>&1 || true")
        _c2, active = ssh_run(client, f"systemctl is-active {API_UNIT} 2>&1 || true")
        print(f"api restart: {unit or '(ok)'} · active={active}")
    finally:
        client.close()
    print("DEPLOY_DONE")


def apply_apache_root() -> None:
    """DocumentRoot → prettyk; legacy /editor|/prettyk → /. Uses durable apply script."""
    if not APACHE_SNIPPET.is_file():
        raise SystemExit(f"missing {APACHE_SNIPPET}")
    if not LOCAL_APACHE_APPLY.is_file():
        raise SystemExit(f"missing {LOCAL_APACHE_APPLY}")

    client = ssh_connect()
    try:
        sftp = client.open_sftp()
        print(f"Uploading Apache snippet -> {REMOTE_APACHE_SNIPPET}")
        sftp.put(str(APACHE_SNIPPET), REMOTE_APACHE_SNIPPET)
        sftp_mkdirs(sftp, REMOTE_APACHE_APPLY_DIR)
        sftp.put(str(LOCAL_APACHE_APPLY), REMOTE_APACHE_APPLY)
        sftp.close()

        _code, found = ssh_run(
            client,
            "grep -Rsl 'prettyk.io\\|Alias.*/editor' "
            "/etc/apache2/sites-enabled /etc/apache2/sites-available 2>/dev/null | head -8",
        )
        print(f"apache vhosts candidates:\n{found or '(none)'}")
        vhosts = [ln.strip() for ln in (found or "").splitlines() if ln.strip()]
        if not vhosts:
            raise SystemExit("no Apache vhost found for prettyk.io /editor")

        for vh in vhosts:
            ssh_run(client, f"cp -a {vh} {vh}.bak.kdt-root || true")

        args = " ".join(vhosts)
        code, out = ssh_run(client, f"python3 {REMOTE_APACHE_APPLY} {args}")
        print(out)
        if code != 0:
            raise SystemExit(f"apache patch failed: {out}")

        _c, conf = ssh_run(client, "a2enconf kdt-prettyk-root 2>&1 || true")
        print(f"a2enconf: {conf}")
        code, test = ssh_run(client, "apachectl configtest 2>&1")
        print(test)
        if "Syntax OK" not in test:
            raise SystemExit("apachectl configtest failed — not reloading")
        code, reload = ssh_run(client, "systemctl reload apache2 2>&1")
        print(f"apache reload: {reload or 'ok'} (exit {code})")
        if code != 0:
            raise SystemExit("apache2 reload failed")
    finally:
        client.close()
    print("APACHE_ROOT_DONE")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Deploy VPS Editor static + restart API")
    ap.add_argument(
        "--check",
        action="store_true",
        help="run checks after deploy (use --no-deploy to check without re-upload)",
    )
    ap.add_argument(
        "--apply-apache",
        action="store_true",
        help="DocumentRoot → prettyk + legacy /editor|/prettyk → /",
    )
    ap.add_argument(
        "--apache-only",
        action="store_true",
        help="only apply Apache root canon (skip static upload)",
    )
    ap.add_argument(
        "--no-deploy",
        action="store_true",
        help="skip deploy(); only apply-apache and/or check",
    )
    args = ap.parse_args()
    if not args.no_deploy and not args.apache_only:
        deploy()
    if args.apply_apache or args.apache_only:
        apply_apache_root()
    if args.check:
        from vps_editor_check import (
            check_editor_html,
            check_login_video,
            check_ssh_api,
            check_ssh_disk,
        )

        failed = 0
        for fn in (check_editor_html, check_login_video, check_ssh_disk, check_ssh_api):
            ok, msg = fn()
            print(("OK  " if ok else "RED ") + msg)
            if not ok:
                failed += 1
        return 1 if failed else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
