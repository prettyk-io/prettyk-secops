# -*- coding: utf-8 -*-
"""VP-B1: Тесты для CdpViewportRelay — async CDP screencast + WebSocket."""

from __future__ import annotations

import asyncio
import json
import socket
import struct

import pytest
import pytest_asyncio
import websockets

from browser.cdp_viewport_relay import (
    CdpViewportRelay,
    _LatestFrame,
    _pack_frame,
    start_relay,
)


# ── Helper fixture: allocate a free TCP port ──

@pytest_asyncio.fixture
async def free_port() -> int:
    """Возвращает свободный TCP порт."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ══════════════════════════════════════════════════════════════════════
# _LatestFrame — FIFO-1
# ══════════════════════════════════════════════════════════════════════


class TestLatestFrame:
    def test_initial_snapshot_returns_none(self):
        lf = _LatestFrame()
        jpeg, seq = lf.snapshot()
        assert jpeg is None
        assert seq == 0

    def test_push_increments_seq(self):
        lf = _LatestFrame()
        lf.push(b"\xff\xd8\xff\xe0\x00\x10JFIF", {"width": 800, "height": 600})
        lf.push(b"\xff\xd8\xff\xe0\x00\x10NEW  ", {"width": 1024, "height": 768})
        jpeg, seq = lf.snapshot()
        assert seq == 2
        assert jpeg is not None
        assert b"NEW" in jpeg

    def test_fifo_1_keeps_only_latest(self):
        lf = _LatestFrame()
        lf.push(b"frame-1", {})
        lf.push(b"frame-2", {})
        lf.push(b"frame-3", {})
        lf.push(b"frame-4", {})
        lf.push(b"frame-5", {})
        jpeg, seq = lf.snapshot()
        assert seq == 5
        assert jpeg == b"frame-5"

    def test_empty_metadata_does_not_crash(self):
        lf = _LatestFrame()
        lf.push(b"jpeg-data", {})
        jpeg, seq = lf.snapshot()
        assert seq == 1
        assert jpeg == b"jpeg-data"


# ══════════════════════════════════════════════════════════════════════
# _pack_frame — binary protocol
# ══════════════════════════════════════════════════════════════════════


class TestPackFrame:
    def test_packed_format_has_correct_structure(self):
        jpeg = b"\xff\xd8\xff\xd9"
        packed = _pack_frame(jpeg, width=1280, height=800)

        # [uint16BE width][uint16BE height][JPEG]
        assert struct.unpack(">HH", packed[:4]) == (1280, 800)
        assert packed[4:] == jpeg

    def test_roundtrip_preserves_jpeg(self):
        from hashlib import sha256

        jpeg = b"\xff\xd8" + b"\x00" * 100 + b"\xff\xd9"
        packed = _pack_frame(jpeg, width=1920, height=1080)
        assert sha256(packed[4:]).digest() == sha256(jpeg).digest()

    def test_width_height_encoded_as_uint16be(self):
        packed = _pack_frame(b"\xff\xd8\xff\xd9", width=800, height=600)
        assert packed[:2] == b"\x03\x20"  # 800 = 0x0320
        assert packed[2:4] == b"\x02\x58"  # 600 = 0x0258


# ══════════════════════════════════════════════════════════════════════
# CdpViewportRelay — constructor & env vars
# ══════════════════════════════════════════════════════════════════════


class TestCdpViewportRelayConstructor:
    def test_default_env_vars(self):
        relay = CdpViewportRelay()
        assert relay._cdp_host == "127.0.0.1"
        assert relay._cdp_port == 9223
        assert relay._ws_host == "0.0.0.0"
        assert relay._ws_port == 9224
        assert relay._endpoint == "http://127.0.0.1:9223"

    def test_custom_env_vars(self, monkeypatch):
        monkeypatch.setenv("PK_CDP_RELAY_HOST", "playwright-authoring")
        monkeypatch.setenv("PK_CDP_RELAY_PORT", "9222")
        monkeypatch.setenv("PK_CDP_RELAY_WS_HOST", "127.0.0.1")
        monkeypatch.setenv("PK_CDP_RELAY_WS_PORT", "9999")
        relay = CdpViewportRelay()
        assert relay._cdp_host == "playwright-authoring"
        assert relay._cdp_port == 9222
        assert relay._ws_host == "127.0.0.1"
        assert relay._ws_port == 9999

    def test_explicit_args_override_env(self, monkeypatch):
        monkeypatch.setenv("PK_CDP_RELAY_PORT", "9999")
        relay = CdpViewportRelay(cdp_port=7777, ws_port=7778)
        assert relay._cdp_port == 7777
        assert relay._ws_port == 7778


# ══════════════════════════════════════════════════════════════════════
# WebSocket integration tests
# ══════════════════════════════════════════════════════════════════════


class TestWebSocketIntegration:
    @pytest.mark.asyncio
    async def test_ws_server_starts_and_accepts_connection(self, free_port):
        """WS-сервер стартует и принимает соединение (бинарный канал, без text-хендшейка)."""
        relay = CdpViewportRelay(ws_port=free_port)
        relay._browser_connected = True
        relay._browser_id = "test-browser-001"

        server_task = asyncio.create_task(relay._serve_ws())
        await asyncio.sleep(0.15)

        try:
            async with websockets.connect(f"ws://127.0.0.1:{free_port}/api/browser/canvas") as ws:
                await asyncio.sleep(0.1)
                # Бинарный канал: текстового "ready" нет, клиент просто подключён.
                assert len(relay._clients) == 1
        finally:
            await relay.shutdown()
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass

    @pytest.mark.asyncio
    async def test_multiple_clients_connect(self, free_port):
        """Несколько клиентов подключаются одновременно."""
        relay = CdpViewportRelay(ws_port=free_port)
        relay._browser_connected = True
        relay._browser_id = "multi"

        server_task = asyncio.create_task(relay._serve_ws())
        await asyncio.sleep(0.15)

        try:
            async with (websockets.connect(f"ws://127.0.0.1:{free_port}/api/browser/canvas") as ws1,
                        websockets.connect(f"ws://127.0.0.1:{free_port}/api/browser/canvas") as ws2):
                await asyncio.sleep(0.1)
                assert len(relay._clients) == 2
        finally:
            await relay.shutdown()
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass

    @pytest.mark.asyncio
    async def test_pointer_input_accepted(self, free_port):
        """Input-контракт: клиент шлёт pointer — relay не падает."""
        relay = CdpViewportRelay(ws_port=free_port)
        relay._browser_connected = False  # dispatch молча пропустит

        server_task = asyncio.create_task(relay._serve_ws())
        await asyncio.sleep(0.15)

        try:
            async with websockets.connect(f"ws://127.0.0.1:{free_port}/api/browser/canvas") as ws:
                await asyncio.sleep(0.05)
                await ws.send(json.dumps({
                    "type": "pointer",
                    "action": "mousePressed",
                    "x": 150,
                    "y": 300,
                    "button": "left",
                    "clickCount": 1,
                }))
                await asyncio.sleep(0.1)
        finally:
            await relay.shutdown()
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass

    @pytest.mark.asyncio
    async def test_invalid_json_does_not_crash(self, free_port):
        """Битый JSON от клиента не валит сервер."""
        relay = CdpViewportRelay(ws_port=free_port)
        relay._browser_connected = False

        server_task = asyncio.create_task(relay._serve_ws())
        await asyncio.sleep(0.15)

        try:
            async with websockets.connect(f"ws://127.0.0.1:{free_port}/api/browser/canvas") as ws:
                await asyncio.sleep(0.05)
                await ws.send("not json {[[")
                await asyncio.sleep(0.1)
        finally:
            await relay.shutdown()
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass


# ══════════════════════════════════════════════════════════════════════
# Broadcast: binary frame transmission
# ══════════════════════════════════════════════════════════════════════


class TestBroadcast:
    @pytest.mark.asyncio
    async def test_latest_frame_broadcast_to_client(self, free_port):
        """FIFO-1: клиент получает бинарный кадр [uint16 w][uint16 h][JPEG]."""
        relay = CdpViewportRelay(ws_port=free_port)
        relay._browser_connected = True
        relay._browser_id = "frame-test"

        test_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\xff\xd9"

        server_task = asyncio.create_task(relay._serve_ws())
        await asyncio.sleep(0.3)

        try:
            async with websockets.connect(f"ws://127.0.0.1:{free_port}/api/browser/canvas") as ws:
                await asyncio.sleep(0.1)

                # Пушим свежий кадр ПОСЛЕ connect, чтобы broadcast loop его подхватил
                relay._latest.push(test_jpeg, {"width": 640, "height": 480, "deviceScaleFactor": 1.0})
                relay._latest_width = 640
                relay._latest_height = 480
                relay._latest_dpr = 1.0

                msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                assert isinstance(msg, bytes)

                # [uint16BE width][uint16BE height][JPEG]
                width, height = struct.unpack(">HH", msg[:4])
                assert width == 640
                assert height == 480
                assert msg[4:] == test_jpeg
        finally:
            await relay.shutdown()
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass

    @pytest.mark.asyncio
    async def test_fifo_1_sends_only_latest_frame(self, free_port):
        """FIFO-1: промежуточные кадры теряются, доходит только последний."""
        relay = CdpViewportRelay(ws_port=free_port)
        relay._browser_connected = True

        server_task = asyncio.create_task(relay._serve_ws())
        await asyncio.sleep(0.3)

        try:
            async with websockets.connect(f"ws://127.0.0.1:{free_port}/api/browser/canvas") as ws:
                await asyncio.sleep(0.1)

                # Пушим несколько кадров до того, как broadcast loop заберёт последний
                for i in range(10):
                    relay._latest.push(b"\xff\xd8FRAME%d\xff\xd9" % i, {"width": 100, "height": 50})
                relay._latest_width = 100
                relay._latest_height = 50

                msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                assert isinstance(msg, bytes)
                assert msg[4:] == b"\xff\xd8FRAME9\xff\xd9"  # только последний
        finally:
            await relay.shutdown()
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass


# ══════════════════════════════════════════════════════════════════════
# Module-level smoke
# ══════════════════════════════════════════════════════════════════════


def test_start_relay_function_exists():
    assert callable(start_relay)