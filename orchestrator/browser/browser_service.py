# -*- coding: utf-8 -*-
"""Authoring browser service for Studio Browser Panel — VP-L1 container-only.

PK_BROWSER_CDP_ENDPOINT ОБЯЗАТЕЛЕН. Браузер живёт ВНУТРИ playwright-authoring
контейнера (headed Chromium под Xvfb). Никаких окон на десктопе хоста.

Playwright objects are strictly thread-bound. Все операции диспатчатся через
однопоточный _BrowserWorker, владеющий единственным CDP-соединением.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import queue
import threading
import time
import uuid
from typing import Optional

logger = logging.getLogger("orchestrator.browser")

# BBA-1: каноничный fallback-клик по координате. Primary — page.mouse
# (CDP Input.dispatchMouseEvent, реальный hit-test). Этот JS — только fallback,
# когда физический клик поглощён overlay: берём элемент под точкой напрямую и
# диспатчим mousedown/mouseup/click на него (обходит физический hit-test).
# page.evaluate(expression, arg) принимает ОДИН arg — передаём [x, y] списком.
_ELEMENT_FROM_POINT_JS = """
    ([x, y]) => {
        let el = document.elementFromPoint(x, y);
        if (!el) return false;
        // Подняться к ближайшему интерактивному элементу —
        // клик по span/внутреннему тексту кнопки должен стать
        // кликом по самой кнопке (иначе e.target = span, а Angular
        // ripple/snackbar перехватывает и observe ловит div).
        const interactive = el.closest('button, a, input, select, textarea, [role="button"], [role="link"]');
        if (interactive) el = interactive;
        const opts = { bubbles: true, cancelable: true, composed: true, view: window };
        const mk = (type, button, buttons) => new MouseEvent(type, {
            ...opts, clientX: x, clientY: y, button, buttons
        });
        el.dispatchEvent(mk('mousedown', 0, 1));
        el.dispatchEvent(mk('mouseup', 0, 0));
        el.dispatchEvent(mk('click', 0, 0));
        return true;
    }
"""

# ── BrowserWorker — single thread that owns the browser ──

class _BrowserWorker:
    """Lazy-started background thread owning Playwright browser.

    Commands are (name, kwargs_dict) tuples. Results are put into
    queue-of-one queues.

    All Playwright operations happen on this worker's thread only.
    """

    _TIMEOUT = 15.0

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cmd_queue: queue.Queue = queue.Queue()
        self._thread: threading.Thread | None = None
        self._pw: object | None = None
        self._browser: object | None = None
        self._context: object | None = None
        self._page: object | None = None
        self._browser_id: str | None = None
        self._started = False
        self._observe_active = False
        self._observed_events: list[dict] = []
        self._observe_last_event_id = 0
        self._binding_registered = False
        self._input_binding_registered = False
        # SOR-L2: per-session CDP endpoint override
        self._cdp_endpoint_override: str | None = None

    # ── public dispatch API ──

    def dispatch(self, cmd: str, **kwargs) -> dict:
        """Send command to worker thread, block for result."""
        if not self._started:
            with self._lock:
                if not self._started:
                    self._start()
        result_q: queue.Queue = queue.Queue(maxsize=1)
        self._cmd_queue.put((cmd, kwargs, result_q))
        try:
            return result_q.get(timeout=self._TIMEOUT)
        except queue.Empty:
            return {"ok": False, "error": "browser worker timeout"}

    # ── worker lifecycle ──

    def _start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True, name="browser-worker")
        self._thread.start()
        self._started = True
        logger.info("browser_service: worker thread started")

    def _run(self) -> None:
        """Main loop: process commands on this thread."""
        while True:
            try:
                cmd, kwargs, result_q = self._cmd_queue.get()
            except Exception:
                break
            try:
                handler = getattr(self, f"_cmd_{cmd}", None)
                if handler is None:
                    result_q.put({"ok": False, "error": f"unknown command: {cmd}"})
                else:
                    result_q.put(handler(**kwargs))
            except Exception as e:
                logger.exception("browser_service: _cmd_%s failed", cmd)
                result_q.put({"ok": False, "error": f"{type(e).__name__}: {e}"})

    # ── ensure browser (VP-L1: container-only, no host fallback) ──

    # Cache последней ошибки CDP — не спамим логами на каждый status().
    _last_cdp_error: str | None = None

    def _ensure_browser(self) -> object | None:
        """Lazy-launch browser on worker thread. Returns page or None.

        VP-L1: PK_BROWSER_CDP_ENDPOINT обязателен — host-Chromium выпилен.
        При отсутствии env или недоступности контейнера возвращает None.
        """
        if self._page is not None:
            try:
                self._page.evaluate("1")
                self._last_cdp_error = None
                return self._page
            except Exception:
                self._page = None

        cdp_endpoint = (
            self._cdp_endpoint_override
            or os.environ.get("PK_BROWSER_CDP_ENDPOINT")
        )
        if not cdp_endpoint:
            self._last_cdp_error = (
                "PK_BROWSER_CDP_ENDPOINT not set — "
                "запусти playwright-authoring контейнер: "
                "docker compose -f services/docker-compose.yml up -d playwright-authoring"
            )
            logger.warning("browser_service: %s", self._last_cdp_error)
            return None

        try:
            from browser.playwright_runtime import PlaywrightBrowserRuntime
            # VP-FIX: перед переподключением закрыть старый runtime.
            # Иначе второй sync_playwright() в том же worker-потоке кидает
            # "Playwright Sync API inside asyncio loop" → "browser not available".
            if self._pw is not None:
                try:
                    self._pw.close()
                except Exception:
                    pass
                self._pw = None
                self._browser = None
                self._page = None
                self._binding_registered = False
                self._input_binding_registered = False
            runtime = PlaywrightBrowserRuntime()
            self._page = runtime.connect_over_cdp(cdp_endpoint)
            self._browser = runtime.browser
            self._pw = runtime
            self._browser_id = f"container-{uuid.uuid4().hex[:12]}"
            self._last_cdp_error = None
            self._binding_registered = False  # новая страница — binding нужно регистрировать заново
            self._input_binding_registered = False
            logger.info("browser_service: connected to CDP container %s", cdp_endpoint)
            return self._page
        except Exception as e:
            self._last_cdp_error = (
                f"BROWSER_UNAVAILABLE: CDP connect to {cdp_endpoint} failed — "
                f"{type(e).__name__}: {e}. "
                f"Проверьте что playwright-authoring контейнер запущен и CDP порт доступен."
            )
            logger.warning("browser_service: %s", self._last_cdp_error)
            self._page = None
            return None

    # ── command handlers (run on worker thread) ──

    def _cmd_status(self) -> dict:
        novnc_base = os.environ.get("PK_AUTHORING_NOVNC_URL", None)
        if self._page is None:
            error_msg = None
            cdp = os.environ.get("PK_BROWSER_CDP_ENDPOINT")
            if not cdp:
                error_msg = (
                    "PK_BROWSER_CDP_ENDPOINT not set — "
                    "запусти playwright-authoring контейнер: "
                    "docker compose -f services/docker-compose.yml up -d playwright-authoring"
                )
            elif self._last_cdp_error:
                error_msg = self._last_cdp_error
            else:
                error_msg = "BROWSER_UNAVAILABLE"
            return {
                "ok": True, "connected": False, "url": None, "title": None,
                "browserId": None, "purpose": "authoring", "transport": "playwright",
                "runtime": "container", "headless": False, "streamUrl": None,
                "error": error_msg,
            }
        try:
            url = self._page.evaluate("window.location.href")
            title = self._page.evaluate("document.title")
            return {
                "ok": True, "connected": True, "url": url, "title": title,
                "browserId": self._browser_id, "purpose": "authoring",
                "transport": "playwright", "runtime": "container",
                "headless": False, "streamUrl": novnc_base,
            }
        except Exception as e:
            self._page = None
            return {
                "ok": True, "connected": False, "url": None, "title": None,
                "browserId": None, "purpose": "authoring", "transport": "playwright",
                "runtime": "container", "headless": False, "streamUrl": None,
                "error": f"BROWSER_UNAVAILABLE: {type(e).__name__}: {e}",
            }

    def _cmd_navigate(self, url: str) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        if not url.startswith(("http://", "https://")):
            return {"ok": False, "error": f"invalid url: {url}"}
        try:
            page.goto(url, timeout=8000, wait_until="domcontentloaded")
            return {
                "ok": True,
                "url": page.evaluate("window.location.href"),
                "title": page.evaluate("document.title"),
            }
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_screenshot(self) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            data = page.screenshot(type="png", full_page=False)
            return {"ok": True, "screenshot": base64.b64encode(data).decode("utf-8"), "format": "png"}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_back(self) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            page.go_back(timeout=10000, wait_until="domcontentloaded")
            return {"ok": True, "url": page.evaluate("window.location.href"), "title": page.evaluate("document.title")}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_forward(self) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            page.go_forward(timeout=10000, wait_until="domcontentloaded")
            return {"ok": True, "url": page.evaluate("window.location.href"), "title": page.evaluate("document.title")}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_click(self, selector: str, strategy: str = "css") -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            locator_map = {
                "role": lambda: page.get_by_role(selector),
                "text": lambda: page.get_by_text(selector, exact=True),
                "label": lambda: page.get_by_label(selector),
                "test_id": lambda: page.get_by_test_id(selector),
                "xpath": lambda: page.locator(f"xpath={selector}"),
                "css": lambda: page.locator(selector),
            }
            loc = locator_map.get(strategy, lambda: page.locator(selector))()
            loc.click(timeout=5000)
            return {"ok": True, "selector": selector, "strategy": strategy}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_type_text(self, selector: str, text: str, strategy: str = "css") -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            locator_map = {
                "role": lambda: page.get_by_role(selector),
                "text": lambda: page.get_by_text(selector, exact=True),
                "label": lambda: page.get_by_label(selector),
                "test_id": lambda: page.get_by_test_id(selector),
                "xpath": lambda: page.locator(f"xpath={selector}"),
                "css": lambda: page.locator(selector),
            }
            loc = locator_map.get(strategy, lambda: page.locator(selector))()
            loc.fill(text, timeout=5000)
            return {"ok": True, "selector": selector, "text": text}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_highlight(self, selector: str, strategy: str = "css") -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            page.evaluate("const old=document.getElementById('__pk_highlight__');if(old)old.remove();")
            safe = selector.replace("'", "\\'")
            js = f"""(function(){{
                let el=null;
                if('{strategy}'==='role')el=document.querySelector('[role="{safe}"]');
                else if('{strategy}'==='label'){{const ls=document.querySelectorAll('label');for(const l of ls)if(l.textContent&&l.textContent.trim()==='{safe}'){{el=l;break;}}}}
                else if('{strategy}'==='text'){{const all=document.querySelectorAll('button,a,span,div');for(const e of all)if(e.textContent&&e.textContent.trim()==='{safe}'){{el=e;break;}}}}
                else if('{strategy}'==='test_id')el=document.querySelector('[data-testid="{safe}"]');
                else if('{strategy}'==='xpath')el=document.evaluate('{safe}',document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;
                else el=document.querySelector('{safe}');
                if(!el)return JSON.stringify({{found:false}});
                const ov=document.createElement('div');ov.id='__pk_highlight__';
                const r=el.getBoundingClientRect();
                ov.style.cssText='position:fixed;left:'+r.left+'px;top:'+(r.top+window.scrollY)+'px;width:'+r.width+'px;height:'+r.height+'px;border:2px solid #38bdf8;background:rgba(56,189,248,0.08);z-index:2147483647;pointer-events:none;border-radius:4px;box-shadow:0 0 12px rgba(56,189,248,0.3);';
                document.body.appendChild(ov);
                return JSON.stringify({{found:true,tag:el.tagName.toLowerCase(),text:(el.textContent||'').slice(0,80).trim(),rect:{{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}}});
            }})()"""
            raw = page.evaluate(js)
            return {"ok": True, **json.loads(raw)}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_eval(self, expression: str) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            return {"ok": True, "result": page.evaluate(expression)}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    # ── BBA-2/3: viewport + расширенные input-действия ──

    def _cmd_viewport(self) -> dict:
        """BBA-2: точные метрики вьюпорта для координатного маппинга.

        Возвращает CSS-pixel размеры вьюпорта (то же пространство, в котором
        работает ``page.mouse``) + deviceScaleFactor. Фронт использует это
        вместо хардкода 1280×800 и не искажает клик при нестандартном DPR.
        """
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            vs = page.viewport_size or {}
            try:
                dpr = page.evaluate("window.devicePixelRatio")
            except Exception:
                dpr = 1.0
            return {
                "ok": True,
                "viewportWidth": int(vs.get("width") or 0),
                "viewportHeight": int(vs.get("height") or 0),
                "deviceScaleFactor": float(dpr or 1.0),
            }
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_keyboard_press(self, key: str) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        if not key:
            return {"ok": False, "error": "key required"}
        try:
            page.keyboard.press(key)
            return {"ok": True, "key": key}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_mouse_wheel(self, dx: float = 0.0, dy: float = 0.0) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            page.mouse.wheel(float(dx), float(dy))
            return {"ok": True, "dx": dx, "dy": dy}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_mouse_drag(self, x1: float, y1: float, x2: float, y2: float) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            page.mouse.move(float(x1), float(y1))
            page.mouse.down()
            page.mouse.move(float(x2), float(y2), steps=5)
            page.mouse.up()
            return {"ok": True, "from": [x1, y1], "to": [x2, y2]}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    # ── observe ──

    # BBA-1: окно ожидания события после физического клика page.mouse.
    # За это время observe-binding должен поймать DOM click. Если нет —
    # считаем, что физический hit-test клик поглощён overlay (Angular
    # backdrop/snackbar), и уходим в elementFromPoint-fallback.
    _POINTER_CLICK_WAIT_TIMEOUT = 2.0

    def _mouse_click_element_from_point(self, page, x: float, y: float) -> None:
        """BBA-1 fallback: синтетический клик по элементу под (x, y).

        Обходит физический hit-test через ``document.elementFromPoint`` и
        диспатчит mousedown/mouseup/click напрямую на найденный элемент.
        Используется ТОЛЬКО когда page.mouse (реальный CDP-клик) не дал
        observe-события (overlay перехватил физический клик).
        """
        page.evaluate(_ELEMENT_FROM_POINT_JS, [float(x), float(y)])

    def _cmd_observe_start(self) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        if self._observe_active:
            return {"ok": True, "status": "already_active"}
        self._observed_events.clear()
        self._observe_active = True
        self._observe_last_event_id = 0
        try:
            # VP-L2: expose_binding нельзя снять и нельзя зарегистрировать повторно.
            # Регистрируем один раз на страницу; повторный start только чинит listener.
            # BBA-2/5: binding замыкается на ЭТОТ worker, а не на глобальный синглтон —
            # иначе per-session observe кладёт события в чужую очередь и «клик потерялся».
            worker = self
            if not self._binding_registered:
                def _click_binding(*args):
                    if args and isinstance(args[-1], dict) and args[-1].get("tag"):
                        _on_click(args[-1], worker)
                page.expose_binding("__pk_cdp_click__", _click_binding)
                self._binding_registered = True
            if not self._input_binding_registered:
                def _input_binding(*args):
                    if args and isinstance(args[-1], dict) and args[-1].get("tag"):
                        _on_input(args[-1], worker)
                page.expose_binding("__pk_cdp_input__", _input_binding)
                self._input_binding_registered = True
            page.evaluate("""
                if(!window.__pk_cdp_click_listener__){
                    window.__pk_cdp_click_listener__=true;
                    window.__pk_cdp_click_handler__=function(e){
                        const el=e.target;
                        const r=el.getBoundingClientRect();
                        window.__pk_cdp_click__({
                            tag:el.tagName.toLowerCase(),id:el.id||'',
                            classes:(el.className&&typeof el.className==='string')?el.className:'',
                            text:(el.textContent||'').trim(),name:el.getAttribute('name')||'',
                            placeholder:el.getAttribute('placeholder')||'',
                            type:el.getAttribute('type')||'',
                            dataTestId:el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'',
                            rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
                        });
                    };
                    document.addEventListener('click',window.__pk_cdp_click_handler__,true);
                }
                // BBA-3: input/change listener для Type-шагов (значение НЕ передаётся —
                // только таргет + классификация; plaintext никогда не идёт по мосту).
                if(!window.__pk_cdp_input_listener__){
                    window.__pk_cdp_input_listener__=true;
                    window.__pk_cdp_input_handler__=function(e){
                        const el=e.target;
                        const r=el.getBoundingClientRect();
                        window.__pk_cdp_input__({
                            tag:el.tagName.toLowerCase(),id:el.id||'',
                            classes:(el.className&&typeof el.className==='string')?el.className:'',
                            text:'',name:el.getAttribute('name')||'',
                            placeholder:el.getAttribute('placeholder')||'',
                            type:el.getAttribute('type')||'',
                            dataTestId:el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'',
                            rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
                        });
                    };
                    document.addEventListener('input',window.__pk_cdp_input_handler__,true);
                    document.addEventListener('change',window.__pk_cdp_input_handler__,true);
                }
            """)
            logger.info("browser_observe_start: injected")
            return {"ok": True, "status": "observing"}
        except Exception as e:
            self._observe_active = False
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _cmd_observe_stop(self) -> dict:
        self._observe_active = False
        count = len(self._observed_events)
        self._observed_events.clear()
        if self._page is not None:
            try:
                self._page.evaluate(
                    "if(window.__pk_cdp_click_handler__){"
                    "document.removeEventListener('click',window.__pk_cdp_click_handler__,true);"
                    "window.__pk_cdp_click_handler__=null;}"
                    "window.__pk_cdp_click_listener__=false;"
                    "if(window.__pk_cdp_input_handler__){"
                    "document.removeEventListener('input',window.__pk_cdp_input_handler__,true);"
                    "document.removeEventListener('change',window.__pk_cdp_input_handler__,true);"
                    "window.__pk_cdp_input_handler__=null;}"
                    "window.__pk_cdp_input_listener__=false;"
                )
            except Exception:
                pass
        logger.info("browser_observe_stop: %d discarded", count)
        return {"ok": True, "eventsDiscarded": count}

    def _cmd_observe_event(self) -> dict:
        if not self._observe_active:
            return {"ok": True, "connected": False, "observing": False}
        # BBA-5: liveness страницы считаем ОТДЕЛЬНО от отдачи события.
        # События в очереди — реальные, собранные до возможного отвала CDP;
        # их нужно отдать (enrich умеет page=None). А connected отражает
        # фактическое состояние страницы: жива ли она прямо сейчас.
        page = self._page
        connected = page is not None
        if page is not None:
            try:
                page.evaluate("1")
            except Exception:
                self._page = None
                page = None
                connected = False
        if self._observed_events:
            evt = self._observed_events.pop(0)
            self._enrich_event(evt)
            return {"ok": True, "connected": connected, "observing": True, "event": evt}
        return {"ok": True, "connected": connected, "observing": True, "event": None}

    def _cmd_observe_click(self, x: float, y: float) -> dict:
        if not self._observe_active:
            return {"ok": False, "error": "observe not active"}
        page = self._page
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            # BBA-1: каноничный pointer — page.mouse (→ CDP Input.dispatchMouseEvent,
            # реальный hit-test). elementFromPoint — строго fallback (см. ниже).
            used_fallback = False
            try:
                page.mouse.click(x, y)
            except Exception as exc:
                logger.warning(
                    "browser_observe_click: page.mouse.click failed (%s), "
                    "falling back to elementFromPoint",
                    type(exc).__name__,
                )
                used_fallback = True
                self._mouse_click_element_from_point(page, x, y)

            queued = self._await_click_event()
            # BBA-1 fallback: физический клик мог быть поглощён overlay —
            # observe-событие не пришло. Синтезируем клик напрямую по элементу.
            if not queued and not used_fallback:
                used_fallback = True
                self._mouse_click_element_from_point(page, x, y)
                queued = self._await_click_event()

            logger.info(
                "browser_observe_click at (%.1f,%.1f) queued=%s fallback=%s",
                x, y, queued, used_fallback,
            )
            return {
                "ok": True, "x": x, "y": y,
                "queued": queued, "fallback": used_fallback,
            }
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def _await_click_event(self) -> bool:
        """Дождаться observe-события после клика (краткий bounded-wait)."""
        deadline = time.time() + self._POINTER_CLICK_WAIT_TIMEOUT
        while time.time() < deadline:
            if self._observed_events:
                return True
            time.sleep(0.02)
        return bool(self._observed_events)

    def _cmd_context_ensure(self, context: str = "operator", url: str | None = None) -> dict:
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        if url and url != "about:blank":
            try:
                if page.url == "about:blank":
                    page.goto(url, timeout=8000, wait_until="domcontentloaded")
            except Exception as e:
                return {"ok": False, "error": f"{type(e).__name__}: {e}"}
        return {"ok": True, "context": context, "contextId": f"{self._browser_id}:{context}", "browserId": self._browser_id, "purpose": "authoring", "transport": "playwright"}

    def _cmd_context_destroy(self) -> dict:
        try:
            if self._page is not None:
                self._page.close()
                self._page = None
        except Exception:
            pass
        try:
            if self._browser is not None:
                self._browser.close()
                self._browser = None
        except Exception:
            pass
        try:
            if self._pw is not None:
                if hasattr(self._pw, 'close'):
                    self._pw.close()
                else:
                    self._pw.stop()
        except Exception:
            pass
        self._pw = None
        self._browser_id = None
        self._context = None
        logger.info("browser_service: destroyed")
        return {"ok": True}

    # ── event enrichment (on worker thread) ──

    def _enrich_event(self, evt: dict) -> None:
        element = evt.get("element", {})
        info = {
            "tag": element.get("tag", ""), "id": element.get("id", ""),
            "classes": element.get("classes", ""), "text": element.get("text", ""),
            "rect": element.get("rect", {"x": 0, "y": 0, "w": 0, "h": 0}),
            "name": element.get("name", ""), "placeholder": element.get("placeholder", ""),
            "type": element.get("type", ""), "dataTestId": element.get("dataTestId", ""),
        }
        # AX node
        page = self._page
        if page is not None:
            try:
                ax_node = _find_ax_node_for_element(page, info)
                if ax_node:
                    element["role"] = str(ax_node.get("role") or "").strip().lower()
                    element["accessibleName"] = str(ax_node.get("name") or "").strip()
            except Exception:
                pass
        # BBA-3: value classification из DOM-признаков, не из AX-ноды.
        # _classify_value ждёт tag/name_attr/accessible_name/type_attr —
        # AX-нода этими ключами не владеет, поэтому классификация всегда
        # давала 'unknown' и redaction держался только на фронте. Теперь
        # классифицируем по реальному DOM-таргету (type=password/email/tel,
        # name/label-паттерны секретов).
        try:
            from utils.discovery_element_extractor import _classify_value
            evt["valueClass"] = _classify_value({
                "tag": info.get("tag", ""),
                "name_attr": info.get("name", ""),
                "accessible_name": element.get("accessibleName", ""),
                "type_attr": info.get("type", ""),
            })
        except ImportError:
            evt["valueClass"] = "unknown"
        # candidates
        try:
            from utils.discovery_candidate_builder import build_candidates
            el = {
                "test_id": info.get("dataTestId", ""),
                "clean_id": info.get("id", "") if info.get("id") and not info.get("id", "").startswith(":") else "",
                "accessible_name": element.get("accessibleName", ""),
                "role": element.get("role", ""), "label_for": "",
                "placeholder": info.get("placeholder", ""),
                "name_attr": info.get("name", ""), "tag": info.get("tag", ""),
            }
            cands = build_candidates([el])
            evt["candidates"] = cands[0].get("candidates", []) if cands else _build_fallback_candidates(info)
        except Exception:
            evt["candidates"] = _build_fallback_candidates(info)
        # ambiguity
        evt["isAmbiguous"] = False
        cands = evt.get("candidates", [])
        if cands and not cands[0].get("unique") and cands[0].get("score", 0) < 0.7:
            evt["isAmbiguous"] = True


# ── fallback candidate builder (module-level, no thread affinity) ──

def _build_fallback_candidates(event_info: dict) -> list[dict]:
    tag = event_info.get("tag", "")
    text = (event_info.get("text") or "")[:40].strip()
    eid = event_info.get("id", "")
    cands = []
    if eid and not eid.startswith(":"):
        cands.append({"kind": "css", "value": f"#{eid}", "score": 0.8, "tier": "T1", "unique": True})
    if text and tag:
        cands.append({"kind": "text", "value": f"text={text}", "score": 0.65 if not eid else 0.5, "tier": "T2", "unique": len(text.split()) == 1})
    if tag:
        cands.append({"kind": "css", "value": tag, "score": 0.4, "tier": "T3", "unique": False})
    return cands


# ── AX-node finder (module-level, stateless) ──

def _find_ax_node_for_element(page, element_info: dict) -> dict | None:
    try:
        ax = page.accessibility.snapshot()
    except Exception:
        return None
    if ax is None:
        return None
    click_rect = element_info.get("rect", {})
    cx = click_rect.get("x", 0) + click_rect.get("w", 0) / 2
    cy = click_rect.get("y", 0) + click_rect.get("h", 0) / 2
    target_role = (element_info.get("tag") or "").lower()
    best = None
    best_score = -1.0

    def walk(node):
        nonlocal best, best_score
        if not isinstance(node, dict):
            return
        role = str(node.get("role") or "").strip().lower()
        if role and (role == target_role or (target_role in ("input", "textarea") and role in ("textbox", "searchbox"))):
            score = 1.0
            if best_score < score:
                best = node
                best_score = score
        for child in node.get("children") or []:
            if isinstance(child, dict):
                walk(child)

    walk(ax)
    return best if best_score > 0 else None


# ── expose_binding callback (module-level, invoked from JS in worker thread) ──

def _on_click(event_info: dict, worker: object | None = None) -> None:
    """BBA-2: записать click-событие в очередь КОНКРЕТНОГО worker'а.

    ``worker`` по умолчанию — глобальный синглтон (обратная совместимость).
    Per-session observe замыкает своего worker'а.
    """
    if worker is None:
        worker = _worker
    evt = {
        "timestamp": time.time(),
        "action": "click",
        "element": {
            "tag": event_info.get("tag", ""),
            "id": event_info.get("id", ""),
            "classes": event_info.get("classes", ""),
            "text": (event_info.get("text") or "")[:80],
            "rect": event_info.get("rect", {"x": 0, "y": 0, "w": 0, "h": 0}),
            "name": event_info.get("name", ""),
            "placeholder": event_info.get("placeholder", ""),
            "type": event_info.get("type", ""),
            "dataTestId": event_info.get("dataTestId", ""),
        },
    }
    worker._observe_last_event_id += 1
    evt["eventId"] = f"cdp-{worker._observe_last_event_id}"
    worker._observed_events.append(evt)


def _on_input(event_info: dict, worker: object | None = None) -> None:
    """BBA-3: записать type-событие. Значение НЕ передаётся (redaction)."""
    if worker is None:
        worker = _worker
    evt = {
        "timestamp": time.time(),
        "action": "type",
        "element": {
            "tag": event_info.get("tag", ""),
            "id": event_info.get("id", ""),
            "classes": event_info.get("classes", ""),
            "text": "",
            "rect": event_info.get("rect", {"x": 0, "y": 0, "w": 0, "h": 0}),
            "name": event_info.get("name", ""),
            "placeholder": event_info.get("placeholder", ""),
            "type": event_info.get("type", ""),
            "dataTestId": event_info.get("dataTestId", ""),
        },
    }
    worker._observe_last_event_id += 1
    evt["eventId"] = f"cdp-{worker._observe_last_event_id}"
    worker._observed_events.append(evt)


# ── Singleton worker (LEGACY — заменён на SessionManager) ──

_worker = _BrowserWorker()

# ── SOR-L1 / SOR-L2: Per-session BrowserWorker registry ──

class BrowserSessionManager:
    """SOR-L1 / SOR-L2: per-session BrowserWorker factory.

    Каждая сессия получает изолированный _BrowserWorker со своим page/context.
    Две параллельные сессии не смешивают кадры и CDP-таргеты.

    SOR-L2: каждая сессия может иметь свой CDP endpoint
    (выделенный headed Chromium per session).
    """

    _sessions: dict[str, _BrowserWorker] = {}
    _cdp_endpoints: dict[str, str] = {}  # SOR-L2: session_id → CDP endpoint URL
    _lock = threading.Lock()

    @classmethod
    def get(cls, session_id: str, cdp_endpoint: str | None = None) -> _BrowserWorker:
        """Получить (или создать) worker для session_id.

        SOR-L2: cdp_endpoint — опциональный URL CDP для этой сессии
        (http://host:port). Если задан — worker будет подключаться к нему
        вместо глобального PK_BROWSER_CDP_ENDPOINT.
        """
        if session_id not in cls._sessions:
            with cls._lock:
                if session_id not in cls._sessions:
                    worker = _BrowserWorker()
                    cls._sessions[session_id] = worker
        worker = cls._sessions[session_id]
        if cdp_endpoint:
            with cls._lock:
                cls._cdp_endpoints[session_id] = cdp_endpoint
            worker._cdp_endpoint_override = cdp_endpoint
        elif session_id in cls._cdp_endpoints:
            worker._cdp_endpoint_override = cls._cdp_endpoints[session_id]
        return worker

    @classmethod
    def get_cdp_endpoint(cls, session_id: str) -> str | None:
        """SOR-L2: получить CDP endpoint для сессии (None = use default)."""
        with cls._lock:
            return cls._cdp_endpoints.get(session_id)

    @classmethod
    def set_cdp_endpoint(cls, session_id: str, endpoint: str) -> None:
        """SOR-L2: назначить выделенный CDP endpoint сессии."""
        with cls._lock:
            cls._cdp_endpoints[session_id] = endpoint

    @classmethod
    def remove(cls, session_id: str) -> None:
        """Удалить сессию (вызывать при завершении)."""
        with cls._lock:
            worker = cls._sessions.pop(session_id, None)
            cls._cdp_endpoints.pop(session_id, None)
        if worker is not None and worker._page is not None:
            try:
                worker._context.close()
            except Exception:
                pass

    @classmethod
    def active_sessions(cls) -> list[str]:
        """Список активных session_id."""
        with cls._lock:
            return list(cls._sessions.keys())

    @classmethod
    def worker_for(cls, session_id: str | None) -> _BrowserWorker:
        """Получить worker для session_id, fallback на глобальный _worker."""
        if session_id:
            return cls.get(session_id)
        return _worker


# ── Public API (thread-safe: dispatches to worker thread, SOR-L1 session-aware) ──

def browser_status(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("status")

def browser_navigate(url: str, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("navigate", url=url)

def browser_screenshot(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("screenshot")

def browser_back(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("back")

def browser_forward(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("forward")

def browser_click(selector: str, strategy: str = "css", session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("click", selector=selector, strategy=strategy)

def browser_type_text(selector: str, text: str, strategy: str = "css", session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("type_text", selector=selector, text=text, strategy=strategy)

def browser_highlight(selector: str, strategy: str = "css", session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("highlight", selector=selector, strategy=strategy)

def browser_eval(expression: str, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("eval", expression=expression)

def browser_viewport(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("viewport")

def browser_keyboard_press(key: str, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("keyboard_press", key=key)

def browser_mouse_wheel(dx: float = 0.0, dy: float = 0.0, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("mouse_wheel", dx=dx, dy=dy)

def browser_mouse_drag(x1: float, y1: float, x2: float, y2: float, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("mouse_drag", x1=x1, y1=y1, x2=x2, y2=y2)

def browser_observe_start(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("observe_start")

def browser_observe_stop(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("observe_stop")

def browser_observe_event(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("observe_event")

def browser_observe_click(x: float, y: float, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("observe_click", x=x, y=y)

def browser_context_ensure(context: str = "operator", url: str | None = None, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("context_ensure", context=context, url=url)

def browser_context_destroy(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("context_destroy")