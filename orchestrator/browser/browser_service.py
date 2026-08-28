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
        # WIRE-SYNC-L1: CDP screencast — live JPEG stream
        self._screencast_active = False
        self._last_frame: str | None = None
        self._cdp_session: object | None = None

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

        cdp_endpoint = os.environ.get("PK_BROWSER_CDP_ENDPOINT")
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
            runtime = PlaywrightBrowserRuntime()
            self._page = runtime.connect_over_cdp(cdp_endpoint)
            self._browser = runtime.browser
            self._pw = runtime
            self._browser_id = f"container-{uuid.uuid4().hex[:12]}"
            self._last_cdp_error = None
            self._binding_registered = False  # новая страница — binding нужно регистрировать заново
            self._start_screencast()
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

    # ── WIRE-SYNC-L1: CDP screencast (live JPEG stream 10+ fps) ──

    def _start_screencast(self) -> None:
        """Start Page.startScreencast on the CDP session.
        Called from _ensure_browser() after browser is launched/connected.
        """
        if self._screencast_active or self._page is None:
            return
        try:
            ctx = self._page.context if hasattr(self._page, 'context') else None
            if ctx is None:
                ctx = getattr(self._page, '_context', None)
            if ctx is None and self._context is not None:
                ctx = self._context
            if ctx is None:
                return
            self._cdp_session = ctx.new_cdp_session(self._page)
            # Subscribe before starting the stream so the first frame cannot be lost.
            def _on_frame(params: dict) -> None:
                data = params.get("data", "")
                if data:
                    self._last_frame = data
                try:
                    self._cdp_session.send("Page.screencastFrameAck", {"sessionId": params.get("sessionId", 0)})
                except Exception:
                    pass

            self._cdp_session.on("Page.screencastFrame", _on_frame)
            self._cdp_session.send("Page.startScreencast", {
                "format": "jpeg",
                "quality": 80,
                "maxWidth": 1280,
                "maxHeight": 800,
                "everyNthFrame": 1,
            })
            self._screencast_active = True
            logger.info("browser_service: CDP screencast started (JPEG 1280x800 q=80)")
        except Exception as e:
            logger.warning("browser_service: screencast start failed: %s", e)

    def _cmd_screencast_frame(self) -> dict:
        """Return the most recent JPEG frame from CDP screencast."""
        if not self._screencast_active or self._page is None:
            return {"ok": False, "error": "screencast not active"}
        if self._last_frame is None:
            return {"ok": True, "frame": None, "waiting": True}
        return {"ok": True, "frame": self._last_frame, "format": "jpeg"}

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

    # ── observe ──

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
            if not self._binding_registered:
                page.expose_binding("__pk_cdp_click__", _binding_handler)
                self._binding_registered = True
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
                )
            except Exception:
                pass
        logger.info("browser_observe_stop: %d discarded", count)
        return {"ok": True, "eventsDiscarded": count}

    def _cmd_observe_event(self) -> dict:
        if not self._observe_active:
            return {"ok": True, "connected": False, "observing": False}
        if self._observed_events:
            evt = self._observed_events.pop(0)
            self._enrich_event(evt)
            return {"ok": True, "connected": True, "observing": True, "event": evt}
        return {"ok": True, "connected": True, "observing": True, "event": None}

    def _cmd_observe_click(self, x: float, y: float) -> dict:
        if not self._observe_active:
            return {"ok": False, "error": "observe not active"}
        page = self._page
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            # VP-L2 hit-test fix: page.mouse.click(x,y) полагается на физический
            # hit-test браузера и уязвим к Angular Material backdrop/snackbar overlay.
            # Между mousedown и mouseup Angular показывает snackbar с
            # div.cdk-overlay-backdrop, поэтому mousedown ложится на кнопку, а
            # mouseup уже на backdrop → браузер не формирует click на кнопке
            # (down и up на разных узлах), а observe ловит backdrop.
            #
            # Фиксируем DOM-элемент под координатами ДО клика через
            # document.elementFromPoint и диспатчим mousedown/mouseup/click на
            # него напрямую — обходит физический hit-test и гонку появления overlay.
            page.evaluate(
                """
                (x, y) => {
                    const el = document.elementFromPoint(x, y);
                    if (!el) return false;
                    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
                    const mk = (type, button, buttons) => new MouseEvent(type, {
                        ...opts, clientX: x, clientY: y, button, buttons
                    });
                    el.dispatchEvent(mk('mousedown', 0, 1));
                    el.dispatchEvent(mk('mouseup', 0, 0));
                    el.dispatchEvent(mk('click', 0, 0));
                    return true;
                }
                """,
                float(x),
                float(y),
            )
            logger.info("browser_observe_click at (%.1f,%.1f)", x, y)
            deadline = time.time() + 2.0
            while time.time() < deadline:
                if self._observed_events:
                    break
                time.sleep(0.02)
            return {"ok": True, "x": x, "y": y, "queued": bool(self._observed_events)}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

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
                    try:
                        from utils.discovery_element_extractor import _classify_value
                        evt["valueClass"] = _classify_value(ax_node)
                    except ImportError:
                        pass
            except Exception:
                pass
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

def _on_click(event_info: dict) -> None:
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
    _worker._observe_last_event_id += 1
    evt["eventId"] = f"cdp-{_worker._observe_last_event_id}"
    _worker._observed_events.append(evt)


def _binding_handler(*args) -> None:
    if not args:
        return
    info = args[-1]
    if isinstance(info, dict) and info.get("tag"):
        _on_click(info)


# ── Singleton worker ──

_worker = _BrowserWorker()


# ── Public API (thread-safe: dispatches to worker thread) ──

def browser_status() -> dict:
    return _worker.dispatch("status")

def browser_navigate(url: str) -> dict:
    return _worker.dispatch("navigate", url=url)

def browser_screenshot() -> dict:
    return _worker.dispatch("screenshot")

def browser_screencast_frame() -> dict:
    return _worker.dispatch("screencast_frame")

def browser_back() -> dict:
    return _worker.dispatch("back")

def browser_forward() -> dict:
    return _worker.dispatch("forward")

def browser_click(selector: str, strategy: str = "css") -> dict:
    return _worker.dispatch("click", selector=selector, strategy=strategy)

def browser_type_text(selector: str, text: str, strategy: str = "css") -> dict:
    return _worker.dispatch("type_text", selector=selector, text=text, strategy=strategy)

def browser_highlight(selector: str, strategy: str = "css") -> dict:
    return _worker.dispatch("highlight", selector=selector, strategy=strategy)

def browser_eval(expression: str) -> dict:
    return _worker.dispatch("eval", expression=expression)

def browser_observe_start() -> dict:
    return _worker.dispatch("observe_start")

def browser_observe_stop() -> dict:
    return _worker.dispatch("observe_stop")

def browser_observe_event() -> dict:
    return _worker.dispatch("observe_event")

def browser_observe_click(x: float, y: float) -> dict:
    return _worker.dispatch("observe_click", x=x, y=y)

def browser_context_ensure(context: str = "operator", url: str | None = None) -> dict:
    return _worker.dispatch("context_ensure", context=context, url=url)

def browser_context_destroy() -> dict:
    return _worker.dispatch("context_destroy")