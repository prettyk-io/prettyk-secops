# -*- coding: utf-8 -*-
"""VP-B1: Тесты для CdpViewportRelay — async CDP screencast + WebSocket."""

from __future__ import annotations

import asyncio
import base64
import json
import socket
import struct
import time
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
import websockets

from browser.cdp_viewport_relay import (
    SCREENCAST_MAX_HEIGHT,
    SCREENCAST_MAX_WIDTH,
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


# ══════════════════════════════════════════════════════════════════════
# VIEWFIT-BE: screencast-кап под размеры контейнера
# ══════════════════════════════════════════════════════════════════════


class TestScreencastCap:
    def test_cap_covers_1920x1200_containers(self):
        """VIEWFIT-BE: кап должен вмещать контейнеры вплоть до 1920×1200."""
        assert SCREENCAST_MAX_WIDTH >= 1920
        assert SCREENCAST_MAX_HEIGHT >= 1200

    @pytest.mark.asyncio
    async def test_start_screencast_uses_viewfit_cap(self):
        """Page.startScreencast запускается с капом VIEWFIT-BE, а не 1280×800."""
        relay = CdpViewportRelay()
        relay._browser = MagicMock()
        page = MagicMock()
        cdp = MagicMock()
        cdp.send = AsyncMock()
        cdp.on = MagicMock()
        page.context.new_cdp_session = AsyncMock(return_value=cdp)
        relay._page = page

        await relay._start_screencast()

        cdp.send.assert_awaited_once_with(
            "Page.startScreencast",
            {
                "format": "jpeg",
                "quality": 80,
                "maxWidth": SCREENCAST_MAX_WIDTH,
                "maxHeight": SCREENCAST_MAX_HEIGHT,
                "everyNthFrame": 1,
            },
        )
        assert relay._cdp_session is cdp


# ══════════════════════════════════════════════════════════════════════
# RELAY-FRAME: viewport sync — свежий кадр в новом размере
# ══════════════════════════════════════════════════════════════════════


_VIEWFIT_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 8 + b"\xff\xd9"


class TestViewportSync:
    def _relay_with_cdp(self, observed: str):
        relay = CdpViewportRelay()
        relay._browser_connected = True
        calls: list[tuple] = []

        async def fake_send(method, params=None):
            calls.append((method, params))
            if method == "Runtime.evaluate":
                return {"result": {"value": observed}}
            if method == "Page.captureScreenshot":
                return {"data": base64.b64encode(_VIEWFIT_JPEG).decode()}
            raise AssertionError(f"unexpected CDP method: {method}")

        cdp = MagicMock()
        cdp.send = AsyncMock(side_effect=fake_send)
        relay._cdp_session = cdp
        return relay, calls

    @pytest.mark.asyncio
    async def test_capture_if_resized_pushes_frame_in_new_size(self):
        """RELAY-FRAME: расхождение размеров → captureScreenshot → _latest в новом размере."""
        relay, calls = self._relay_with_cdp("1083,661")
        relay._latest.push(_VIEWFIT_JPEG, {})
        relay._latest_width, relay._latest_height = 1920, 1080  # старый кадр

        await relay._capture_if_resized()

        assert [c[0] for c in calls] == ["Runtime.evaluate", "Page.captureScreenshot"]
        jpeg, seq = relay._latest.snapshot()
        assert seq == 2  # старый кадр + свежий
        assert jpeg == _VIEWFIT_JPEG
        assert (relay._latest_width, relay._latest_height) == (1083, 661)
        packed = _pack_frame(jpeg, relay._latest_width, relay._latest_height)
        assert struct.unpack(">HH", packed[:4]) == (1083, 661)

    @pytest.mark.asyncio
    async def test_capture_if_resized_captures_first_frame(self):
        """Пустой _latest (старт relay) → первый же тик даёт кадр текущего размера."""
        relay, calls = self._relay_with_cdp("1920,1080")

        await relay._capture_if_resized()

        assert [c[0] for c in calls] == ["Runtime.evaluate", "Page.captureScreenshot"]
        jpeg, seq = relay._latest.snapshot()
        assert seq == 1
        assert jpeg == _VIEWFIT_JPEG
        assert (relay._latest_width, relay._latest_height) == (1920, 1080)

    @pytest.mark.asyncio
    async def test_capture_if_resized_skips_when_size_matches(self):
        """Размер совпал с текущим кадром → лишних captureScreenshot нет."""
        relay, calls = self._relay_with_cdp("1083,661")
        relay._latest.push(_VIEWFIT_JPEG, {})
        relay._latest_width, relay._latest_height = 1083, 661

        await relay._capture_if_resized()

        assert [c[0] for c in calls] == ["Runtime.evaluate"]

    @pytest.mark.asyncio
    async def test_capture_if_resized_noop_without_connection(self):
        """Нет CDP-коннекта → тик ничего не шлёт и не падает."""
        relay = CdpViewportRelay()
        await relay._capture_if_resized()  # не подключён, нет сессии

    @pytest.mark.asyncio
    async def test_capture_if_resized_noop_without_cdp_session(self):
        relay = CdpViewportRelay()
        relay._browser_connected = True
        await relay._capture_if_resized()  # сессия ещё не создана

    @pytest.mark.asyncio
    async def test_sync_loop_marks_browser_lost_after_repeated_failures(self, monkeypatch):
        """Зомби-сессия: N неудачных сверок подряд → флаг для reconnect-дога."""
        relay = CdpViewportRelay()
        relay._browser_connected = True
        cdp = MagicMock()
        cdp.send = AsyncMock(side_effect=RuntimeError("session dead"))
        relay._cdp_session = cdp
        monkeypatch.setattr(CdpViewportRelay, "_VIEWPORT_POLL_INTERVAL", 0.01)

        task = asyncio.create_task(relay._viewport_sync_loop())
        try:
            for _ in range(100):
                await asyncio.sleep(0.01)
                if not relay._browser_connected:
                    break
            assert relay._browser_connected is False
        finally:
            relay._shutting_down = True
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


# ══════════════════════════════════════════════════════════════════════
# RELAY-STALE-WATCHDOG: heartbeat + лечение зависшего screencast
# ══════════════════════════════════════════════════════════════════════


class TestStaleWatchdog:
    _JPEG_OLD = b"\xff\xd8OLD-FRAME\xff\xd9"
    _JPEG_NEW = b"\xff\xd8NEW-FRAME\xff\xd9"

    def _relay(self, captured: bytes):
        """Relay с фейковой CDP-сессией: evaluate + captureScreenshot."""
        relay = CdpViewportRelay()
        relay._browser_connected = True
        relay._clients = {object()}

        async def fake_send(method, params=None):
            if method == "Runtime.evaluate":
                return {"result": {"value": "1083,661"}}
            if method == "Page.captureScreenshot":
                return {"data": base64.b64encode(captured).decode()}
            if method in {"Page.stopScreencast", "Page.startScreencast"}:
                return {}
            raise AssertionError(f"unexpected CDP method: {method}")

        cdp = MagicMock()
        cdp.send = AsyncMock(side_effect=fake_send)
        relay._cdp_session = cdp
        return relay, cdp

    @pytest.mark.asyncio
    async def test_stale_with_changed_content_pushes_and_restarts(self):
        """Молчание + изменившийся контент → heartbeat-кадр + restart screencast."""
        relay, _cdp = self._relay(self._JPEG_NEW)
        relay._latest.push(self._JPEG_OLD, {})
        relay._latest_width, relay._latest_height = 1083, 661
        relay._last_push_ts = time.monotonic() - 100  # стрим давно молчит
        relay._last_screencast_ts = time.monotonic() - 100
        relay._last_screencast_restart_ts = 0.0

        restarts: list[str] = []

        async def _fake_restart() -> None:
            restarts.append("restart")

        relay._restart_screencast = _fake_restart  # type: ignore[method-assign]

        await relay._heal_stale_stream()

        jpeg, seq = relay._latest.snapshot()
        assert seq == 2 and jpeg == self._JPEG_NEW
        assert relay._last_push_ts > time.monotonic() - 5
        assert restarts == ["restart"]

    @pytest.mark.asyncio
    async def test_stale_with_static_content_no_restart(self):
        """Статичная страница (кадр не изменился) → heartbeat без restart."""
        relay, _cdp = self._relay(self._JPEG_OLD)
        relay._latest.push(self._JPEG_OLD, {})
        relay._latest_width, relay._latest_height = 1083, 661
        relay._last_push_ts = time.monotonic() - 100
        relay._last_screencast_ts = time.monotonic() - 100

        restarts: list[str] = []

        async def _fake_restart() -> None:
            restarts.append("restart")

        relay._restart_screencast = _fake_restart  # type: ignore[method-assign]

        await relay._heal_stale_stream()

        assert restarts == []
        _jpeg, seq = relay._latest.snapshot()
        assert seq == 2  # heartbeat всё равно опубликован

    @pytest.mark.asyncio
    async def test_fresh_stream_no_work(self):
        """Кадры свежие → watchdog молчит (никаких CDP-вызовов)."""
        relay, cdp = self._relay(self._JPEG_NEW)
        relay._last_push_ts = time.monotonic()

        await relay._heal_stale_stream()

        cdp.send.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_clients_no_work(self):
        """Без клиентов heartbeat не нужен."""
        relay, cdp = self._relay(self._JPEG_NEW)
        relay._clients = set()
        relay._last_push_ts = time.monotonic() - 100

        await relay._heal_stale_stream()

        cdp.send.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_restart_uses_same_session_without_rehandlers(self, monkeypatch):
        """Restart — stop/start на той же сессии, .on повторно не зовётся."""
        relay, cdp = self._relay(self._JPEG_NEW)

        await relay._restart_screencast()

        methods = [c.args[0] for c in cdp.send.await_args_list]
        assert methods == ["Page.stopScreencast", "Page.startScreencast"]
        start_params = cdp.send.await_args_list[1].args[1]
        assert start_params["maxWidth"] == SCREENCAST_MAX_WIDTH
        cdp.on.assert_not_called()

    @pytest.mark.asyncio
    async def test_hung_cdp_call_escalates_via_timeout(self, monkeypatch):
        """Зависший Runtime.evaluate не морозит цикл: timeout → эскалация."""
        relay = CdpViewportRelay()
        relay._browser_connected = True

        async def _hang(method, params=None):
            await asyncio.sleep(3600)

        cdp = MagicMock()
        cdp.send = AsyncMock(side_effect=_hang)
        relay._cdp_session = cdp
        monkeypatch.setattr(CdpViewportRelay, "_VIEWPORT_POLL_INTERVAL", 0.01)
        monkeypatch.setattr(CdpViewportRelay, "_CDP_CALL_TIMEOUT_SEC", 0.05)

        task = asyncio.create_task(relay._viewport_sync_loop())
        try:
            for _ in range(200):
                await asyncio.sleep(0.01)
                if not relay._browser_connected:
                    break
            assert relay._browser_connected is False
        finally:
            relay._shutting_down = True
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    @pytest.mark.asyncio
    async def test_teardown_hung_detach_does_not_freeze(self, monkeypatch):
        """Зависший detach не морозит reconnect-дог: teardown завершается по таймауту."""
        relay = CdpViewportRelay()
        relay._browser_connected = True

        async def _hang():
            await asyncio.sleep(3600)

        cdp = MagicMock()
        cdp.detach = AsyncMock(side_effect=_hang)
        relay._cdp_session = cdp
        monkeypatch.setattr(CdpViewportRelay, "_CDP_CALL_TIMEOUT_SEC", 0.05)

        await asyncio.wait_for(relay._teardown_browser(), timeout=2.0)

        assert relay._browser_connected is False
        assert relay._cdp_session is None