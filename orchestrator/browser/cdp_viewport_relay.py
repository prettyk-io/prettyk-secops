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
6. RELAY-FRAME: relay сам сверяет размер вьюпорта своей CDP-сессией
   (Runtime.evaluate → window.innerWidth/Height) и при расхождении с текущим
   кадром форсит свежий кадр Page.captureScreenshot — кадр нового размера
   доезжает до клиентов без repaint страницы и без чужой sync-сессии воркера.
7. RELAY-STALE-WATCHDOG: свежесть стрима под контролем — все CDP-вызовы цикла
   под таймаутом (зависший вызов на мёртвой сессии не морозит watchdog),
   молчание кадров при живых клиентах лечится heartbeat-кадром и stop/start
   screencast на месте, долгие сбои — реконнектом.

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


# VIEWFIT-BE: screencast-кап холста оператора. Прежние 1280×800 резали
# контейнеры ≥ этого размера: CDP скейлил кадр и координаты кликов «плыли».
# 1920×1200 — single source of truth для Page.startScreencast и fallback-метаданных.
SCREENCAST_MAX_WIDTH = 1920
SCREENCAST_MAX_HEIGHT = 1200


class CdpViewportRelay:
    """Асинхронный CDP → WebSocket relay для screencast + input (SOR-L1: per-session)."""

    def __init__(
        self,
        cdp_host: str = "",
        cdp_port: int = 0,
        ws_host: str = "",
        ws_port: int = 0,
        session_id: str = "",
    ) -> None:
        self._cdp_host = cdp_host or os.environ.get("PK_CDP_RELAY_HOST", "127.0.0.1")
        self._cdp_port = cdp_port or int(os.environ.get("PK_CDP_RELAY_PORT", "9223"))
        self._ws_host = ws_host or os.environ.get("PK_CDP_RELAY_WS_HOST", "0.0.0.0")
        self._ws_port = ws_port or int(os.environ.get("PK_CDP_RELAY_WS_PORT", "9224"))
        self._session_id = session_id
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
        # RELAY-STALE-WATCHDOG: часы свежести стрима (monotonic, сек).
        # _last_push_ts — любой push в _latest (screencast | watchdog-heartbeat);
        # _last_screencast_ts — только screencast-кадры (для «мёртв ли screencast»);
        # _last_screencast_restart_ts — cooldown stop/start-лечения.
        self._last_push_ts: float = 0.0
        self._last_screencast_ts: float = 0.0
        self._last_screencast_restart_ts: float = 0.0

    # ── Public API ──

    async def start(self) -> None:
        """Запустить relay: CDP connect (с реконнектом) → screencast → WS server."""
        logger.info("Starting CDP viewport relay ws://%s:%s", self._ws_host, self._ws_port)
        # VP-FIX-L1: relay должен стартовать даже если контейнер ещё не поднят.
        # WS-сервер поднимается в любом случае; CDP догоняется watch-догом.
        await self._connect_to_browser()
        if self._browser_connected:
            try:
                await self._start_screencast()
            except Exception:
                logger.exception("Initial screencast failed, will retry via reconnect loop")
        # Фоновый watch-дог: если браузер упал — реконнект без смерти процесса.
        reconnect_task = asyncio.create_task(self._reconnect_loop())
        # RELAY-FRAME: фоновый sync размера вьюпорта (кадр в новом размере ≤1s).
        viewport_task = asyncio.create_task(self._viewport_sync_loop())
        try:
            await self._serve_ws()
        finally:
            reconnect_task.cancel()
            viewport_task.cancel()
            for task in (reconnect_task, viewport_task):
                try:
                    await task
                except asyncio.CancelledError:
                    # NOSONAR: исходный CancelledError/исключение _serve_ws дальше
                    # продолжит распространение из finally.
                    pass

    async def _reconnect_loop(self) -> None:
        """VP-FIX-L1: реконнект при падении контейнера без смерти процесса.

        Периодически проверяет живость браузера. При обрыве — закрывает старый
        browser/session и переподключается, снова запуская screencast.
        """
        while not self._shutting_down:
            await asyncio.sleep(5.0)
            if self._browser_connected:
                continue

            # Браузер отвалился — пробуем переподключиться
            try:
                logger.info("Reconnect: browser lost, retrying CDP connect…")
                await self._teardown_browser()
                await self._connect_to_browser()
                await self._start_screencast()
                logger.info("Reconnect: CDP reconnected, screencast restarted")
            except Exception:
                # Не умираем — просто ждём следующую попытку
                logger.warning("Reconnect attempt failed, will retry in 5s")

    async def _teardown_browser(self) -> None:
        """Закрыть текущий browser/session перед переподключением.

        RELAY-STALE-WATCHDOG: detach/close — под таймаутом; зависший на мёртвой
        сессии await здесь заморозил бы reconnect-дог навсегда.
        """
        if self._cdp_session:
            try:
                await asyncio.wait_for(
                    self._cdp_session.detach(), timeout=self._CDP_CALL_TIMEOUT_SEC
                )
            except Exception:
                pass
            self._cdp_session = None
        if self._browser:
            try:
                await asyncio.wait_for(
                    self._browser.close(), timeout=self._CDP_CALL_TIMEOUT_SEC
                )
            except Exception:
                pass
            self._browser = None
        self._page = None
        self._browser_connected = False

    async def shutdown(self) -> None:
        """Остановить relay."""
        self._shutting_down = True
        if self._cdp_session:
            try:
                await asyncio.wait_for(
                    self._cdp_session.detach(), timeout=self._CDP_CALL_TIMEOUT_SEC
                )
            except Exception:
                pass
        if self._browser:
            try:
                await asyncio.wait_for(
                    self._browser.close(), timeout=self._CDP_CALL_TIMEOUT_SEC
                )
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
            # VP-FIX-L1: НЕ кидаем — watch-дог переподключит позже.
            # Процесс relay должен переживать падение контейнера.
            self._browser = None
            self._page = None

    # ── Screencast ──

    async def _start_screencast(self) -> None:
        if not self._browser or not self._page:
            raise RuntimeError("Browser not connected")

        # VP-FIX: Page.startScreencast — домен ПЕЙДЖА, а не браузера.
        # new_browser_cdp_session() даёт browser-level сессию, где Page.* нет
        # (ошибка "'Page.startScreencast' wasn't found"). Нужна page-level сессия.
        cdp = await self._page.context.new_cdp_session(self._page)
        self._cdp_session = cdp

        async def _on_frame(params: dict) -> None:
            """CDP callback: Page.screencastFrame."""
            try:
                data_b64 = params.get("data", "")
                if not data_b64:
                    return
                jpeg = base64.b64decode(data_b64)
                metadata = params.get("metadata", {}) or {}
                self._latest.push(jpeg, metadata)
                # VP-FIX: CDP отдаёт размеры в metadata.deviceWidth/deviceHeight,
                # а НЕ width/height. Fallback на screencast-кап (VIEWFIT-BE) если metadata пустой.
                self._latest_width = int(
                    metadata.get("deviceWidth")
                    or metadata.get("width")
                    or SCREENCAST_MAX_WIDTH
                )
                self._latest_height = int(
                    metadata.get("deviceHeight")
                    or metadata.get("height")
                    or SCREENCAST_MAX_HEIGHT
                )
                self._latest_dpr = float(metadata.get("deviceScaleFactor", 1.0))
                now = time.monotonic()
                self._last_push_ts = now
                self._last_screencast_ts = now

                session_id = params.get("sessionId", 0)
                if session_id:
                    await cdp.send("Page.screencastFrameAck", {"sessionId": session_id})
            except Exception:
                logger.exception("screencast frame callback failed")

        cdp.on("Page.screencastFrame", _on_frame)

        await cdp.send("Page.startScreencast", self._screencast_params())
        clock = time.monotonic()
        self._last_push_ts = clock
        self._last_screencast_ts = clock
        logger.info("Screencast started via CDP session")

    # ── VIEWPORT SYNC + STALE WATCHDOG (RELAY-FRAME / RELAY-STALE-WATCHDOG) ──

    # Период сверки вьюпорта своей CDP-сессией: кадр нового размера должен
    # доехать до клиентов ≤1s после POST /api/browser/viewport.
    _VIEWPORT_POLL_INTERVAL = 0.5
    # Сколько подряд неудачных сверок считаем «сессия мертва» (зомби-защита:
    # screencast умер, а _browser_connected остался True — тогда reconnect-дог
    # только по флагу никогда не сработает).
    _VIEWPORT_FAILS_TO_RECONNECT = 4
    # RELAY-STALE-WATCHDOG: все CDP-вызовы цикла — под таймаутом, иначе
    # зависший Runtime.evaluate намертво морозит sync-loop (клиенты видят один
    # старый кадр, никаких логов/эскалации — «relay залип»).
    _CDP_CALL_TIMEOUT_SEC = float(os.environ.get("PK_RELAY_CDP_TIMEOUT_SEC", "5"))
    # Молчание кадров при живых клиентах дольше этого = stale → heartbeat.
    _STREAM_STALE_SEC = float(os.environ.get("PK_RELAY_STALE_SEC", "6"))
    # Cooldown stop/start-лечения screencast (не чаще раза в N сек).
    _SCREENCAST_RESTART_COOLDOWN_SEC = float(
        os.environ.get("PK_RELAY_RESTART_COOLDOWN_SEC", "30")
    )

    async def _viewport_sync_loop(self) -> None:
        """RELAY-FRAME + RELAY-STALE-WATCHDOG: relay — единый источник кадра.

        Resize viewport сам по себе не рождает ``Page.screencastFrame``
        (композитор молчит на статичной странице), а nudge воркера идёт через
        ЧУЖУЮ sync-сессию (browser_service) и до screencast-сессии relay не
        доезжает. Поэтому периодически сверяем размер вьюпорта СВОЕЙ сессией
        и при расхождении с текущим кадром форсим ``Page.captureScreenshot``.

        Плюс watchdog: если у клиентов давно нет кадров — форсим heartbeat-кадр
        и при явной смерти screencast перезапускаем его (см. ``_heal_stale_stream``).
        """
        fails = 0
        while not self._shutting_down:
            await asyncio.sleep(self._VIEWPORT_POLL_INTERVAL)
            try:
                await self._capture_if_resized()
                await self._heal_stale_stream()
                fails = 0
            except Exception:
                # CancelledError (BaseException) не ловим — loop умирает только
                # по shutdown; прочие сбои не должны ронять фоновую сверку.
                fails += 1
                logger.debug("viewport sync tick failed (%d)", fails, exc_info=True)
                if fails >= self._VIEWPORT_FAILS_TO_RECONNECT and self._browser_connected:
                    logger.warning(
                        "viewport sync: CDP session unresponsive — marking browser lost for reconnect"
                    )
                    self._browser_connected = False
                    fails = 0

    async def _read_viewport(self) -> tuple[int, int] | None:
        """CSS-размер вьюпорта своей сессией (под таймаутом; None — не прочитался)."""
        res = await asyncio.wait_for(
            self._cdp_session.send(
                "Runtime.evaluate",
                {
                    "expression": "window.innerWidth + ',' + window.innerHeight",
                    "returnByValue": True,
                },
            ),
            timeout=self._CDP_CALL_TIMEOUT_SEC,
        )
        raw = ((res or {}).get("result") or {}).get("value") or ""
        try:
            w_str, h_str = str(raw).split(",", 1)
            w, h = int(w_str), int(h_str)
        except ValueError:
            return None
        if w <= 0 or h <= 0:
            return None
        return (w, h)

    async def _capture_jpeg(self) -> bytes | None:
        """Свежий кадр на своей сессии (под таймаутом)."""
        shot = await asyncio.wait_for(
            self._cdp_session.send(
                "Page.captureScreenshot",
                {"format": "jpeg", "quality": 80, "captureBeyondViewport": False},
            ),
            timeout=self._CDP_CALL_TIMEOUT_SEC,
        )
        data_b64 = (shot or {}).get("data") or ""
        return base64.b64decode(data_b64) if data_b64 else None

    def _push_frame(self, jpeg: bytes, width: int, height: int) -> None:
        """Опубликовать кадр клиентам и обновить часы свежести."""
        self._latest.push(jpeg, {})
        self._latest_width = width
        self._latest_height = height
        self._last_push_ts = time.monotonic()

    async def _capture_if_resized(self) -> None:
        """Сверить window.innerWidth/Height и при расхождении пушить свежий кадр."""
        if not self._browser_connected or self._cdp_session is None:
            return
        dims = await self._read_viewport()
        if dims is None:
            return
        w, h = dims
        jpeg, _seq = self._latest.snapshot()
        if jpeg is not None and (w, h) == (self._latest_width, self._latest_height):
            return  # кадр уже актуального размера
        new_jpeg = await self._capture_jpeg()
        if new_jpeg is None:
            return
        self._push_frame(new_jpeg, w, h)
        logger.info("viewport sync: pushed fresh frame %sx%s", w, h)

    async def _heal_stale_stream(self) -> None:
        """RELAY-STALE-WATCHDOG: клиенты есть, а кадры молчат — лечим.

        1) Heartbeat: форсим кадр тем же CDP-путём — клиент видит свежий кадр,
           даже если screencast «умер» (сессия и страница живы).
        2) Если контент изменился, а screencast-кадров нет — stop/start
           screencast на своей сессии (лечение мёртвого screencast).

        Все CDP-вызовы под wait_for: зависшая сессия не морозит цикл, а
        эскалируется счётчиком fails (→ reconnect-дог).
        """
        if not self._clients or not self._browser_connected or self._cdp_session is None:
            return
        now = time.monotonic()
        if (now - self._last_push_ts) < self._STREAM_STALE_SEC:
            return
        dims = await self._read_viewport()
        if dims is None:
            return
        w, h = dims
        jpeg = await self._capture_jpeg()
        if jpeg is None:
            return
        prev_jpeg, _seq = self._latest.snapshot()
        changed = prev_jpeg != jpeg
        self._push_frame(jpeg, w, h)
        # Свежий now ПОСЛЕ publish: пока делали capture, мог прийти screencast-кадр
        # (тогда «молчание» маленькое и restart не нужен).
        after = time.monotonic()
        screencast_silent = max(0.0, after - self._last_screencast_ts)
        logger.info(
            "stale stream: watchdog frame %sx%s (clients=%d screencast_silent=%.0fs changed=%s)",
            w,
            h,
            len(self._clients),
            screencast_silent,
            changed,
        )
        if (
            changed
            and screencast_silent >= self._STREAM_STALE_SEC
            and (after - self._last_screencast_restart_ts) >= self._SCREENCAST_RESTART_COOLDOWN_SEC
        ):
            await self._restart_screencast()

    @staticmethod
    def _screencast_params() -> dict:
        return {
            "format": "jpeg",
            "quality": 80,
            "maxWidth": SCREENCAST_MAX_WIDTH,
            "maxHeight": SCREENCAST_MAX_HEIGHT,
            "everyNthFrame": 1,
        }

    async def _restart_screencast(self) -> None:
        """RELAY-STALE-WATCHDOG: stop/start screencast на СВОЕЙ CDP-сессии.

        Обработчик кадров уже навешен на сессию — повторно ``.on`` не
        регистрируем (иначе каждый кадр обрабатывался бы дважды).
        """
        self._last_screencast_restart_ts = time.monotonic()
        try:
            await asyncio.wait_for(
                self._cdp_session.send("Page.stopScreencast"),
                timeout=self._CDP_CALL_TIMEOUT_SEC,
            )
        except Exception:
            logger.debug("screencast restart: stop failed", exc_info=True)
        await asyncio.wait_for(
            self._cdp_session.send("Page.startScreencast", self._screencast_params()),
            timeout=self._CDP_CALL_TIMEOUT_SEC,
        )
        logger.warning("stale screencast: restarted (stop/start on same session)")

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
                raise  # NOSONAR — re-raise after cleanup per asyncio contract
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

        VP-FIX-L1: при подключении сразу шлём последний кадр (если уже есть),
        чтобы клиент не ждал нового repaint на статичной странице.
        """
        self._clients.add(ws)
        logger.info("WS client connected (%d total)", len(self._clients))
        try:
            # Немедленно отдать текущий кадр — иначе клиент на статичной
            # странице (Juice Shop главная) не дождётся нового screencast-кадра.
            jpeg, _seq = self._latest.snapshot()
            if jpeg is not None:
                packed = _pack_frame(
                    jpeg, self._latest_width, self._latest_height
                )
                await ws.send(packed)

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

async def _run_relay(session_id: str = "", ws_port: int = 0) -> None:
    relay = CdpViewportRelay(session_id=session_id, ws_port=ws_port)
    try:
        await relay.start()
    except KeyboardInterrupt:
        await relay.shutdown()
    except Exception:
        logger.exception("Relay crashed for session %s", session_id or "default")
        await relay.shutdown()


def start_relay(session_id: str = "", ws_port: int = 0) -> None:
    """SOR-L1: синхронная точка входа с привязкой к session_id.

    Если session_id не указан — используется глобальный порт по умолчанию :9224.
    Для per-session релея передать session_id + выделенный ws_port.
    """
    asyncio.run(_run_relay(session_id=session_id, ws_port=ws_port))


if __name__ == "__main__":
    # BOX-IDLE-NORM: the global idle relay owns :9224; refuse a zombie duplicate.
    import sys

    # Standalone-запуск (python -m browser.cdp_viewport_relay): логи в stderr,
    # иначе INFO-строки (в т.ч. «viewport sync: pushed fresh frame») теряются.
    import logging as _logging

    _logging.basicConfig(
        level=_logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    try:
        from utils.single_instance import AlreadyRunning, ensure_single_instance

        ensure_single_instance(9224, "cdp_viewport_relay")
    except AlreadyRunning:
        sys.exit(0)

    start_relay()