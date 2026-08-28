# -*- coding: utf-8 -*-
"""
VP-B1: Async CDP Screencast Relay.

Автономный asyncio WebSocket-сервер, который:
1. Подключается к headed-браузеру в контейнере playwright-authoring через CDP :9223.
2. Запускает Page.startScreencast → JPEG-кадры без синхронной блокировки очереди команд.
3. Транслирует кадры всем WebSocket-клиентам в бинарном формате:
   [uint16BE width] [uint16BE height] [JPEG data...]

   Это КАНОНИЧЕСКИЙ контракт, согласованный с фронтом VP-F1
   (frontend/src/terminal/useBrowserCanvasStream.ts):
   - getUint16(0) = width, getUint16(2) = height, JPEG c offset 4.
   - Канал чисто бинарный: НИКАКИХ текстовых "ready"/"error" сообщений
     (фронт держит binaryType='arraybuffer' и упал бы на DataView(string)).
   - Статус "браузер недоступен" идёт через HTTP /api/browser/status,
     который фронт уже поллит — не через WS.

4. FIFO-1 backpressure: хранится только последний кадр.
5. input (pointer) принимается опционально, но фронт VP-F1 использует
   HTTP /api/browser/click, а не WS — этот канал остаётся для будущего.

Архитектурное решение: отдельный asyncio event loop, не разделяющий поток
с синхронным _BrowserWorker. Эвакуация screencast из sync-контура в async.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import struct
import time
from typing import Optional, Set

import websockets
from websockets.asyncio.server import ServerConnection

from playwright.async_api import (
    async_playwright,
    Browser as AsyncBrowser,
    CDPSession as AsyncCDPSession,
    Page as AsyncPage,
)

logger = logging.getLogger("orchestrator.cdp.viewport")


class _LatestFrame:
    """FIFO-1: хранит только последний кадр с порядковым номером."""
    __slots__ = ("_frame", "_seq")

    def __init__(self) -> None:
        self._frame: Optional[bytes] = None
        self._seq: int = 0

    def push(self, jpeg: bytes, metadata: dict) -> None:
        self._frame = jpeg
        self._seq += 1

    def snapshot(self) -> tuple[Optional[bytes], int]:
        return self._frame, self._seq


def _pack_frame(jpeg: bytes, width: int, height: int) -> bytes:
    """Упаковать JPEG-кадр в канонический бинарный протокол VP-F1.

    [uint16BE width] [uint16BE height] [JPEG data...]
    """
    return struct.pack(">HH", width, height) + jpeg


class CdpViewportRelay:
    """Асинхронный CDP → WebSockeet relay для screencast + input."""

    def __init__(
        self,
        cdp_host: str = "",
        cdp_port: int = 0,
        ws_host: str = "",
        ws_port: int = 0,
    ) -> None:
        self._cdp_host = cdp_host or os.environ.get("PK_CDP_RELAY_HOST", "127.0.0.1")
        self._cdp_port = cdp_port or int(os.environ.get("PK_CDP_RELAY_PORT", "9223"))
        self._ws_host = ws_host or os.environ.get("PK_CDP_RELAY_WS_HOST", "0.0.0.0")
        self._ws_port = ws_port or int(os.environ.get("PK_CDP_RELAY_WS_PORT", "9224"))

        self._endpoint = f"http://{self._cdp_host}:{self._cdp_port}"
        self._browser_id: str = ""

        self._latest = _LatestFrame()
        self._latest_width: int = 0
        self._latest_height: int = 0
        self._latest_dpr: float = 1.0
        self._clients: Set[ServerConnection] = set()
        self._browser: Optional[AsyncBrowser] = None
        self._cdp_session: Optional[AsyncCDPSession] = None
        self._page: Optional[AsyncPage] = None
        self._browser_connected: bool = False
        self._shutting_down: bool = False

    # ── Public API ──

    async def start(self) -> None:
        """Запустить relay: CDP connect → screencast → WS server."""
        logger.info("Starting CDP viewport relay ws://%s:%s", self._ws_host, self._ws_port)
        await self._connect_to_browser()
        await self._start_screencast()
        await self._serve_ws()

    async def shutdown(self) -> None:
        """Остановить relay."""
        self._shutting_down = True
        if self._cdp_session:
            try:
                await self._cdp_session.detach()
            except Exception:
                pass
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
        self._browser_connected = False

    # ── Browser connection ──

    async def _connect_to_browser(self) -> None:
        logger.info("Connecting to CDP browser at %s", self._endpoint)
        try:
            pw = await async_playwright().start()
            self._browser = await pw.chromium.connect_over_cdp(self._endpoint)
            self._browser_id = f"cdp-relay-{int(time.time() * 1000)}"
            self._browser_connected = True
            logger.info("CDP connected, browserId=%s", self._browser_id)

            contexts = self._browser.contexts
            if contexts:
                ctx = contexts[0]
                pages = ctx.pages
                self._page = pages[0] if pages else await ctx.new_page()
            else:
                ctx = await self._browser.new_context()
                self._page = await ctx.new_page()
            logger.info("Relay page ready: %s", await self._page.title())
        except Exception as exc:
            logger.error("CDP connect failed: %s", exc)
            self._browser_connected = False
            raise

    # ── Screencast ──

    async def _start_screencast(self) -> None:
        if not self._browser or not self._page:
            raise RuntimeError("Browser not connected")

        cdp = await self._browser.new_browser_cdp_session()
        self._cdp_session = cdp

        async def _on_frame(params: dict) -> None:
            """CDP callback: Page.screencastFrame."""
            try:
                data_b64 = params.get("data", "")
                if not data_b64:
                    return
                jpeg = base64.b64decode(data_b64)
                metadata = params.get("metadata", {})
                self._latest.push(jpeg, metadata)
                self._latest_width = int(metadata.get("width", 0) or 0)
                self._latest_height = int(metadata.get("height", 0) or 0)
                self._latest_dpr = float(metadata.get("deviceScaleFactor", 1.0))

                session_id = params.get("sessionId", 0)
                if session_id:
                    await cdp.send("Page.screencastFrameAck", {"sessionId": session_id})
            except Exception:
                logger.exception("screencast frame callback failed")

        cdp.on("Page.screencastFrame", _on_frame)

        await cdp.send(
            "Page.startScreencast",
            {
                "format": "jpeg",
                "quality": 80,
                "maxWidth": 1280,
                "maxHeight": 800,
                "everyNthFrame": 1,
            },
        )
        logger.info("Screencast started via CDP session")

    # ── WebSocket server ──

    async def _serve_ws(self) -> None:
        async with websockets.serve(
            self._handle_client,
            self._ws_host,
            self._ws_port,
            ping_interval=15,
            ping_timeout=10,
            max_size=2 * 1024 * 1024,
        ):
            logger.info("WS server listening on %s:%s", self._ws_host, self._ws_port)
            broadcast_task = asyncio.create_task(self._broadcast_loop())
            try:
                await asyncio.Future()  # Вечный sleep
            except asyncio.CancelledError:
                pass
            finally:
                broadcast_task.cancel()
                try:
                    await broadcast_task
                except asyncio.CancelledError:
                    pass

    async def _handle_client(self, ws: ServerConnection) -> None:
        """Обработчик одного WebSocket-клиента.

        Канал чисто бинарный (VP-F1 контракт): никаких текстовых "ready"/"error".
        Статус браузера — через HTTP /api/browser/status.
        """
        self._clients.add(ws)
        logger.info("WS client connected (%d total)", len(self._clients))
        try:
            async for message in ws:
                if isinstance(message, bytes):
                    continue
                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    continue
                if payload.get("type") == "pointer":
                    await self._dispatch_pointer(payload)

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._clients.discard(ws)
            logger.info("WS client disconnected (%d total)", len(self._clients))

    async def _broadcast_loop(self) -> None:
        """Фоновый loop: рассылает последний кадр всем клиентам ~30 fps."""
        last_seq_sent = 0
        while not self._shutting_down:
            jpeg, seq = self._latest.snapshot()
            if jpeg is not None and seq > last_seq_sent:
                last_seq_sent = seq
                packed = _pack_frame(
                    jpeg, self._latest_width, self._latest_height
                )
                await self._broadcast_binary(packed)
            await asyncio.sleep(1.0 / 30.0)

    # ── Broadcast helpers ──

    async def _broadcast_binary(self, data: bytes) -> None:
        dead: list[ServerConnection] = []
        for client in self._clients:
            try:
                await client.send(data)
            except websockets.exceptions.ConnectionClosed:
                dead.append(client)
            except Exception:
                dead.append(client)
        for d in dead:
            self._clients.discard(d)

    # ── Input dispatching ──

    async def _dispatch_pointer(self, payload: dict) -> None:
        if not self._browser_connected or not self._page:
            return
        action = payload.get("action", "mouseMoved")
        x = float(payload.get("x", 0))
        y = float(payload.get("y", 0))
        button = payload.get("button", "left")
        click_count = int(payload.get("clickCount", 1))

        try:
            await self._page.mouse.move(x, y)
            if action == "mousePressed":
                await self._page.mouse.down(button=button, click_count=click_count)
            elif action == "mouseReleased":
                await self._page.mouse.up(button=button, click_count=click_count)
        except Exception:
            logger.exception("Pointer dispatch failed")


# ── Точка входа ──

async def _run_relay() -> None:
    relay = CdpViewportRelay()
    try:
        await relay.start()
    except KeyboardInterrupt:
        await relay.shutdown()
    except Exception:
        logger.exception("Relay crashed")
        await relay.shutdown()


def start_relay() -> None:
    """Синхронная точка входа для вызова из внещнего кода."""
    asyncio.run(_run_relay())


if __name__ == "__main__":
    start_relay()