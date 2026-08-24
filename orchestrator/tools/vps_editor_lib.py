# -*- coding: utf-8 -*-
"""Shared VPS Editor helpers (no secrets in repo).

Credentials: gitignored ``vps-access.md`` at repo root, or env:
``VPS_HOST`` / ``VPS_USER`` / ``VPS_PASSWORD``.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACCESS_MD = ROOT / "vps-access.md"

# Prod surface — канон: корень хоста (не /editor/)
EDITOR_URL = "https://prettyk.io/"
LOGIN_VIDEO_URL = EDITOR_URL + "media/login-bg.mp4"
LOGIN_VIDEO_WEBM_URL = EDITOR_URL + "media/login-bg.webm"
LOGIN_VIDEO_POSTER_URL = EDITOR_URL + "media/login-bg-poster.webp"
# Legacy (до переноса DocumentRoot); check может слать 308→root
EDITOR_URL_LEGACY = "https://prettyk.io/editor/"

# Disk paths on VPS
REMOTE_PRETTYK_LIVE = "/var/www/www/prettyk"
REMOTE_TARGETS = (REMOTE_PRETTYK_LIVE,)

LOCAL_PRETTYK = ROOT / "deploy_vps" / "www" / "prettyk"
DEFAULT_HOST = "139.28.240.65"  # NOSONAR python:S1313 — lab VPS host SoT (sonar-access / vps-editor)
DEFAULT_USER = "root"
API_UNIT = "kdt-editor-api"
API_HEALTH_LOCAL = "http://127.0.0.1:8765/api/health"


def load_ssh_creds() -> tuple[str, str, str]:
    """Return (host, user, password). Password may be empty if key-only."""
    host = os.environ.get("VPS_HOST", DEFAULT_HOST).strip() or DEFAULT_HOST
    user = os.environ.get("VPS_USER", DEFAULT_USER).strip() or DEFAULT_USER
    password = os.environ.get("VPS_PASSWORD", "").strip()

    if ACCESS_MD.is_file():
        text = ACCESS_MD.read_text(encoding="utf-8")
        hm = re.search(r"(?:IP\s*/\s*)?Host:\*\*\s*`([^`]+)`", text)
        um = re.search(r"User:\*\*\s*`([^`]+)`", text)
        pm = re.search(r"Password:\*\*\s*`([^`]+)`", text)
        if hm:
            host = hm.group(1).strip()
        if um:
            user = um.group(1).strip()
        if pm and not password:
            password = pm.group(1).strip()

    return host, user, password


def ssh_connect(retries: int = 5):
    """paramiko SSHClient connected with password or key.

    Windows→VPS TCP к :22 иногда даёт WinError 10060; берём sock сами + retry.
    """
    import socket
    import time

    import paramiko

    host, user, password = load_ssh_creds()
    last: BaseException | None = None
    for attempt in range(max(1, retries)):
        sock = None
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            sock = socket.create_connection((host, 22), timeout=20)
            kwargs: dict = {
                "hostname": host,
                "username": user,
                "sock": sock,
                "timeout": 40,
                "banner_timeout": 60,
                "auth_timeout": 60,
            }
            if password:
                kwargs["password"] = password
            else:
                kwargs["look_for_keys"] = True
                kwargs["allow_agent"] = True
            client.connect(**kwargs)
            return client
        except (OSError, paramiko.SSHException, EOFError, TimeoutError) as exc:
            last = exc
            try:
                client.close()
            except OSError:
                pass
            if sock is not None:
                try:
                    sock.close()
                except OSError:
                    pass
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
            continue
        except BaseException as exc:
            # Unexpected — do not swallow; reconnect loop only for transport errors.
            last = exc
            try:
                client.close()
            except OSError:
                pass
            raise
    assert last is not None
    raise last


def ssh_run(client, cmd: str) -> tuple[int, str]:
    _stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    return code, (out + err).strip()
