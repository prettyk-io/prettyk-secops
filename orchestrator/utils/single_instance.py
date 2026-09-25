# -*- coding: utf-8 -*-
"""
BOX-IDLE-NORM: single-instance gate for long-lived idle services.

Three idle services own distinct ports and must never spawn zombie duplicates:
  - tools/data_playground.py      → :8765
  - tools/run_live_idle.py        → :8767
  - browser/cdp_viewport_relay.py → :9224

Root cause of duplicates:
  ``http.server.HTTPServer.allow_reuse_address = 1`` sets ``SO_REUSEADDR`` which,
  on Windows, lets TWO processes bind the same port. A leftover process that can
  no longer truly serve keeps running (some idle entrypoints fall through to a
  ``while True: sleep``) — a silent zombie.

Fix (two layers):
  1. ``ensure_single_instance(port, name)`` — pre-flight TCP connect probe that
     detects an already-listening owner and raises ``AlreadyRunning`` before any
     bind. Callers translate that into a clean ``sys.exit(0)``.
  2. ``ExclusiveThreadingHTTPServer`` — a ``ThreadingHTTPServer`` that disables
     ``SO_REUSEADDR`` and enables ``SO_EXCLUSIVEADDRUSE`` (Windows) so a genuine
     double-bind *hard-fails* instead of silently succeeding, forcing the
     duplicate process to die rather than linger.

Stdlib-only, no external deps.
"""

from __future__ import annotations

import socket
import sys
from http.server import ThreadingHTTPServer

_SO_EXCLUSIVEADDRUSE = getattr(socket, "SO_EXCLUSIVEADDRUSE", None)


class AlreadyRunning(Exception):
    """Raised when another live process already owns the target port."""


def _port_is_listening(port: int) -> bool:
    """Detect an active listener on 127.0.0.1:port via a TCP connect probe."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(1.0)
    try:
        probe.connect(("127.0.0.1", port))
        return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False
    finally:
        probe.close()


def _describe_port_owner(port: int) -> str:
    """Best-effort: resolve which PID owns the port via netstat (Windows)."""
    try:
        import subprocess

        out = subprocess.run(
            f'netstat -ano | findstr /R ":{port}" | findstr "LISTENING"',
            shell=True,
            capture_output=True,
            text=True,
            timeout=3,
        ).stdout.strip()
        if not out:
            return "unknown owner"
        pids = {line.split()[-1] for line in out.splitlines() if line.split()}
        return "pid " + ",".join(sorted(pids)) if pids else "unknown owner"
    except Exception:
        return "unknown owner"


def ensure_single_instance(port: int, name: str) -> None:
    """Refuse to start if another live process already listens on 127.0.0.1:port.

    Pre-flight only: does NOT hold the port (the real server binds it). Raises
    AlreadyRunning when a listener is detected; otherwise returns silently.
    """
    if _port_is_listening(port):
        owner = _describe_port_owner(port)
        print(
            f"[single-instance] {name} already running on 127.0.0.1:{port} "
            f"({owner}). Exiting duplicate to avoid zombie.",
            file=sys.stderr,
            flush=True,
        )
        raise AlreadyRunning(f"{name} already running on 127.0.0.1:{port} ({owner})")


class ExclusiveThreadingHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer whose bind cannot silently double-own a port.

    Disables ``SO_REUSEADDR`` (Windows footgun from ``HTTPServer.allow_reuse_address``)
    and enables ``SO_EXCLUSIVEADDRUSE`` where available so a second process binding
    the same port hard-fails with OSError instead of lingering as a zombie.
    """

    allow_reuse_address = 0

    def server_bind(self) -> None:
        if _SO_EXCLUSIVEADDRUSE is not None:
            self.socket.setsockopt(socket.SOL_SOCKET, _SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()