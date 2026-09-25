# -*- coding: utf-8 -*-
"""BOX-IDLE-NORM: unit tests for utils.single_instance single-instance gate."""
import socket
import threading
import time

import pytest

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils.single_instance import (  # noqa: E402
    AlreadyRunning,
    ExclusiveThreadingHTTPServer,
    ensure_single_instance,
)


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _start_real_server(port: int) -> threading.Thread:
    """Serve a real listener on port via ExclusiveThreadingHTTPServer."""
    from http.server import BaseHTTPRequestHandler

    class H(BaseHTTPRequestHandler):
        def log_message(self, *args):  # noqa: D401 - silence
            pass

        def do_GET(self):
            self.send_response(200)
            self.end_headers()

    ready = threading.Event()
    server = ExclusiveThreadingHTTPServer(("127.0.0.1", port), H)

    def _run():
        ready.set()
        server.serve_forever()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    ready.wait(timeout=3)
    return t


def test_free_port_passes_silently():
    ensure_single_instance(_free_port(), "test_free")


def test_listening_port_is_refused():
    port = _free_port()
    _start_real_server(port)
    time.sleep(0.3)
    with pytest.raises(AlreadyRunning):
        ensure_single_instance(port, "test_dup")


def test_exclusive_server_hard_fails_on_double_bind():
    from http.server import BaseHTTPRequestHandler

    class H(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

    port = _free_port()
    s1 = ExclusiveThreadingHTTPServer(("127.0.0.1", port), H)
    try:
        with pytest.raises(OSError):
            ExclusiveThreadingHTTPServer(("127.0.0.1", port), H)
    finally:
        s1.server_close()