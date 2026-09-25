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

# BBA-EXEC-3: персист replay-артефактов (скриншоты + timeline). Лёгкий модуль
# без зависимостей — импорт на верхнем уровне безопасен (нет циклических связей).
from browser.replay_store import get_store

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

# BBA-7: снимок кликабельных элементов активной страницы (single source of
# selectors). Возвращает список {tag, role, text, selector, bbox} — контракт
# CandidateElement для frontend overlay (BBA-FE-4). selector идемпотентен:
# тот же локальный CSS, что принимает _resolve_step_locator (стратегия css по
# умолчанию) → клик по рамке = тот же элемент в step/execute.
# bbox = {x, y, width, height} в CSS-пикселях вьюпорта.
_ELEMENTS_SNAPSHOT_JS = """
(function(){
  function attrValue(v){ return String(v).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"'); }
  function unique(sel){ try { return document.querySelectorAll(sel).length === 1; } catch(e){ return false; } }
  function cssPath(el){
    var esc = (window.CSS && CSS.escape) ? CSS.escape : function(v){ return v; };
    if(el.id){
      var s = '#' + esc(el.id);
      if(unique(s)) return s;
    }
    var tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if(tid){
      var s2 = '[data-testid="' + attrValue(tid) + '"]';
      if(unique(s2)) return s2;
    }
    var parts = [];
    var node = el;
    while(node && node.nodeType === 1 && node.tagName && node.tagName.toLowerCase() !== 'body'){
      var tag = node.tagName.toLowerCase();
      var sel = tag;
      var par = node.parentElement;
      if(par){
        var sibs = Array.prototype.slice.call(par.children).filter(function(c){ return c.tagName.toLowerCase() === tag; });
        if(sibs.length > 1){
          sel += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
        }
      }
      parts.unshift(sel);
      var full = parts.join(' > ');
      if(unique(full)) return full;
      node = par;
    }
    return parts.length ? parts.join(' > ') : el.tagName.toLowerCase();
  }
  function roleOf(tag, el){
    var r = el.getAttribute('role');
    if(r) return r.trim().toLowerCase();
    if(tag === 'button') return 'button';
    if(tag === 'a') return 'link';
    if(tag === 'input'){
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      return (t === 'checkbox' || t === 'radio') ? t : 'textbox';
    }
    if(tag === 'textarea') return 'textbox';
    if(tag === 'select') return 'combobox';
    if(tag === 'summary') return 'button';
    if(el.hasAttribute('contenteditable')) return 'textbox';
    return '';
  }
  function textOf(el){
    var raw = el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
              el.getAttribute('title') || el.getAttribute('name') ||
              (el.value !== undefined ? el.value : '') ||
              (el.innerText || el.textContent || '');
    var t = String(raw == null ? '' : raw).trim();
    return t.length > 60 ? t.slice(0, 60) : t;
  }
  var sels = 'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[role="radio"],[contenteditable="true"],summary';
  var nodes = document.querySelectorAll(sels);
  var out = [];
  var seen = {};
  for(var i = 0; i < nodes.length; i++){
    var el = nodes[i];
    var r = el.getBoundingClientRect();
    if(r.width < 4 || r.height < 4) continue;
    var cs = window.getComputedStyle(el);
    if(!cs || cs.display === 'none' || cs.visibility === 'hidden') continue;
    var tag = el.tagName.toLowerCase();
    var css = cssPath(el);
    if(!css || seen[css]) continue;
    seen[css] = true;
    out.push({
      tag: tag,
      role: roleOf(tag, el),
      text: textOf(el),
      selector: css,
      bbox: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    });
    if(out.length >= 300) break;
  }
  return out;
})()
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
        # ACT-BE: bиндинги длинных действий (wheel/scroll/drag/hover/key/focus).
        self._extended_bindings_registered = False
        # BBA-EXEC-2: флаг отмены активного replay (выставляется извне worker-потока).
        self._abort_requested = False
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
                self._extended_bindings_registered = False
            runtime = PlaywrightBrowserRuntime()
            self._page = runtime.connect_over_cdp(cdp_endpoint)
            self._browser = runtime.browser
            self._pw = runtime
            self._browser_id = f"container-{uuid.uuid4().hex[:12]}"
            self._last_cdp_error = None
            self._binding_registered = False  # новая страница — binding нужно регистрировать заново
            self._input_binding_registered = False
            self._extended_bindings_registered = False
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
            if self._observe_active:
                # BROWSER-STUDIO-SCROLL: документ заменён — observer-листенеры
                # переживают навигацию только через повторную инъекцию.
                self._cmd_observe_start()
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

    def _cmd_elements_snapshot(self) -> dict:
        """BBA-7: снять список кликабельных элементов активной страницы.

        Возвращает ``{ok, elements, count}``; каждый элемент — контракт
        ``CandidateElement``: ``{tag, role, text, selector, bbox}``, где
        ``bbox = {x, y, width, height}`` в CSS-пикселях вьюпорта, а ``selector`` —
        идемпотентный CSS, совместимый с ``_resolve_step_locator`` (стратегия
        ``css`` по умолчанию). Наследует существующий observe-контракт рядом,
        ничего не переписывая.
        """
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            raw = page.evaluate(_ELEMENTS_SNAPSHOT_JS)
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}
        elements = raw if isinstance(raw, list) else []
        return {"ok": True, "elements": elements, "count": len(elements)}

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

    # VIEWFIT-BE: границы смены вьюпорта. Ниже 320px UI не юзабелен, выше
    # 3840px — за пределами смысла холста оператора; всё, что вне, клампится.
    _VIEWPORT_MIN_PX = 320
    _VIEWPORT_MAX_PX = 3840

    def _cmd_viewport_set(self, width: int = 0, height: int = 0) -> dict:
        """VIEWFIT-BE: сменить размер вьюпорта авторинг-браузера.

        Та же Playwright-page, что и click-маппинг (``page.mouse``), поэтому
        после смены размеров координатные клики фронта продолжают попадать
        без смещения. Возвращает ``{ok, viewportWidth, viewportHeight, clamped}``
        с фактическими (после клампа к [320, 3840]) размерами.

        Дополнительно шлём best-effort ``page.screenshot()``: resize сам по
        себе не будит композитор на статичной странице (спайк VIEWFIT-BE), а
        screenshot без сайд-эффектов гарантирует relay свежий screencast-кадр
        нового размера.
        """
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        if isinstance(width, bool) or isinstance(height, bool):
            return {"ok": False, "error": "width and height must be integers"}
        try:
            w = int(width)
            h = int(height)
        except (TypeError, ValueError):
            return {"ok": False, "error": "width and height must be integers"}
        if w <= 0 or h <= 0:
            return {"ok": False, "error": "width and height must be positive"}
        clamped_w = min(max(w, self._VIEWPORT_MIN_PX), self._VIEWPORT_MAX_PX)
        clamped_h = min(max(h, self._VIEWPORT_MIN_PX), self._VIEWPORT_MAX_PX)
        try:
            page.set_viewport_size({"width": clamped_w, "height": clamped_h})
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}
        try:
            page.screenshot()
        except Exception:
            logger.debug("browser_service: viewport change nudge screenshot failed", exc_info=True)
        return {
            "ok": True,
            "viewportWidth": clamped_w,
            "viewportHeight": clamped_h,
            "clamped": clamped_w != w or clamped_h != h,
        }

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

    @staticmethod
    def _wheel_page(page, dx: float, dy: float,
                    x: float | None = None, y: float | None = None) -> None:
        """BROWSER-STUDIO-SCROLL: wheel с активацией вкладки (Xvfb quirk).

        На НЕактивной вкладке wheel-событие доставляется в DOM, но compositor
        не применяет scroll-offset (``scrollTop``/``scrollY`` стоят). После
        ``page.bring_to_front()`` тот же ``page.mouse.wheel`` даёт реальный
        скролл. Координаты ``x``/``y`` (опционально) — куда сначала навести мышь.
        """
        if x is not None and y is not None:
            page.mouse.move(float(x), float(y))
        try:
            page.bring_to_front()
        except Exception:
            pass  # не критично: без активации quirk может не примениться
        page.mouse.wheel(float(dx), float(dy))

    def _cmd_mouse_wheel(self, dx: float = 0.0, dy: float = 0.0,
                         x: float | None = None, y: float | None = None) -> dict:
        """BBA-3 + BROWSER-STUDIO-SCROLL: колесо мыши с реальным scroll-offset."""
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            self._wheel_page(page, dx, dy, x, y)
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

    def _cmd_mouse_click(self, x: float, y: float) -> dict:
        """BBA-FE-1: координатный клик для режима author.

        В отличие от ``_cmd_observe_click`` не требует observe/start и не
        кладёт событие в observe-очередь — это «просто клик» по странице
        (реальный CDP-клик через page.mouse), чтобы оператор мог нажимать
        кнопки/ссылки без включённой записи.
        """
        page = self._ensure_browser()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            page.mouse.click(float(x), float(y))
            return {"ok": True, "x": x, "y": y}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    # ── BBA-EXEC-1: step execute / scenario replay ──

    _SUPPORTED_STEP_ACTIONS = {
        "click", "fill", "type", "goto", "navigate",
        "wait_for", "select_option", "press_key", "hover", "scroll",
        # ACT-BE: недостающие snake-действия (observe-слой маппится на них FE-слоем).
        "wheel", "drag", "focus",
    }

    @staticmethod
    def _resolve_step_locator(page, target: str, strategy: str):
        """Построить Playwright locator по стратегии (не вызывает методов)."""
        strategy = (strategy or "css").lower()
        if strategy == "role":
            return page.get_by_role(target)
        if strategy == "text":
            return page.get_by_text(target, exact=True)
        if strategy == "xpath":
            return page.locator(f"xpath={target}")
        if strategy == "id":
            return page.locator(f"#{target}")
        # BBA-EXEC-2: паритет стратегий из frontend scenarioStepModel.ts.
        if strategy in ("test_id", "testid"):
            return page.get_by_test_id(target)
        if strategy == "label":
            return page.get_by_label(target)
        if strategy == "placeholder":
            return page.get_by_placeholder(target)
        if strategy == "alt":
            return page.get_by_alt_text(target)
        if strategy == "title":
            return page.get_by_title(target)
        return page.locator(target)  # css (default)

    def _cmd_step_execute(self, step: dict) -> dict:
        """BBA-EXEC-1: выполнить единичный структурированный шаг сценария.

        Вход: ``{action, target, value, strategy, timeout_ms, step_id?}``.
        Выход: ``{step_id, action, status, duration_ms, error, screenshot_b64}``.

        Fail-closed: любая ошибка (элемент не найден, таймаут, неверный action)
        возвращает ``status: "failed"`` с текстом ошибки — воркер не крашится.
        """
        started = time.time()
        action = str(step.get("action") or "").strip().lower()
        target = str(step.get("target") or "")
        value = step.get("value")
        strategy = str(step.get("strategy") or "css").strip().lower()
        try:
            timeout_ms = int(step.get("timeout_ms") or 5000)
        except (TypeError, ValueError):
            timeout_ms = 5000
        step_id = str(step.get("step_id") or "") or f"step-{uuid.uuid4().hex[:8]}"

        def _ok(status: str, error: str | None = None, screenshot_b64: str | None = None) -> dict:
            return {
                "step_id": step_id,
                "action": action,
                "status": status,
                "duration_ms": int((time.time() - started) * 1000),
                "error": error,
                "screenshot_b64": screenshot_b64,
            }

        if action not in self._SUPPORTED_STEP_ACTIONS:
            return _ok("failed", f"unsupported action: {action!r}")

        page = self._ensure_browser()
        if page is None:
            return _ok("failed", "browser not available")

        try:
            if action in ("goto", "navigate"):
                if not target:
                    return _ok("failed", "target (url) required for goto")
                page.goto(target, timeout=timeout_ms, wait_until="domcontentloaded")
                return _ok("passed")

            if action == "wait_for":
                # target может быть ms-числом (пауза) или селектором (ожидание появления).
                if not target:
                    return _ok("failed", "target required for wait_for")
                if target.isdigit():
                    page.wait_for_timeout(int(target))
                else:
                    page.wait_for_selector(target, timeout=timeout_ms)
                return _ok("passed")

            if action == "press_key":
                if not target:
                    return _ok("failed", "target (key) required for press_key")
                page.keyboard.press(target)
                return _ok("passed")

            if action == "scroll":
                # value "dx,dy" → wheel; иначе scrollIntoView по target.
                if value is not None and str(value).strip():
                    try:
                        dx, dy = (float(x) for x in str(value).split(","))
                    except (TypeError, ValueError):
                        return _ok("failed", f"scroll value must be 'dx,dy', got {value!r}")
                    self._wheel_page(page, dx, dy)
                elif target:
                    self._resolve_step_locator(page, target, strategy).scroll_into_view_if_needed(timeout=timeout_ms)
                else:
                    self._wheel_page(page, 0.0, -600.0)
                return _ok("passed")

            # ACT-BE: wheel — value "dx,dy" → mouse.wheel (deltaX/deltaY).
            if action == "wheel":
                if value is None or not str(value).strip():
                    return _ok("failed", "value 'dx,dy' required for wheel")
                try:
                    dx, dy = (float(x) for x in str(value).split(","))
                except (TypeError, ValueError):
                    return _ok("failed", f"wheel value must be 'dx,dy', got {value!r}")
                self._wheel_page(page, dx, dy)
                return _ok("passed")

            # ACT-BE: drag — value "x1,y1,x2,y2" → mouse.move/down/move/up.
            if action == "drag":
                if value is None or not str(value).strip():
                    return _ok("failed", "value 'x1,y1,x2,y2' required for drag")
                try:
                    x1, y1, x2, y2 = (float(x) for x in str(value).split(","))
                except (TypeError, ValueError):
                    return _ok("failed", f"drag value must be 'x1,y1,x2,y2', got {value!r}")
                page.mouse.move(x1, y1)
                page.mouse.down()
                page.mouse.move(x2, y2, steps=5)
                page.mouse.up()
                return _ok("passed")

            # Остальные — требуют target (локатор).
            if not target:
                return _ok("failed", f"target required for {action}")
            locator = self._resolve_step_locator(page, target, strategy)

            if action == "click":
                locator.click(timeout=timeout_ms)
            elif action in ("fill", "type"):
                locator.fill("" if value is None else str(value), timeout=timeout_ms)
            elif action == "select_option":
                if value is None:
                    return _ok("failed", "value required for select_option")
                locator.select_option(str(value), timeout=timeout_ms)
            elif action == "hover":
                locator.hover(timeout=timeout_ms)
            elif action == "focus":
                locator.focus(timeout=timeout_ms)
            else:
                return _ok("failed", f"unsupported action: {action!r}")
            return _ok("passed")
        except Exception as e:
            # Fail-closed: скриншот для диагностики (если страница жива).
            shot = None
            try:
                shot = base64.b64encode(page.screenshot(type="png", full_page=False)).decode("utf-8")
            except Exception:
                shot = None
            return _ok("failed", f"{type(e).__name__}: {e}", screenshot_b64=shot)

    def _cmd_scenario_replay(self, steps: list, stop_on_failure: bool = True) -> dict:
        """BBA-EXEC-1/2/3: пакетное выполнение шагов с агрегацией, отменой и
        персистом артефактов (скриншоты + ``replay_timeline.json``).

        BBA-EXEC-2: перед каждым шагом проверяет ``self._abort_requested``
        (выставляется извне worker-потока). При флаге текущий шаг помечается
        ``status: "cancelled"``, флаг сбрасывается, вердикт — ``cancelled``.

        BBA-EXEC-3: шаговые ``screenshot_b64`` сохраняются в PNG-файлы через
        ReplayStore; timeline пишется в ``replay_timeline.json``. В ответе
        ``screenshot_b64`` заменяется на относительный ``screenshot``-путь,
        добавляются ``replay_id`` и ``timeline_path``.
        """
        started = time.time()
        results: list[dict] = []
        cancelled = False
        for step in steps or []:
            if self._abort_requested:
                self._abort_requested = False
                cancelled = True
                results.append({
                    "step_id": str(step.get("step_id") or "aborted"),
                    "action": str(step.get("action") or ""),
                    "status": "cancelled",
                    "duration_ms": int((time.time() - started) * 1000),
                    "error": "aborted by operator",
                    "screenshot_b64": None,
                })
                break
            r = self._cmd_step_execute(step)
            results.append(r)
            if stop_on_failure and r.get("status") == "failed":
                break
        passed = sum(1 for r in results if r.get("status") == "passed")
        failed = sum(1 for r in results if r.get("status") == "failed")
        cancelled_n = sum(1 for r in results if r.get("status") == "cancelled")
        if cancelled or cancelled_n:
            verdict = "cancelled"
        else:
            verdict = "passed" if failed == 0 else "failed"

        # ── BBA-EXEC-3: персист артефактов ──
        store = get_store()
        replay_id = store.new_replay_id()
        timeline_steps: list[dict] = []
        screenshots_saved = 0
        for i, r in enumerate(results):
            entry = {
                "index": i,
                "step_id": r.get("step_id"),
                "action": r.get("action"),
                "status": r.get("status"),
                "duration_ms": r.get("duration_ms"),
                "error": r.get("error"),
                "screenshot": None,
            }
            b64 = r.get("screenshot_b64")
            if b64:
                try:
                    png = base64.b64decode(b64)
                    fname = f"step_{i}_{entry['step_id']}.png"
                    entry["screenshot"] = store.save_screenshot(replay_id, fname, png)
                    screenshots_saved += 1
                except Exception as e:
                    logger.warning("scenario_replay: screenshot persist failed: %s", e)
            r.pop("screenshot_b64", None)
            r["screenshot"] = entry["screenshot"]
            timeline_steps.append(entry)

        duration_ms = int((time.time() - started) * 1000)
        timeline = {
            "replay_id": replay_id,
            "started_at": int(started * 1000),
            "verdict": verdict,
            "total": len(steps or []),
            "executed": len(results),
            "passed": passed,
            "failed": failed,
            "cancelled": cancelled_n,
            "duration_ms": duration_ms,
            "screenshots": screenshots_saved,
            "steps": timeline_steps,
        }
        timeline_path = None
        try:
            timeline_path = store.save_timeline(replay_id, timeline)
        except Exception as e:
            logger.exception("scenario_replay: timeline persist failed: %s", e)

        return {
            "ok": True,
            "replay_id": replay_id,
            "timeline_path": timeline_path,
            "steps": results,
            "timeline": timeline,
            "total": len(steps or []),
            "executed": len(results),
            "passed": passed,
            "failed": failed,
            "cancelled": cancelled_n,
            "verdict": verdict,
            "duration_ms": duration_ms,
        }

    def _cmd_scenario_abort(self) -> dict:
        """BBA-EXEC-2: запросить отмену активного replay (command handler).

        Примечание: replay исполняется на worker-потоке, поэтому диспатч этого
        handler'а реально сработает ТОЛЬКО между сценариями. Для отмены «на
        ходу» публичный API ``browser_scenario_abort`` выставляет
        ``self._abort_requested`` напрямую (минуя очередь).
        """
        self._abort_requested = True
        return {"ok": True, "abort_requested": True}

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
        # BROWSER-STUDIO-SCROLL: повторный start не только «уже активен» — он
        # безусловно до-инжектит observer-листенеры. Это самолечение после
        # навигации: новый документ теряет листенеры, а флаг активной observe
        # остаётся; инъекция по guard'ам хендлеров навешивает их заново.
        already_active = self._observe_active
        if not already_active:
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
            # ACT-BE: биндинги длинных действий. Регистрируем одним флагом — каждое
            # имя expose_binding можно повесить на страницу только один раз.
            if not self._extended_bindings_registered:
                def _wheel_binding(*args):
                    if args and isinstance(args[-1], dict):
                        _on_wheel(args[-1], worker)
                page.expose_binding("__pk_cdp_wheel__", _wheel_binding)

                def _scroll_binding(*args):
                    if args and isinstance(args[-1], dict):
                        _on_scroll(args[-1], worker)
                page.expose_binding("__pk_cdp_scroll__", _scroll_binding)

                def _drag_binding(*args):
                    if args and isinstance(args[-1], dict):
                        _on_drag(args[-1], worker)
                page.expose_binding("__pk_cdp_drag__", _drag_binding)

                def _hover_binding(*args):
                    if args and isinstance(args[-1], dict):
                        _on_hover(args[-1], worker)
                page.expose_binding("__pk_cdp_hover__", _hover_binding)

                def _key_binding(*args):
                    if args and isinstance(args[-1], dict):
                        _on_key(args[-1], worker)
                page.expose_binding("__pk_cdp_key__", _key_binding)

                def _focus_binding(*args):
                    if args and isinstance(args[-1], dict):
                        _on_focus(args[-1], worker)
                page.expose_binding("__pk_cdp_focus__", _focus_binding)
                self._extended_bindings_registered = True
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
                // BBA-3/TYPE-BE: input/change listener для Type/Select-шагов. Сырое значение
                // (el.value) пересекает мост ТОЛЬКО затем, чтобы backend мог его
                // классифицировать и немедленно отредактировать ($value / $secret).
                // plaintext НЕ хранится ни в событии, ни в wire, ни в логах — redaction
                // выполняется в _on_input/_enrich_event на стороне backend'а.
                if(!window.__pk_cdp_input_listener__){
                    window.__pk_cdp_input_listener__=true;
                    window.__pk_cdp_input_handler__=function(e){
                        const el=e.target;
                        const r=el.getBoundingClientRect();
                        let v='';
                        try{ v=(el.value===undefined||el.value===null)?'':String(el.value); }catch(err){ v=''; }
                        window.__pk_cdp_input__({
                            tag:el.tagName.toLowerCase(),id:el.id||'',
                            classes:(el.className&&typeof el.className==='string')?el.className:'',
                            text:'',value:v,name:el.getAttribute('name')||'',
                            placeholder:el.getAttribute('placeholder')||'',
                            type:el.getAttribute('type')||'',
                            ariaLabel:el.getAttribute('aria-label')||'',
                            dataTestId:el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'',
                            rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
                        });
                    };
                    document.addEventListener('input',window.__pk_cdp_input_handler__,true);
                    document.addEventListener('change',window.__pk_cdp_input_handler__,true);
                }
                // ACT-BE: wheel (колесо мыши) → deltaX/deltaY.
                if(!window.__pk_cdp_wheel_handler__){
                    window.__pk_cdp_wheel_handler__=function(e){
                        const el=e.target;
                        const r=el.getBoundingClientRect();
                        window.__pk_cdp_wheel__({
                            tag:el.tagName.toLowerCase(),id:el.id||'',
                            classes:(el.className&&typeof el.className==='string')?el.className:'',
                            text:'',name:el.getAttribute('name')||'',
                            placeholder:el.getAttribute('placeholder')||'',
                            type:el.getAttribute('type')||'',
                            dataTestId:el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'',
                            rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
                            delta:{dx:Math.round(e.deltaX),dy:Math.round(e.deltaY)}
                        });
                    };
                    document.addEventListener('wheel',window.__pk_cdp_wheel_handler__,{capture:true,passive:true});
                    window.__pk_cdp_wheel_listener__=true;
                }
                // ACT-BE: scroll (прокрутка) → deltaX/deltaY от предыдущей позиции.
                if(!window.__pk_cdp_scroll_handler__){
                    const __scrollPrev={left:0,top:0,has:false};
                    let __scrollTimer=null;
                    window.__pk_cdp_scroll_handler__=function(e){
                        if(__scrollTimer) return;
                        __scrollTimer=setTimeout(function(){
                            __scrollTimer=null;
                            const se=document.scrollingElement||document.documentElement;
                            let el=e.target;
                            if(el===document||el===document.documentElement||el===document.body) el=se;
                            const r=el&&el.getBoundingClientRect?el.getBoundingClientRect():{x:0,y:0,width:0,height:0};
                            const cx=(el&&el.scrollLeft!==undefined)?el.scrollLeft:(se?se.scrollLeft:0);
                            const cy=(el&&el.scrollTop!==undefined)?el.scrollTop:(se?se.scrollTop:0);
                            const dx=__scrollPrev.has?(cx-__scrollPrev.left):0;
                            const dy=__scrollPrev.has?(cy-__scrollPrev.top):0;
                            __scrollPrev.left=cx;__scrollPrev.top=cy;__scrollPrev.has=true;
                            window.__pk_cdp_scroll__({
                                tag:(el===se)?'body':(el&&el.tagName?el.tagName.toLowerCase():''),
                                id:el&&el.id?el.id:'',
                                classes:(el&&el.className&&typeof el.className==='string')?el.className:'',
                                text:'',name:el&&el.getAttribute?el.getAttribute('name')||'':'',
                                placeholder:el&&el.getAttribute?el.getAttribute('placeholder')||'':'',
                                type:el&&el.getAttribute?el.getAttribute('type')||'':'',
                                dataTestId:(el&&el.getAttribute)?(el.getAttribute('data-testid')||el.getAttribute('data-test-id')||''):'',
                                rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
                                delta:{dx:Math.round(dx),dy:Math.round(dy)}
                            });
                        },150);
                    };
                    document.addEventListener('scroll',window.__pk_cdp_scroll_handler__,{capture:true,passive:true});
                    window.__pk_cdp_scroll_listener__=true;
                }
                // ACT-BE: drag&drop → start/end coords (по mouseup при значимом сдвиге).
                if(!window.__pk_cdp_drag_handler__){
                    const __drag={active:false,startX:0,startY:0,el:null};
                    window.__pk_cdp_drag_handler__=function(e){
                        __drag.active=true;__drag.startX=e.clientX;__drag.startY=e.clientY;__drag.el=e.target;
                    };
                    window.__pk_cdp_drag_end_handler__=function(e){
                        if(!__drag.active){return;}
                        __drag.active=false;
                        const el=__drag.el;
                        if(!el||el.nodeType!==1){return;}
                        const dx=e.clientX-__drag.startX,dy=e.clientY-__drag.startY;
                        if(Math.abs(dx)<4&&Math.abs(dy)<4){return;}// не drag, обычный клик
                        const r=el.getBoundingClientRect();
                        window.__pk_cdp_drag__({
                            tag:el.tagName.toLowerCase(),id:el.id||'',
                            classes:(el.className&&typeof el.className==='string')?el.className:'',
                            text:'',name:el.getAttribute('name')||'',
                            placeholder:el.getAttribute('placeholder')||'',
                            type:el.getAttribute('type')||'',
                            dataTestId:el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'',
                            rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
                            coords:{startX:Math.round(__drag.startX),startY:Math.round(__drag.startY),endX:Math.round(e.clientX),endY:Math.round(e.clientY)}
                        });
                    };
                    document.addEventListener('mousedown',window.__pk_cdp_drag_handler__,true);
                    document.addEventListener('mouseup',window.__pk_cdp_drag_end_handler__,true);
                    window.__pk_cdp_drag_listener__=true;
                }
                // ACT-BE: hover (mouseenter по кликабельным, с дебаунсом).
                if(!window.__pk_cdp_hover_handler__){
                    let __hoverTimer=null,__hoverLast=null;
                    window.__pk_cdp_hover_handler__=function(e){
                        const el=e.target;
                        if(!el||el.nodeType!==1){return;}
                        const t=el.tagName.toLowerCase();
                        const interactive=(t==='a'||t==='button'||t==='input'||t==='select'||t==='textarea'||el.getAttribute('role')||el.hasAttribute('contenteditable'));
                        if(!interactive||el===__hoverLast){return;}
                        __hoverLast=el;
                        if(__hoverTimer)clearTimeout(__hoverTimer);
                        __hoverTimer=setTimeout(function(){
                            __hoverTimer=null;
                            const r=el.getBoundingClientRect();
                            window.__pk_cdp_hover__({
                                tag:el.tagName.toLowerCase(),id:el.id||'',
                                classes:(el.className&&typeof el.className==='string')?el.className:'',
                                text:'',name:el.getAttribute('name')||'',
                                placeholder:el.getAttribute('placeholder')||'',
                                type:el.getAttribute('type')||'',
                                dataTestId:el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'',
                                rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
                            });
                        },300);
                    };
                    document.addEventListener('mouseover',window.__pk_cdp_hover_handler__,true);
                    window.__pk_cdp_hover_listener__=true;
                }
                // ACT-BE: keyboard (keydown) → key + printable-флаг; $value для печатных.
                if(!window.__pk_cdp_key_handler__){
                    window.__pk_cdp_key_handler__=function(e){
                        const el=e.target;
                        const r=el.getBoundingClientRect();
                        const printable=(e.key&&e.key.length===1)&&!e.ctrlKey&&!e.metaKey&&!e.altKey;
                        window.__pk_cdp_key__({
                            tag:el.tagName.toLowerCase(),id:el.id||'',
                            classes:(el.className&&typeof el.className==='string')?el.className:'',
                            text:'',key:e.key||'',printable:printable,
                            name:el.getAttribute('name')||'',
                            placeholder:el.getAttribute('placeholder')||'',
                            type:el.getAttribute('type')||'',
                            ariaLabel:el.getAttribute('aria-label')||'',
                            dataTestId:el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'',
                            rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
                        });
                    };
                    document.addEventListener('keydown',window.__pk_cdp_key_handler__,true);
                    window.__pk_cdp_key_listener__=true;
                }
                // ACT-BE: focus (focusin, без ввода).
                if(!window.__pk_cdp_focus_handler__){
                    window.__pk_cdp_focus_handler__=function(e){
                        const el=e.target;
                        if(!el||el.nodeType!==1){return;}
                        const r=el.getBoundingClientRect();
                        window.__pk_cdp_focus__({
                            tag:el.tagName.toLowerCase(),id:el.id||'',
                            classes:(el.className&&typeof el.className==='string')?el.className:'',
                            text:'',name:el.getAttribute('name')||'',
                            placeholder:el.getAttribute('placeholder')||'',
                            type:el.getAttribute('type')||'',
                            dataTestId:el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'',
                            rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
                        });
                    };
                    document.addEventListener('focusin',window.__pk_cdp_focus_handler__,true);
                    window.__pk_cdp_focus_listener__=true;
                }
            """)
            logger.info("browser_observe_start: injected")
            return {"ok": True, "status": "already_active" if already_active else "observing"}
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
                    "window.__pk_cdp_click_handler__=null;}window.__pk_cdp_click_listener__=false;"
                    "if(window.__pk_cdp_input_handler__){"
                    "document.removeEventListener('input',window.__pk_cdp_input_handler__,true);"
                    "document.removeEventListener('change',window.__pk_cdp_input_handler__,true);"
                    "window.__pk_cdp_input_handler__=null;}window.__pk_cdp_input_listener__=false;"
                    # BROWSER-STUDIO-SCROLL: long-action листенеры теперь именованные —
                    # stop снимает их и гасит флаги. Раньше stop ставил флаги в true,
                    # не снимая хендлеры: после навигации флаг жил на новом документе
                    # без листенера, и следующий start молча пропускал навешивание.
                    "if(window.__pk_cdp_wheel_handler__){"
                    "document.removeEventListener('wheel',window.__pk_cdp_wheel_handler__,true);"
                    "window.__pk_cdp_wheel_handler__=null;}window.__pk_cdp_wheel_listener__=false;"
                    "if(window.__pk_cdp_scroll_handler__){"
                    "document.removeEventListener('scroll',window.__pk_cdp_scroll_handler__,true);"
                    "window.__pk_cdp_scroll_handler__=null;}window.__pk_cdp_scroll_listener__=false;"
                    "if(window.__pk_cdp_drag_handler__){"
                    "document.removeEventListener('mousedown',window.__pk_cdp_drag_handler__,true);"
                    "window.__pk_cdp_drag_handler__=null;}"
                    "if(window.__pk_cdp_drag_end_handler__){"
                    "document.removeEventListener('mouseup',window.__pk_cdp_drag_end_handler__,true);"
                    "window.__pk_cdp_drag_end_handler__=null;}window.__pk_cdp_drag_listener__=false;"
                    "if(window.__pk_cdp_hover_handler__){"
                    "document.removeEventListener('mouseover',window.__pk_cdp_hover_handler__,true);"
                    "window.__pk_cdp_hover_handler__=null;}window.__pk_cdp_hover_listener__=false;"
                    "if(window.__pk_cdp_key_handler__){"
                    "document.removeEventListener('keydown',window.__pk_cdp_key_handler__,true);"
                    "window.__pk_cdp_key_handler__=null;}window.__pk_cdp_key_listener__=false;"
                    "if(window.__pk_cdp_focus_handler__){"
                    "document.removeEventListener('focusin',window.__pk_cdp_focus_handler__,true);"
                    "window.__pk_cdp_focus_handler__=null;}window.__pk_cdp_focus_listener__=false;"
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
        # BBA-3/TYPE-BE/ACT-BE: value classification из DOM-признаков, не из AX-ноды.
        # valueClass/valueRef уже выставлены в _on_input/_on_key (redaction на
        # границе). НЕ перетираем их для action-types, несущих значение
        # (type/select/key) — только дочищаем на случай тестовых событий без
        # valueRef. click получает valueClass='unknown'/valueRef=''. Длинные
        # действия (wheel/scroll/drag/hover/focus) значения не несут — дефолт
        # valueClass='unknown'/valueRef='' без перетирания.
        action = evt.get("action", "")
        if action in ("type", "select", "key"):
            if "valueClass" not in evt:
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
            if "valueRef" not in evt:
                evt["valueRef"] = _redact_value_ref("", evt.get("valueClass", "unknown"))
        else:
            evt.setdefault("valueClass", "unknown")
            evt.setdefault("valueRef", "")
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
    """TYPE-BE / BBA-3: записать type/select-событие с backend-redaction значения.

    Сырое ``value`` из JS-моста классифицируется и НЕМЕДЛЕННО редактируется:
    вместо plaintext в событие кладётся ``valueRef`` — placeholder ``$secret``
    (password/token и иные секреты) или ``$value`` (обычный ввод). Итоговый
    ``element.value`` никогда не несёт plaintext, а ``text`` остаётся пустым.

    ACT-BE: ``<select>``-изменение (change) различается от ``type`` — событие
    ``action="select"`` с тем же valueRef-redaction, чтобы FE маппил в
    canonical ``select``, а не в ``type``.
    """
    if worker is None:
        worker = _worker
    tag = str(event_info.get("tag", "") or "").lower()
    raw_value = str(event_info.get("value", "") or "")
    value_class = _classify_input_value(event_info)
    value_ref = _redact_value_ref(raw_value, value_class)
    action = "select" if tag == "select" else "type"
    evt = {
        "timestamp": time.time(),
        "action": action,
        "valueClass": value_class,
        "valueRef": value_ref,
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


def _on_wheel(event_info: dict, worker: object | None = None) -> None:
    """ACT-BE: wheel-событие (колесо мыши) — action='wheel', delta {dx,dy}."""
    if worker is None:
        worker = _worker
    evt = {
        "timestamp": time.time(),
        "action": "wheel",
        "delta": {
            "dx": int(event_info.get("delta", {}).get("dx", 0) or 0),
            "dy": int(event_info.get("delta", {}).get("dy", 0) or 0),
        },
        "element": _element_snapshot(event_info),
    }
    _append_event(worker, evt)


def _on_scroll(event_info: dict, worker: object | None = None) -> None:
    """ACT-BE: scroll-событие (прокрутка) — action='scroll', delta {dx,dy}."""
    if worker is None:
        worker = _worker
    evt = {
        "timestamp": time.time(),
        "action": "scroll",
        "delta": {
            "dx": int(event_info.get("delta", {}).get("dx", 0) or 0),
            "dy": int(event_info.get("delta", {}).get("dy", 0) or 0),
        },
        "element": _element_snapshot(event_info),
    }
    _append_event(worker, evt)


def _on_drag(event_info: dict, worker: object | None = None) -> None:
    """ACT-BE: drag&drop-событие — action='drag', coords {startX..endY}."""
    if worker is None:
        worker = _worker
    coords = event_info.get("coords", {}) or {}
    evt = {
        "timestamp": time.time(),
        "action": "drag",
        "coords": {
            "startX": int(coords.get("startX", 0) or 0),
            "startY": int(coords.get("startY", 0) or 0),
            "endX": int(coords.get("endX", 0) or 0),
            "endY": int(coords.get("endY", 0) or 0),
        },
        "element": _element_snapshot(event_info),
    }
    _append_event(worker, evt)


def _on_hover(event_info: dict, worker: object | None = None) -> None:
    """ACT-BE: hover-событие (mouseenter, дебаунс) — action='hover', только element."""
    if worker is None:
        worker = _worker
    evt = {
        "timestamp": time.time(),
        "action": "hover",
        "element": _element_snapshot(event_info),
    }
    _append_event(worker, evt)


def _on_key(event_info: dict, worker: object | None = None) -> None:
    """ACT-BE: keyboard-событие (keydown) — action='key'.

    Печатный одиночный символ = вводимое значение → redacted в ``valueRef``
    (``$value``/``$secret``), а ``key`` остаётся пустым (символ не утекает).
    Непечатные клавиши (Enter/Backspace/стрелки/модификаторы) не являются
    plaintext-вводом — их имя кладётся в ``key`` без redaction.
    """
    if worker is None:
        worker = _worker
    key = str(event_info.get("key", "") or "")
    printable = bool(event_info.get("printable", False))
    value_class = _classify_input_value(event_info)
    if printable:
        value_ref = _redact_value_ref(key, value_class)
        key_out = ""
    else:
        value_ref = ""
        key_out = key
    evt = {
        "timestamp": time.time(),
        "action": "key",
        "key": key_out,
        "valueClass": value_class,
        "valueRef": value_ref,
        "element": _element_snapshot(event_info),
    }
    _append_event(worker, evt)


def _on_focus(event_info: dict, worker: object | None = None) -> None:
    """ACT-BE: focus-событие (focusin, без ввода) — action='focus', только element."""
    if worker is None:
        worker = _worker
    evt = {
        "timestamp": time.time(),
        "action": "focus",
        "element": _element_snapshot(event_info),
    }
    _append_event(worker, evt)


def _element_snapshot(event_info: dict) -> dict:
    """ACT-BE: единый shape element-среза для всех observe-событий.

    Никогда не несёт plaintext: ``text`` обрезан (как у click), сырой ``value``
    не кладётся (он живёт только в valueRef у type/key/select).
    """
    return {
        "tag": event_info.get("tag", ""),
        "id": event_info.get("id", ""),
        "classes": event_info.get("classes", ""),
        "text": (event_info.get("text") or "")[:80],
        "rect": event_info.get("rect", {"x": 0, "y": 0, "w": 0, "h": 0}),
        "name": event_info.get("name", ""),
        "placeholder": event_info.get("placeholder", ""),
        "type": event_info.get("type", ""),
        "dataTestId": event_info.get("dataTestId", ""),
    }


def _append_event(worker: object, evt: dict) -> None:
    """ACT-BE: присвоить eventId и положить событие в очередь worker'а."""
    worker._observe_last_event_id += 1
    evt["eventId"] = f"cdp-{worker._observe_last_event_id}"
    worker._observed_events.append(evt)


def _classify_input_value(event_info: dict) -> str:
    """Классифицировать введённое значение: secret | email | phone | unknown.

    Использует только DOM-признаки (type/name/aria-label), никогда — сам
    plaintext. Согласовано с ``utils.discovery_element_extractor._classify_value``.
    """
    try:
        from utils.discovery_element_extractor import _classify_value
        return _classify_value({
            "tag": event_info.get("tag", ""),
            "name_attr": event_info.get("name", ""),
            "accessible_name": event_info.get("ariaLabel", ""),
            "type_attr": event_info.get("type", ""),
        })
    except ImportError:
        pass
    # fallback без модуля — минимальный локальный классификатор.
    type_attr = str(event_info.get("type", "") or "").lower()
    name_attr = str(event_info.get("name", "") or "").lower()
    if type_attr == "password":
        return "secret"
    if type_attr == "email":
        return "email"
    if type_attr == "tel":
        return "phone"
    if name_attr in ("password", "passwd", "pwd", "passcode", "pin", "secret", "token", "api_key", "apikey"):
        return "secret"
    return "unknown"


def _redact_value_ref(raw_value: str, value_class: str) -> str:
    """Вернуть placeholder для введённого значения (plaintext не уходит никогда).

    Секрет → ``$secret``; иначе (непустое значение) → ``$value``; пустое → ``""``.
    """
    if value_class == "secret":
        return "$secret"
    if raw_value.strip():
        return "$value"
    return ""


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


def browser_elements_snapshot(session_id: str | None = None) -> dict:
    """BBA-7: список кликабельных элементов активной страницы (CandidateElement[])."""
    return BrowserSessionManager.worker_for(session_id).dispatch("elements_snapshot")

def browser_viewport(session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("viewport")

def browser_viewport_set(width: int, height: int, session_id: str | None = None) -> dict:
    """VIEWFIT-BE: сменить размер вьюпорта (POST /api/browser/viewport {width,height})."""
    return BrowserSessionManager.worker_for(session_id).dispatch("viewport_set", width=width, height=height)

def browser_keyboard_press(key: str, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("keyboard_press", key=key)

def browser_mouse_wheel(dx: float = 0.0, dy: float = 0.0, session_id: str | None = None,
                        x: float | None = None, y: float | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("mouse_wheel", dx=dx, dy=dy, x=x, y=y)

def browser_mouse_drag(x1: float, y1: float, x2: float, y2: float, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("mouse_drag", x1=x1, y1=y1, x2=x2, y2=y2)

def browser_mouse_click(x: float, y: float, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("mouse_click", x=x, y=y)

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


def browser_step_execute(step: dict, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("step_execute", step=step)


def browser_scenario_replay(steps: list, stop_on_failure: bool = True, session_id: str | None = None) -> dict:
    return BrowserSessionManager.worker_for(session_id).dispatch("scenario_replay", steps=steps, stop_on_failure=stop_on_failure)


def browser_scenario_abort(session_id: str | None = None) -> dict:
    """BBA-EXEC-2: запросить отмену активного replay.

    Выставляет флаг НАПРЯМУЮ на worker (минуя dispatch-очередь), потому что
    replay исполняется синхронно на worker-потоке — диспатч встал бы в хвост
    очереди и не сработал до завершения сценария.
    """
    worker = BrowserSessionManager.worker_for(session_id)
    worker._abort_requested = True
    return {"ok": True, "abort_requested": True}


def browser_replay_timeline(replay_id: str, session_id: str | None = None) -> dict:
    """BBA-EXEC-3: прочитать сохранённый replay_timeline.json.

    Чистое файловое чтение (не требует worker-потока / браузера).
    """
    del session_id  # сигнатура единообразна с остальными browser_* API
    timeline = get_store().load_timeline(replay_id)
    if timeline is None:
        return {"ok": False, "error": "timeline not found", "replay_id": replay_id}
    return {"ok": True, "replay_id": replay_id, "timeline": timeline}