# -*- coding: utf-8 -*-
"""
Tiny HTTP server for PK Live: noVNC + diary SSE (+ scanner channel).

Long-lived shell (idle wrapper or soft-bind). Runner signals run_ended for diary
export; product teardown must not kill HTTP. Disable with PK_LIVE=0.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse
import urllib.request

from utils import diary_bus

import time as _time_module
import uuid as _uuid_module

_DISCOVERY_SESSIONS: dict[str, dict[str, Any]] = {}
_DISCOVERY_SESSIONS_LOCK = threading.Lock()

logger = logging.getLogger("orchestrator")

DEFAULT_LIVE_PORT = 8767
STATIC_DIR = Path(__file__).resolve().parents[1] / "static" / "live"

_server: Optional[ThreadingHTTPServer] = None
_thread: Optional[threading.Thread] = None
_lock = threading.Lock()
_owns_server = False


def live_enabled() -> bool:
    raw = (pk_env("LIVE") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def ai_assistant_enabled() -> bool:
    """EXP-01 toggle: PK_AI_ASSISTANT_ENABLED=1 includes Qwen3 proxy + UI.

    Default OFF — сначала снять референс старой системы без AI-разметки.
    """
    raw = (pk_env("AI_ASSISTANT_ENABLED") or "0").strip().lower()
    return raw in ("1", "true", "yes", "on")


def live_port() -> int:
    raw = (pk_env("LIVE_PORT") or "").strip()
    if not raw:
        return DEFAULT_LIVE_PORT
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_LIVE_PORT


def live_url() -> str:
    return f"http://127.0.0.1:{live_port()}/"


def default_novnc_url(browser: str = "chrome") -> str:
    """Host-facing noVNC URL for lab compose (chrome :7900, firefox :7901)."""
    name = (browser or "chrome").lower().replace("-headless", "")
    port = 7901 if name == "firefox" else 7900
    return f"http://127.0.0.1:{port}/?autoconnect=1&resize=scale"


def _diary_event_matches(ev: dict, want_run: str = "", want_kind: str = "") -> bool:
    """MONITOR-LIVE-DEEPLINK: строгий run-фильтр diary-событий.

    При запросе конкретного run'а проходят ТОЛЬКО события этого run —
    unscoped/чужие (другого прогона) не подмешиваются.
    """
    if want_run and str(ev.get("run_id") or "").strip() != want_run:
        return False
    if want_kind:
        from utils.diary_bus import _kind_match

        if not _kind_match(want_kind, ev.get("kind", "")):
            return False
    return True


def run_is_live_shared(run_id: str) -> bool:
    """MONITOR-RUN-LIFECYCLE-ARCHIVE: общий (межпроцессный) сигнал «живой».

    Источник — статус-файл раннера ``reports/runs/current.json`` (``lab_run``),
    доступный и раннеру, и live-shell. Не опирается на env дочернего процесса
    (``PK_RUN_ID``), поэтому «live» однозначен во всех процессах.
    """
    rid = (run_id or "").strip()
    if not rid:
        return False
    try:
        from utils.lab_run import get_run_status

        st = get_run_status()
        return (
            str(st.get("phase") or "") == "running"
            and str(st.get("run_id") or "").strip() == rid
        )
    except Exception:
        return False


def shared_run_phase(run_id: str) -> str:
    """Фаза общего раннера для ``run_id``: ``running`` | ``finished`` | ``""``.

    Источник — ``reports/runs/current.json`` (``lab_run``) — общий для всех
    процессов, в отличие от env дочернего раннера.
    """
    rid = (run_id or "").strip()
    if not rid:
        return ""
    try:
        from utils.lab_run import get_run_status

        st = get_run_status()
        if str(st.get("run_id") or "").strip() == rid:
            return str(st.get("phase") or "")
    except Exception:
        pass
    return ""


class _LiveHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        logger.debug("live_server: " + fmt, *args)

    def _cors_headers(self) -> None:
        """Editor (Vite) polls /api/meta and results hooks from another origin."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        # X-PK-User (X-PK-User legacy): Admin Live fetches (Dojo/evidence/runs) — иначе preflight Failed to fetch
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-PK-User",
        )

    def do_OPTIONS(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.send_response(204)
            self._cors_headers()
            self.end_headers()
            return
        self.send_error(404, "Not Found")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            try:
                from utils.monitor_retention import lazy_sweep_monitor_artifacts

                lazy_sweep_monitor_artifacts()
            except Exception:
                pass
        if path in ("/", "/index.html"):
            self._serve_index()
            return
        if path in (
            "/secops-monitor-icon.svg",
            "/secops-monitor-icon.png",
            "/prettyk-real-live.png",
        ):
            self._serve_static_asset(path.lstrip("/"))
            return
        if path == "/api/meta":
            self._serve_meta()
            return
        if path == "/api/log/anomalies":
            self._serve_log_anomalies()
            return
        if path == "/api/ai/status":
            self._serve_ai_status()
            return
        if path == "/api/gate/policy":
            self._serve_gate_policy()
            return
        if path == "/api/admin/retention/status":
            self._serve_retention_status()
            return
        if path == "/api/lab/intruder/status":
            self._serve_intruder_status()
            return
        if path == "/api/lab/intruder/results":
            self._serve_intruder_results()
            return
        if path == "/api/lab/intruder/detail":
            self._serve_intruder_detail()
            return
        if path == "/api/retention/policy":
            self._serve_retention_policy()
            return
        if path == "/api/results/hooks":
            self._serve_results_hooks()
            return
        if path == "/api/export/latest":
            self._serve_export_latest()
            return
        if path == "/api/export":
            self._serve_export_by_run_id()
            return
        if path == "/api/package/latest":
            self._serve_package_latest()
            return
        if path == "/api/summary/latest":
            self._serve_summary_latest()
            return
        if path == "/api/evidence":
            self._serve_evidence()
            return
        if path == "/api/dojo/program":
            self._serve_dojo_program()
            return
        if path == "/api/dojo/severity":
            self._serve_dojo_severity()
            return
        if path == "/api/dojo/findings":
            self._serve_dojo_findings()
            return
        if path == "/api/dojo/sync/status":
            self._serve_dojo_sync_status()
            return
        if path == "/api/auth/vault/status":
            self._serve_auth_vault_status()
            return
        if path == "/api/runs/index":
            self._serve_runs_index()
            return
        if path == "/api/runs/apps":
            self._serve_runs_apps()
            return
        if path == "/api/recording":
            self._serve_recording()
            return
        if path == "/api/recording/status":
            self._serve_recording_status()
            return
        if path == "/api/execution/timeline":
            self._serve_execution_timeline()
            return
        if path == "/api/execution/snapshot":
            self._serve_execution_snapshot()
            return
        if path == "/api/execution/scene-graph":
            self._serve_execution_scene_graph()
            return
        if path == "/api/journal":
            self._serve_journal_latest()
            return
        if path == "/api/journal/latest":
            self._serve_journal_latest()
            return
        # ── CF-B3: Fuzzer API ──
        if path == "/api/fuzzer/status":
            self._serve_fuzzer_status()
            return
        if path == "/api/fuzzer/findings":
            qs = parse_qs(parsed.query)
            try:
                limit = int((qs.get("limit") or ["100"])[0])
            except ValueError:
                limit = 100
            severity_f = (qs.get("severity") or [""])[0]
            self._serve_fuzzer_findings(limit=limit, severity=severity_f)
            return
        if path == "/api/fuzzer/findings/sse":
            self._serve_fuzzer_findings_sse()
            return
        if path == "/api/run_summary/latest":
            self._serve_run_summary_latest()
            return
        if path == "/api/artifacts/index":
            self._serve_artifacts_index()
            return
        if path == "/api/artifacts/orphans":
            self._serve_artifacts_orphans()
            return
        if path == "/api/artifacts/audit":
            qs = parse_qs(parsed.query)
            try:
                limit = int((qs.get("limit") or ["100"])[0])
            except ValueError:
                limit = 100
            self._serve_artifacts_audit(limit=limit)
            return
        if path == "/api/diary":
            qs = parse_qs(parsed.query)
            channel = (qs.get("channel") or ["all"])[0]
            run_id = (qs.get("run_id") or [""])[0]
            kind_filter = (qs.get("kind") or [""])[0]
            if run_id and not self._gate_run_id(run_id):
                return
            self._serve_diary_sse(channel, run_id=run_id, kind_filter=kind_filter)
            return
        if path == "/api/warzone/scene":
            # WIRE-WZ: SSE scene_state S(t) из EventJournal.
            self._serve_warzone_scene_sse()
            return
        if path == "/api/warzone/scene/at":
            # WIRE-WZ: точечный S(t) + state_hash (seek / инвариант 100/100).
            qs = parse_qs(parsed.query)
            try:
                t = float((qs.get("t") or ["0"])[0])
            except ValueError:
                self._json_error(400, "t must be a number")
                return
            self._serve_warzone_scene_at(t)
            return
        # ── PERS-B1: Run Registry API ──
        if path == "/api/runs":
            qs = parse_qs(parsed.query)
            try:
                limit = int((qs.get("limit") or ["50"])[0])
            except ValueError:
                limit = 50
            try:
                offset = int((qs.get("offset") or ["0"])[0])
            except ValueError:
                offset = 0
            status_f = (qs.get("status") or [""])[0]
            check_f = (qs.get("check_id") or [""])[0]
            sort = (qs.get("sort") or ["-created_at"])[0]
            self._serve_runs_list(limit=limit, offset=offset, status_f=status_f, check_id=check_f, sort=sort)
            return
        if path.startswith("/api/runs/") and len(path) > len("/api/runs/"):
            rest = path[len("/api/runs/"):].split("?")[0].strip("/")
            if rest.count("/") == 1 and rest.endswith("/evidence"):
                run_id = rest.split("/")[0]
                self._serve_run_evidence(run_id)
                return
            if rest.count("/") == 1 and rest.endswith("/events"):
                run_id = rest.split("/")[0]
                self._serve_run_events(run_id)
                return
            if rest and "/" not in rest:
                self._serve_run_detail(rest)
                return
        # ── PERS-B4: Live stream SSE ──
        if path == "/api/live/stream":
            self._serve_live_stream_sse()
            return
        # ── PERS-B4: Summary trend ──
        if path == "/api/summary/trend":
            qs = parse_qs(parsed.query)
            try:
                days = int((qs.get("days") or ["30"])[0])
            except ValueError:
                days = 30
            self._serve_summary_trend(days=days)
            return
        self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/results/hooks":
            self._accept_results_hook()
            return
        if parsed.path == "/api/run/event":
            self._accept_run_event()
            return
        if parsed.path == "/api/ci/status":
            self._accept_ci_status()
            return
        if parsed.path == "/api/gate/policy":
            self._accept_gate_policy()
            return
        if parsed.path == "/api/retention/policy":
            self._accept_retention_policy()
            return
        if parsed.path == "/api/admin/retention/clean":
            self._accept_retention_clean()
            return
        if parsed.path == "/api/lab/intruder/start":
            self._accept_intruder_start()
            return
        if parsed.path == "/api/lab/intruder/stop":
            self._accept_intruder_stop()
            return
        if parsed.path == "/api/dojo/sync/trigger":
            self._accept_dojo_sync_trigger()
            return
        if parsed.path == "/api/auth/vault/check":
            self._accept_auth_vault_check()
            return
        if parsed.path == "/api/admin/retention/clean_temp":
            self._accept_retention_clean_temp()
            return
        if parsed.path == "/api/artifacts/purge":
            self._accept_artifacts_purge()
            return
        if parsed.path == "/api/monitor/purge":
            self._accept_monitor_purge()
            return
        if parsed.path == "/api/artifacts/hold":
            self._accept_artifacts_hold()
            return
        if parsed.path == "/api/debug/pause":
            self._accept_debug_pause(paused=True)
            return
        if parsed.path == "/api/debug/resume":
            self._accept_debug_pause(paused=False)
            return
        if parsed.path in ("/api/ai/classify", "/api/ai/diff", "/api/ai/prioritize", "/api/ai/delta", "/api/ai/semantic-group", "/api/ai/preflight"):
            if not ai_assistant_enabled():
                self._json_error(503, "ai_assistant_disabled")
                return
            self._accept_ai_proxy()
            return
        if parsed.path == "/api/discovery/start":
            self._accept_discovery_start()
            return
        if parsed.path.startswith("/api/discovery/") and parsed.path.endswith("/stop"):
            parts = parsed.path[len("/api/discovery/"):-len("/stop")]
            session_id = parts.strip("/")
            if session_id:
                self._accept_discovery_stop(session_id)
                return
        if parsed.path.startswith("/api/discovery/") and parsed.path.endswith("/compile"):
            parts = parsed.path[len("/api/discovery/"):-len("/compile")]
            session_id = parts.strip("/")
            if session_id:
                self._accept_discovery_compile(session_id)
                return
        self.send_error(404, "Not Found")

    def _accept_discovery_start(self):
        try:
            length = int(self.headers.get("Content-Length") or "0")
            raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            payload = json.loads(raw_body) if raw_body else {}
        except Exception:
            self._json_error(400, "invalid_json")
            return
        target_url = str(payload.get("target_url") or "")
        persona = payload.get("persona_context") or {}
        session_id = f"disc_{_uuid_module.uuid4().hex[:12]}"
        now = _time_module.time()
        session: dict[str, Any] = {
            "session_id": session_id,
            "target_url": target_url,
            "persona_context": persona,
            "created_at": now,
            "status": "active",
            "events": [],
            "pages": [],
            "ir": None,
        }
        with _DISCOVERY_SESSIONS_LOCK:
            _DISCOVERY_SESSIONS[session_id] = session
        body = json.dumps(
            {"ok": True, "session_id": session_id, "status": "active"},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_discovery_stop(self, session_id: str):
        with _DISCOVERY_SESSIONS_LOCK:
            session = _DISCOVERY_SESSIONS.get(session_id)
        if session is None:
            self._json_error(404, "session_not_found")
            return
        try:
            length = int(self.headers.get("Content-Length") or "0")
            raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            payload = json.loads(raw_body) if raw_body else {}
        except Exception:
            payload = {}
        ir_pages = payload.get("pages") or session.get("pages") or []
        ir_events = payload.get("events") or session.get("events") or []
        ir: dict[str, Any] = {
            "session_id": session_id,
            "target_url": session.get("target_url", ""),
            "persona_context": session.get("persona_context", {}),
            "created_at": session.get("created_at", 0),
            "stopped_at": _time_module.time(),
            "pages": ir_pages,
            "events": ir_events,
        }
        ir_path = Path(f"reports/live/discovery_{session_id}.json")
        ir_path.parent.mkdir(parents=True, exist_ok=True)
        ir_path.write_text(json.dumps(ir, ensure_ascii=False, indent=2), encoding="utf-8")
        with _DISCOVERY_SESSIONS_LOCK:
            session["status"] = "stopped"
            session["ir"] = ir
            session["ir_path"] = str(ir_path)
        body = json.dumps(
            {"ok": True, "session_id": session_id, "ir_path": str(ir_path)},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_discovery_compile(self, session_id: str):
        with _DISCOVERY_SESSIONS_LOCK:
            session = _DISCOVERY_SESSIONS.get(session_id)
        if session is None:
            self._json_error(404, "session_not_found")
            return
        try:
            length = int(self.headers.get("Content-Length") or "0")
            raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            payload = json.loads(raw_body) if raw_body else {}
        except Exception:
            payload = {}
        try:
            from utils.discovery_compiler import compile_wired

            ir = session.get("ir") or {}
            wired = compile_wired(ir)
            out = {"ok": True, "session_id": session_id, "wired": wired}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_debug_pause(self, *, paused: bool) -> None:
        """DBG-1: пауза/продолжить прогон (meta.debug_paused)."""
        try:
            from core.debug_run import set_debug_paused

            meta = set_debug_paused(paused)
        except ValueError as exc:
            self._json_error(409, str(exc))
            return
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps({"ok": True, "meta": meta}, ensure_ascii=False).encode(
            "utf-8"
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_index(self):
        index = STATIC_DIR / "index.html"
        if not index.is_file():
            self.send_error(404, "live UI missing")
            return
        body = index.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _serve_static_asset(self, name: str):
        """Whitelist brand assets next to index.html (favicon / header mark)."""
        safe = Path(name).name
        if safe != name or ".." in name:
            self.send_error(404, "Not Found")
            return
        asset = STATIC_DIR / safe
        if not asset.is_file():
            self.send_error(404, "Not Found")
            return
        suffix = asset.suffix.lower()
        ctype = {
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }.get(suffix)
        if not ctype:
            self.send_error(404, "Not Found")
            return
        body = asset.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(body)

    def _serve_log_anomalies(self):
        """W3.8: GET /api/log/anomalies — список аномалий из текущего run-лога."""
        qs = parse_qs(urlparse(self.path).query)
        try:
            limit = int((qs.get("limit") or ["100"])[0])
        except ValueError:
            limit = 100
        try:
            from utils.log_filter import filter_anomalies
            from utils import diary_bus

            raw = diary_bus.get_recent_logs(limit)
            anomalies = filter_anomalies(raw)
            out = {
                "ok": True,
                "anomalies": [
                    {
                        "category": a.category,
                        "detail": a.detail,
                        "line": a.line,
                        "log_index": a.log_index,
                    }
                    for a in anomalies
                ],
                "total_lines": len(raw),
                "anomaly_count": len(anomalies),
            }
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_meta(self):
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0].strip()
        run_source = ""
        if run_id:
            if not self._gate_run_id(run_id):
                return
            run_source = self._run_source(run_id)
        if run_id and not run_source:
            # REGISTRY-RUN-STATUS-HYGIENE: неизвестный/вычищенный прогон —
            # честный empty-state, а НЕ мета живого чужого прогона (не подменяем).
            payload = {
                "ok": True,
                "run_found": False,
                "requested_run_id": run_id,
                "status": "unknown",
                "reason": (
                    "прогон не найден в текущем окне: "
                    "неизвестный run_id или события вычищены"
                ),
            }
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
            return
        meta = diary_bus.get_meta()
        # EXP-01: inject AI assistant toggle into meta for FE
        if isinstance(meta, dict):
            meta["ai_assistant_enabled"] = ai_assistant_enabled()
            # MON-13: expose hex PK_RUN_ID for monitor deep-link.
            # Do NOT use session_name in URLs — spaces/slashes break routing.
            hex_run_id = diary_bus._active_run_id()
            if hex_run_id:
                meta["run_id"] = hex_run_id
        # ?run_id= — добавить run_id в ответ, не меняя источник meta
        if run_id:
            meta = dict(meta)
            meta["requested_run_id"] = run_id
            meta["run_found"] = True
            meta["run_source"] = run_source
            # MON-13-инъекция активного run_id не должна подменять requested
            # чужим (живым) прогоном.
            if run_source != "active":
                meta.pop("run_id", None)
        try:
            from utils.live_pers_acl import parse_caller_user, redact_meta_for_caller

            caller = parse_caller_user(self.headers, peer_host=self.client_address[0])
            if isinstance(meta, dict):
                meta = redact_meta_for_caller(meta, caller=caller)
        except Exception:
            pass
        body = json.dumps(meta, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_gate_policy(self):
        """QG-AF-7/12: lab GatePolicy JSON (same file runner reads)."""
        try:
            from core.gate_policy_load import load_gate_policy_bundle, resolve_gate_policy_path

            bundle = load_gate_policy_bundle()
            payload = {
                "ok": True,
                "path": str(resolve_gate_policy_path()),
                "source_path": bundle.source_path or None,
                "policy": bundle.to_public_dict(),
            }
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_gate_policy(self):
        """Admin → write GatePolicy JSON to PK_GATE_POLICY_PATH / lab default."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid JSON")
            return
        if not isinstance(payload, dict):
            self._json_error(400, "JSON object required")
            return
        policy = payload.get("policy") if isinstance(payload.get("policy"), dict) else payload
        try:
            from core.gate_policy_load import (
                bundle_from_public_dict,
                write_gate_policy_bundle,
            )

            bundle = bundle_from_public_dict(policy)
            path = write_gate_policy_bundle(bundle)
            out = {
                "ok": True,
                "path": str(path),
                "policy": bundle.to_public_dict(),
            }
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_retention_policy(self):
        """ART-4: RetentionPolicy JSON (artifact TTL), not GatePolicy."""
        try:
            from utils.retention_policy import load_retention_policy, retention_policy_path

            pol = load_retention_policy()
            payload = {"ok": True, "path": str(retention_policy_path()), "policy": pol}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_retention_policy(self):
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid JSON")
            return
        if not isinstance(payload, dict):
            self._json_error(400, "JSON object required")
            return
        policy = (
            payload.get("policy") if isinstance(payload.get("policy"), dict) else payload
        )
        try:
            from utils.retention_policy import save_retention_policy

            path = save_retention_policy(policy)
            out = {"ok": True, "path": str(path), "policy": policy}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_artifacts_index(self):
        """ART-11: check_id → has_artifacts for History badges."""
        try:
            from utils.artifact_index import summarize_checks_for_badges

            checks = summarize_checks_for_badges()
            out = {"ok": True, "checks": checks, "count": len(checks)}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_artifacts_orphans(self):
        """ART-10: run dirs on disk without index entry."""
        try:
            from utils.artifact_cleanup import scan_orphan_run_dirs

            orphans = scan_orphan_run_dirs()
            out = {"ok": True, "orphan_count": len(orphans), "orphans": orphans}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_artifacts_audit(self, *, limit: int = 100):
        """ART-12: thin cleanup audit viewer (JSON)."""
        try:
            from utils.artifact_cleanup import read_cleanup_audit

            events = read_cleanup_audit(limit=limit)
            out = {"ok": True, "count": len(events), "events": events}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_artifacts_purge(self):
        """ART-3: opt-in purge by check_id (disk + owned Dojo)."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid JSON")
            return
        if not isinstance(payload, dict):
            self._json_error(400, "JSON object required")
            return
        check_id = str(payload.get("check_id") or "").strip()
        if not check_id:
            self._json_error(400, "check_id required")
            return
        dry_run = bool(payload.get("dry_run"))
        try:
            from utils.artifact_cleanup import purge_check_artifacts
            from utils.artifact_index import check_legal_hold, get_check_entry

            if get_check_entry(check_id) is None:
                self._json_error(404, "index_empty")
                return
            if check_legal_hold(check_id) and not dry_run:
                self._json_error(409, "legal_hold")
                return
            result = purge_check_artifacts(
                check_id,
                dry_run=dry_run,
                include_dojo=payload.get("include_dojo", True) is not False,
            )
            out = {"ok": bool(result.get("ok")), **result}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_intruder_status(self):
        """LAB-INTRUDER: статус и прогресс запущенной атаки."""
        qs = parse_qs(urlparse(self.path).query)
        attack_id = (qs.get("attack_id") or ["default"])[0]
        try:
            from lab.intruder_engine import get_attack_session

            sess = get_attack_session(attack_id)
            if sess is None:
                payload = {"ok": False, "status": "not_found", "attack_id": attack_id}
            else:
                payload = {"ok": True, **sess.get_progress()}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_intruder_results(self):
        """LAB-INTRUDER: список результатов текущей атаки с пагинацией."""
        qs = parse_qs(urlparse(self.path).query)
        attack_id = (qs.get("attack_id") or ["default"])[0]
        try:
            offset = int((qs.get("offset") or ["0"])[0])
            limit = int((qs.get("limit") or ["100"])[0])
        except ValueError:
            offset = 0
            limit = 100
        try:
            from lab.intruder_engine import get_attack_session

            sess = get_attack_session(attack_id)
            if sess is None:
                payload = {"ok": False, "results": [], "total": 0}
            else:
                results = sess.get_results_slice(offset=offset, limit=limit)
                progress = sess.get_progress()
                payload = {
                    "ok": True,
                    "attack_id": attack_id,
                    "results": results,
                    "total": progress["total"],
                    "completed": progress["completed"],
                    "is_running": progress["is_running"],
                }
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_intruder_detail(self):
        """LAB-INTRUDER: детальный Raw Request/Response для выбранного item_id."""
        qs = parse_qs(urlparse(self.path).query)
        attack_id = (qs.get("attack_id") or ["default"])[0]
        try:
            item_id = int((qs.get("id") or ["1"])[0])
        except ValueError:
            item_id = 1
        try:
            from lab.intruder_engine import get_attack_session

            sess = get_attack_session(attack_id)
            if sess is None:
                self._json_error(404, "attack_not_found")
                return
            detail = sess.get_result_detail(item_id)
            if detail is None:
                self._json_error(404, "item_not_found")
                return
            payload = {"ok": True, "detail": detail}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_intruder_start(self):
        """LAB-INTRUDER: запуск новой атаки Intruder."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
            raw_body = self.rfile.read(length).decode("utf-8")
            payload = json.loads(raw_body) if raw_body else {}
        except Exception:
            self._json_error(400, "invalid_json")
            return
        try:
            from corpus.fuzzer import GrepExtractRule, GrepMatchRule
            from lab.intruder_engine import IntruderAttackConfig, get_or_create_attack_session

            attack_id = str(payload.get("attack_id") or f"lab_{int(time.time())}")
            raw_http = str(payload.get("raw_http") or "")
            attack_mode = str(payload.get("attack_mode") or "sniper")
            payload_sets = payload.get("payload_sets") or []
            encoders = payload.get("encoders") or []
            auto_url = str(payload.get("auto_url_override") or "")
            prefix = str(payload.get("prefix") or "")
            suffix = str(payload.get("suffix") or "")
            concurrency = int(payload.get("concurrency") or 5)
            delay_ms = int(payload.get("delay_ms") or 0)
            timeout_sec = float(payload.get("timeout_sec") or 8.0)

            match_rules = [
                GrepMatchRule(
                    key=str(r.get("key") or f"m_{i}"),
                    pattern=str(r.get("pattern") or ""),
                    is_regex=bool(r.get("is_regex", False)),
                    case_sensitive=bool(r.get("case_sensitive", False)),
                )
                for i, r in enumerate(payload.get("grep_match_rules") or [])
                if r.get("pattern")
            ]
            extract_rules = [
                GrepExtractRule(
                    key=str(r.get("key") or f"e_{i}"),
                    pattern=str(r.get("pattern") or ""),
                    is_regex=bool(r.get("is_regex", True)),
                    group=int(r.get("group", 1)),
                )
                for i, r in enumerate(payload.get("grep_extract_rules") or [])
                if r.get("pattern")
            ]

            cfg = IntruderAttackConfig(
                attack_id=attack_id,
                raw_http=raw_http,
                attack_mode=attack_mode,
                payload_sets=payload_sets,
                grep_match_rules=match_rules,
                grep_extract_rules=extract_rules,
                encoders=encoders,
                prefix=prefix,
                suffix=suffix,
                concurrency=concurrency,
                delay_ms=delay_ms,
                timeout_sec=timeout_sec,
                auto_url_override=auto_url,
            )
            sess = get_or_create_attack_session(cfg)
            sess.start()

            out = {"ok": True, "attack_id": attack_id, "status": "started"}
        except Exception as exc:
            self._json_error(500, str(exc))
            return

        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_intruder_stop(self):
        """LAB-INTRUDER: остановка активной атаки."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
            raw_body = self.rfile.read(length).decode("utf-8")
            payload = json.loads(raw_body) if raw_body else {}
        except Exception:
            payload = {}
        attack_id = str(payload.get("attack_id") or "default")
        try:
            from lab.intruder_engine import get_attack_session

            sess = get_attack_session(attack_id)
            if sess is not None:
                sess.stop()
            out = {"ok": True, "attack_id": attack_id, "status": "stopped"}
        except Exception as exc:
            self._json_error(500, str(exc))
            return

        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_ai_status(self):
        """EXP-01: UI спрашивает, показывать ли AI-разметку."""
        body = json.dumps(
            {"ok": True, "enabled": ai_assistant_enabled()},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_ai_proxy(self):
        """QWEN3-ALERT-ASSISTANT: proxy AI requests to llm-server :8766."""
        if not ai_assistant_enabled():
            self._json_error(503, "ai_assistant_disabled")
            return
        try:
            length = int(self.headers.get("Content-Length") or "0")
            raw_body = self.rfile.read(length) if length > 0 else b""
        except ValueError:
            raw_body = b""

        target_path = urlparse(self.path).path.replace("/api/ai/", "/api/ai/")
        llm_url = f"http://127.0.0.1:8766{target_path}"
        if target_path in ("/api/ai/delta", "/api/ai/semantic-group", "/api/ai/preflight"):
            timeout = 120
        elif target_path in ("/api/ai/diff", "/api/ai/prioritize"):
            timeout = 90
        else:
            timeout = 30

        try:
            req = urllib.request.Request(
                llm_url,
                data=raw_body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self._cors_headers()
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.URLError:
            self._json_error(503, "llm_server_unreachable")
        except Exception as exc:
            self._json_error(500, str(exc))

    def _serve_retention_status(self):
        """RET-API: статус хранилища по категориям артефактов."""
        try:
            from utils.retention_manager import scan_storage_status
            payload = scan_storage_status()
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_retention_clean(self):
        """RET-API: очистка артефактов старше days_older_than дней."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid JSON")
            return
        if not isinstance(payload, dict):
            self._json_error(400, "JSON object required")
            return
        days = payload.get("days_older_than", 7)
        keep_pinned = payload.get("keep_pinned", True)
        dry_run = bool(payload.get("dry_run"))
        # MONITOR-RETENTION-TEST-LEAK: days<1 = «снести всё» — только с явным подтверждением.
        allow_full_wipe = payload.get("allow_full_wipe") is True
        try:
            from utils.retention_manager import cleanup_artifacts

            result = cleanup_artifacts(
                days_older_than=days,
                keep_pinned=keep_pinned,
                dry_run=dry_run,
                allow_full_wipe=allow_full_wipe,
            )
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        if not result.get("ok"):
            self._write_json(400, result)
            return
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_retention_clean_temp(self):
        """RET-API: быстрая очистка временных дампов."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid JSON")
            return
        dry_run = bool(payload.get("dry_run")) if isinstance(payload, dict) else False
        try:
            from utils.retention_manager import cleanup_temp_dumps
            result = cleanup_temp_dumps(dry_run=dry_run)
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_monitor_purge(self):
        """MON-14: on-demand purge артефактов Monitor по run_id (NDJSON + sidecar + MP4)."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid JSON")
            return
        if not isinstance(payload, dict):
            self._json_error(400, "JSON object required")
            return
        run_id = str(payload.get("run_id") or "").strip()
        if not run_id:
            self._json_error(400, "run_id required")
            return
        if not self._gate_run_id(run_id):
            return
        dry_run = bool(payload.get("dry_run"))
        try:
            from utils.monitor_retention import purge_by_run_id

            result = purge_by_run_id(run_id, dry_run=dry_run)
            out = {"ok": bool(result.get("ok")), **result}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_artifacts_hold(self):
        """SURVEY-3: soft legal hold on check_id (overrides retention/purge)."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid JSON")
            return
        if not isinstance(payload, dict):
            self._json_error(400, "JSON object required")
            return
        check_id = str(payload.get("check_id") or "").strip()
        if not check_id:
            self._json_error(400, "check_id required")
            return
        if "hold" not in payload and "legal_hold" not in payload:
            self._json_error(400, "hold required")
            return
        held = bool(payload.get("hold", payload.get("legal_hold")))
        note = str(payload.get("note") or payload.get("legal_hold_note") or "")
        try:
            from utils.artifact_index import set_check_legal_hold

            entry = set_check_legal_hold(check_id, held, note=note)
            if entry is None:
                self._json_error(400, "check_id required")
                return
            out = {
                "ok": True,
                "check_id": check_id,
                "legal_hold": bool(entry.get("legal_hold")),
                "legal_hold_note": entry.get("legal_hold_note") or "",
                "legal_hold_at": entry.get("legal_hold_at") or "",
            }
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_results_hooks(self):
        """RES-H: report hooks. ?run_id= filters to hooks matching that run only."""
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0] or None
        body = json.dumps(diary_bus.get_results_hooks(run_id=run_id), ensure_ascii=False).encode(
            "utf-8"
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_summary_latest(self):
        """RES-4: merged Run UI summary (Allure + scanner + Dojo). ?run_id= filter."""
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0] or None
        try:
            from utils.run_ui_summary import read_run_ui_summary

            payload = read_run_ui_summary(run_id=run_id) or {
                "kind": "pk_run_ui_summary",
                "version": 1,
                "ok": False,
                "risks": {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
            }
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_evidence(self):
        """RES-3: CheckEvidenceRefs registry (deep-links + thin meta)."""
        try:
            from utils.evidence_refs import list_all_evidence, load_evidence_registry
            from utils.live_pers_acl import filter_evidence_list, parse_caller_user

            snap = load_evidence_registry()
            raw_list = list_all_evidence()
            caller = parse_caller_user(self.headers, peer_host=self.client_address[0])
            filtered, hidden = filter_evidence_list(raw_list, caller=caller)
            items = snap.get("items") if isinstance(snap.get("items"), dict) else {}
            if hidden and isinstance(items, dict):
                keep_ids = {str(r.get("check_id") or "") for r in filtered}
                items = {k: v for k, v in items.items() if k in keep_ids}
            payload = {
                "ok": True,
                "version": snap.get("version", 1),
                "items": items,
                "list": filtered,
                "pers_hidden": hidden,
            }
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_dojo_severity(self):
        """ADM-DOJO-1: ACTIVE severity (+ cheap series) by meta.project_id."""
        qs = parse_qs(urlparse(self.path).query)
        project_id = (qs.get("project_id") or [""])[0]
        try:
            from utils.dojo_severity import fetch_severity_for_project

            payload = fetch_severity_for_project(project_id)
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        # Always 200 with honesty status — FE must not invent green zeros on 404/503.
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_dojo_program(self):
        """ADM-DOJO-1: severity aggregate by meta.project_id (no iframe)."""
        try:
            from utils.dojo_program import aggregate_dojo_program

            qs = parse_qs(urlparse(self.path).query)
            raw_ids: list[str] = []
            for key in ("project_id", "project_ids"):
                for chunk in qs.get(key) or []:
                    for part in str(chunk).split(","):
                        part = part.strip()
                        if part:
                            raw_ids.append(part)
            payload = aggregate_dojo_program(raw_ids)
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_dojo_findings(self):
        """ADM-DOJO-FULL-1: thin active findings by meta.project_id."""
        qs = parse_qs(urlparse(self.path).query)
        project_id = (qs.get("project_id") or [""])[0]
        try:
            from utils.dojo_findings import fetch_findings_for_project

            payload = fetch_findings_for_project(project_id)
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_dojo_sync_status(self):
        """DEFECTDOJO-BIDIRECTIONAL-SYNC: состояние синка (для Admin UI)."""
        try:
            from services.dojo_sync import sync_status

            payload = sync_status()
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_dojo_sync_trigger(self):
        """DEFECTDOJO-BIDIRECTIONAL-SYNC: запуск фонового синка (non-blocking)."""
        payload = self._read_json_body()
        if payload is None:
            self._json_error(400, "invalid JSON object")
            return
        test_id = payload.get("test_id")
        try:
            from services.dojo_sync import start_sync_worker

            result = start_sync_worker(
                test_id=test_id,
            )
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        self._write_json(200, result)

    def _serve_auth_vault_status(self):
        """AUTH-VAULT: состояние vault и профилей (маскированные токены)."""
        try:
            from services.auth_vault import load_vault_state

            state = load_vault_state()
            profiles = state.get("profiles") or []
            safe = []
            for p in profiles:
                if not isinstance(p, dict):
                    continue
                safe.append(
                    {
                        "id": p.get("id", ""),
                        "kind": p.get("kind", ""),
                        "auth_type": p.get("auth_type", ""),
                        "session_ok": bool(p.get("session_ok")),
                        "ttl_sec": p.get("ttl_sec", 0),
                        "masked_token": p.get("masked_token", ""),
                        "last_error": p.get("last_error", ""),
                    }
                )
            payload = {"ok": True, "profiles": safe}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        self._write_json(200, payload)

    def _accept_auth_vault_check(self):
        """AUTH-VAULT: живой pre-flight проверки профиля (Check Auth Flow)."""
        payload = self._read_json_body()
        if payload is None:
            self._json_error(400, "invalid JSON object")
            return
        profile_id = str(payload.get("profile_id") or "")
        if not profile_id:
            self._json_error(400, "profile_id required")
            return
        try:
            from services.auth_vault import check_auth_flow

            result = check_auth_flow(profile_id)
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        self._write_json(200 if result.get("ok") else 200, result)

    def _serve_run_summary_latest(self):
        """G-20: last orchestrator run_summary.json mirrored to Live."""
        try:
            from utils.reporter import read_live_run_summary

            payload = read_live_run_summary()
            if payload is None:
                self._json_error(404, "no run_summary yet")
                return
            out = {"ok": True, "summary": payload}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_journal_latest(self):
        """RES-3: journal JSON from latest Live export (fallback: live diary). ?run_id= для replay."""
        qs = parse_qs(urlparse(self.path).query)
        preset = (qs.get("preset") or ["signal"])[0]
        run_id = (qs.get("run_id") or [""])[0]
        requested_run = bool(run_id.strip())
        if run_id and not self._gate_run_id(run_id):
            return
        try:
            limit = int((qs.get("limit") or ["200"])[0])
        except ValueError:
            limit = 200
        try:
            from utils.run_journal import (
                build_journal_from_export,
                build_journal_from_live_diary,
            )

            if run_id:
                export_path = diary_bus.export_ndjson_path_for_run_id(run_id)
            else:
                export_path = diary_bus.latest_export_ndjson_path()
                meta = diary_bus.get_meta()
                run_id = str(meta.get("last_export_run_id") or meta.get("session_name") or "")
            if export_path is not None and export_path.is_file():
                payload = build_journal_from_export(
                    export_path,
                    preset=str(preset or "signal"),
                    run_id=run_id,
                    limit=max(1, min(limit, 1000)),
                )
            elif run_id:
                # MONITOR-LIVE-DEEPLINK: run ещё выполняется (экспорта нет) —
                # отдаём ЖИВЫЕ события этого run из diary (строгий run-фильтр),
                # а не пустой journal.
                payload = build_journal_from_live_diary(
                    preset=str(preset or "signal"),
                    run_id=run_id,
                    limit=max(1, min(limit, 1000)),
                )
            else:
                payload = build_journal_from_live_diary(
                    preset=str(preset or "signal"),
                    run_id=run_id,
                    limit=max(1, min(limit, 1000)),
                )
            payload["ok"] = True
            if requested_run:
                # REGISTRY-RUN-STATUS-HYGIENE + MONITOR-LIVE-DEEPLINK:
                # честный empty-state/архив/live для replay; MONITOR-RETENTION-TEST-LEAK:
                # у завершённого рана без архива — «архив недоступен/вычищен», не «live».
                rid = run_id.strip()
                export_ready = export_path is not None and export_path.is_file()
                events_have = bool(payload.get("events"))
                payload["run_archive"] = export_ready
                if export_ready:
                    payload["run_found"] = True
                elif events_have or self._run_is_live(rid):
                    payload["run_found"] = True
                    payload["live"] = True
                    payload["reason"] = (
                        "живые события прогона; архив появится после финализации"
                    )
                else:
                    payload["run_found"] = False
                    payload["reason"] = (
                        "архив недоступен: экспорт прогона отсутствует или вычищен "
                        "retention-политикой"
                    )
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _results_hook_updates(self, payload: dict) -> list[tuple[str, str]]:
        updates: list[tuple[str, str]] = []
        service = str(payload.get("service") or "").strip().lower()
        report_url = str(payload.get("report_url") or "").strip()
        if service and report_url:
            updates.append((service, report_url))
        for key, svc in (
            ("allure_report_url", "allure"),
            ("dojo_report_url", "dojo"),
            ("scanner_report_url", "scanner"),
        ):
            url = str(payload.get(key) or "").strip()
            if url:
                updates.append((svc, url))
        return updates

    def _results_hook_passthrough(self, payload: dict) -> dict:
        passthrough_keys = (
            "stats",
            "collapse",
            "summary",
            "filter_audit",
            "counts_source",
            "executive",
            "check_id",
            "deploy_id",
            "product_id",
            "engagement_id",
            "test_id",
            "allure_project_id",
            "status",
            "counts",
            "instance_counts",
            "alert_count",
            "instance_count",
            "top_findings",
            "path",
            "run_id",
        )
        return {
            k: payload[k] for k in passthrough_keys if k in payload and payload[k] is not None
        }

    def _apply_results_hook_updates(
        self,
        payload: dict,
        updates: list[tuple[str, str]],
        extras: dict,
        passthrough_keys: tuple,
    ):
        hooks = diary_bus.get_results_hooks()
        for svc, url in updates:
            svc_extras = dict(extras)
            nested = payload.get(svc)
            if isinstance(nested, dict):
                for k in passthrough_keys:
                    if k in nested and nested[k] is not None:
                        svc_extras[k] = nested[k]
            hooks = diary_bus.set_results_hook(svc, url, **svc_extras)
        return hooks

    def _accept_results_hook(self):
        """
        Allure / DefectDojo webhook intake for Results tiles.

        JSON body (any of):
          {"service":"allure"|"dojo"|"scanner","report_url":"http://..."}
          {"allure_report_url":"http://..."}
          {"dojo_report_url":"http://..."}
          {"scanner_report_url":"http://..."}
          {"clear": true}
        """
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid JSON")
            return
        if not isinstance(payload, dict):
            self._json_error(400, "JSON object required")
            return

        if payload.get("clear") is True:
            hooks = diary_bus.clear_results_hooks()
            self._write_json(200, {"ok": True, "hooks": hooks})
            return

        updates = self._results_hook_updates(payload)
        if not updates:
            self._json_error(
                400,
                "need service+report_url or allure_report_url / dojo_report_url / scanner_report_url",
            )
            return

        passthrough_keys = (
            "stats",
            "collapse",
            "summary",
            "filter_audit",
            "counts_source",
            "executive",
            "check_id",
            "deploy_id",
            "product_id",
            "engagement_id",
            "test_id",
            "allure_project_id",
            "status",
            "counts",
            "instance_counts",
            "alert_count",
            "instance_count",
            "top_findings",
            "path",
            "run_id",
        )
        extras = self._results_hook_passthrough(payload)
        try:
            hooks = self._apply_results_hook_updates(
                payload, updates, extras, passthrough_keys
            )
        except ValueError as e:
            self._json_error(400, str(e))
            return

        self._write_json(200, {"ok": True, "hooks": hooks})

    def _write_json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code: int, message: str) -> None:
        self._write_json(code, {"ok": False, "error": message})

    def _read_json_body(self) -> Optional[dict]:
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(max(0, length)) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def _gate_run_id(self, run_id: str) -> bool:
        """Верифицировать доступ к run_id через caller ACL (X-PK-User / cookie).

        В unified PW-AIRGAP-архитектуре Monitor открывается внутри коробки —
        кука уже летает во всех запросах, bind-токен избыточен.
        """
        rid = (run_id or "").strip()
        if not rid:
            return True
        try:
            from utils.live_pers_acl import may_view_run, parse_caller_user

            caller = parse_caller_user(self.headers, peer_host=self.client_address[0])
            if may_view_run(caller=caller, run_id=rid):
                return True
        except Exception:
            pass
        self._json_error(403, "no access to run")
        return False

    def _run_source(self, run_id: str) -> str:
        """Источник знания о прогоне: active|export|run_dir|runs_index|"".

        REGISTRY-RUN-STATUS-HYGIENE: для ``/api/meta?run_id=`` отличаем
        существующий прогон (в т.ч. архивный) от неизвестного/вычищенного,
        чтобы страница могла показать честный empty-state.

        LIVE-MONITOR-REVIVE: «active» — кросс-процессный факт. Живой ран
        исполняется ВНЕШНИМ раннером, у idle-wrapper (:8767) его run_id нет
        в env, поэтому одного ``_active_run_id()`` мало: сверяем дисковую
        мету (run_id + status=running) и свежий running в runs_index —
        паритет с live-веткой журнала (``_run_is_live``).
        """
        rid = (run_id or "").strip()
        if not rid:
            return ""
        # Authoritative shared phase (lab_run current.json): «finished» подавляет
        # process-local env/meta-shortcuts (устранение stale «active»).
        shared_phase = shared_run_phase(rid)
        if shared_phase == "running":
            return "active"
        shared_finished = shared_phase == "finished"
        try:
            if not shared_finished and str(diary_bus._active_run_id() or "") == rid:
                return "active"
        except Exception:
            pass
        # Кросс-процессный live: мета на диске говорит «этот ран сейчас идёт».
        try:
            meta = diary_bus.get_meta() or {}
            meta_rid = str(meta.get("run_id") or "").strip()
            meta_status = str(meta.get("status") or "").strip().lower()
            if not shared_finished and meta_rid == rid and meta_status == "running":
                return "active"
        except Exception:
            pass
        # Фолбэк: свежий running в runs_index (старт зафиксирован, финала нет).
        # Shared, process-independent live signal (lab_run current.json).
        if run_is_live_shared(rid):
            return "active"
        if self._run_is_live(rid):
            return "active"
        try:
            if diary_bus.export_ndjson_path_for_run_id(rid) is not None:
                return "export"
        except Exception:
            pass
        try:
            from pathlib import Path as _Path

            from utils.paths import RUNS_DIR

            if (_Path(RUNS_DIR) / rid).is_dir():
                return "run_dir"
        except Exception:
            pass
        try:
            from utils.runs_index import _lookup_run_index

            if _lookup_run_index(rid) is not None:
                return "runs_index"
        except Exception:
            pass
        return ""

    def _run_is_live(self, run_id: str) -> bool:
        """MONITOR-RETENTION-TEST-LEAK: прогон СЕЙЧАС идёт (свежий running в runs_index).

        Отличает живой ран (архив появится после финализации) от завершённого,
        у которого архив отсутствует/вычищен retention-политикой.
        """
        rid = (run_id or "").strip()
        if not rid:
            return False
        try:
            from utils.checks_registry import _run_is_freshly_running
            from utils.runs_index import _lookup_run_index

            return bool(_run_is_freshly_running(_lookup_run_index(rid)))
        except Exception:
            return False

    def _accept_run_event(self):
        """
        Runner → Live shell lifecycle events.

        MVP: {"event":"run_ended","run_id"?: "...","filter_preset"?: "all"}
        Shell snapshots diary; HTTP stays up; status → waiting.
        """
        payload = self._read_json_body()
        if payload is None:
            self._json_error(400, "invalid JSON object")
            return
        event = str(payload.get("event") or "").strip().lower()
        if event != "run_ended":
            self._json_error(400, "unsupported event (expected run_ended)")
            return
        run_id = str(payload.get("run_id") or "").strip()
        if not run_id:
            run_id = str(diary_bus.get_meta().get("session_name") or "").strip()
        filter_preset = str(payload.get("filter_preset") or "all").strip() or "all"
        try:
            result = handle_run_ended(run_id=run_id, filter_preset=filter_preset)
        except ValueError as e:
            self._json_error(400, str(e))
            return
        except OSError as e:
            self._json_error(500, f"export failed: {e}")
            return
        try:
            from utils.live_pers_acl import parse_caller_user
            from utils.runs_index import upsert_run_index

            meta_owner = diary_bus.get_meta().get("owner_user_id")
            upsert_run_index(
                {
                    "run_id": run_id,
                    "check_id": payload.get("check_id"),
                    "status": "success",
                    "ci_verdict": payload.get("ci_verdict"),
                    "owner_user_id": payload.get("owner_user_id")
                    or parse_caller_user(self.headers, peer_host=self.client_address[0])
                    or meta_owner,
                    "source": "run_ended",
                }
            )
        except Exception:
            pass
        body = json.dumps({"ok": True, **result}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_recording(self):
        """MON-5: replay видео по ?run_id= с поддержкой Range (HTTP 206)."""
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0]
        if not run_id:
            self._json_error(400, "run_id required")
            return
        if not self._gate_run_id(run_id):
            return
        try:
            from utils.run_recording import find_video_for_run, serve_video_range_body

            path = find_video_for_run(run_id)
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        if path is None:
            self._json_error(404, "no recording for run_id")
            return
        range_header = self.headers.get("Range") or ""
        body, status, headers = serve_video_range_body(path, range_header)
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_recording_status(self):
        """B-2 + MONITOR-LIVE-DEEPLINK: статус видео-записи run'а.

        ready / recording (идёт сейчас) / reason — без cross-run fallback.
        """
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0]
        if not run_id:
            self._json_error(400, "run_id required")
            return
        if not self._gate_run_id(run_id):
            return
        try:
            from utils.run_recording import capture_status

            status = capture_status(run_id)
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        payload = {
            "ok": True,
            "run_id": run_id,
            "ready": bool(status.get("ready")),
            "recording": bool(status.get("recording")),
            "path": status.get("path"),
            "size": int(status.get("size") or 0),
            "reason": status.get("reason") or "",
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._json_response(body)

    def _serve_runs_index(self):
        """ADM-B1: append-only runs ledger for Admin merge."""
        qs = parse_qs(urlparse(self.path).query)
        try:
            limit = int((qs.get("limit") or ["200"])[0])
        except ValueError:
            limit = 200
        try:
            from utils.live_pers_acl import parse_caller_user
            from utils.runs_index import list_run_index

            caller = parse_caller_user(self.headers, peer_host=self.client_address[0])
            rows = list_run_index(limit=limit)
            # MH-7: фильтр по caller (политика видимости)
            from utils.live_pers_acl import filter_runs_for_caller

            rows = filter_runs_for_caller(rows, caller=caller)
            payload = {"ok": True, "items": rows, "count": len(rows)}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_runs_apps(self):
        """MH-3: сгруппированный список apps для HomePage. MH-7: ACL-фильтр."""
        try:
            from utils.live_pers_acl import filter_runs_for_caller, parse_caller_user
            from utils.runs_index import list_run_apps

            caller = parse_caller_user(self.headers, peer_host=self.client_address[0])
            apps = list_run_apps()
            # MH-7: ACL-фильтр. Если caller — оператор, оставляем только
            # его instance'ы и убираем пустые deploy/app.
            if caller:
                from utils.live_pers_acl import is_secops_admin

                if not is_secops_admin(caller):
                    caller_id = caller.strip()
                    apps = _filter_apps_by_caller(apps, caller_id)
            payload = {"ok": True, "apps": apps, "count": len(apps)}
        except Exception as exc:
            self._json_error(500, str(exc))
            return
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_execution_timeline(self):
        """B-4: метаданные таймлайна — duration, markers, статус."""
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0]
        if not run_id:
            self._json_error(400, "run_id required")
            return
        if not self._gate_run_id(run_id):
            return
        meta = diary_bus.get_meta()
        run_start_ts = meta.get("run_start_ts")
        is_running = str(meta.get("status") or "").strip().lower() == "running"
        duration = round(time.time() - run_start_ts, 3) if (run_start_ts and is_running) else 0.0
        markers = []
        marker_kinds = {"RUN_STARTED", "RECORDING_FINALIZED", "SECURITY_GATE"}
        for ev in diary_bus.read_file_backlog("diary"):
            if ev.get("run_id") == run_id and ev.get("kind") in marker_kinds:
                markers.append({"kind": ev["kind"], "t": ev.get("t", 0), "ts": ev.get("ts", 0)})
        body = json.dumps({"ok": True, "run_id": run_id, "run_start_ts": run_start_ts,
                          "is_running": is_running, "duration": duration, "markers": markers},
                          ensure_ascii=False).encode("utf-8")
        self._json_response(body)

    def _serve_execution_snapshot(self):
        """B-4: снимок боевой сцены на момент t."""
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0]
        try:
            t = float((qs.get("t") or ["0"])[0])
        except ValueError:
            t = 0.0
        if not run_id:
            self._json_error(400, "run_id required")
            return
        if not self._gate_run_id(run_id):
            return
        meta = diary_bus.get_meta()
        run_start_ts = meta.get("run_start_ts")
        is_running = str(meta.get("status") or "").strip().lower() == "running"
        events = []
        beam_starts_by_id: dict[str, dict] = {}
        hits_by_target: dict[str, list] = {}
        for ev in diary_bus.read_file_backlog("diary"):
            if ev.get("run_id") != run_id:
                continue
            ev_t = ev.get("t", float("inf"))
            if ev_t > t:
                continue
            events.append(ev)
            kind = ev.get("kind", "")
            if kind in ("FUZZ_BEAM_START", "PAYLOAD_MUTATION"):
                bid = ev.get("beam_id") or ev.get("targetNodeId") or ev.get("target", "")
                if not bid:
                    continue
                if bid not in beam_starts_by_id:
                    beam_starts_by_id[bid] = {"beam_id": bid,
                        "source_node": ev.get("sourceNodeId") or ev.get("source", ""),
                        "target_node": ev.get("targetNodeId") or ev.get("target", ""),
                        "started_at": ev_t,
                        "channeling_stage": ev.get("channeling_stage", "warmup"),
                        "last_t": ev_t}
                else:
                    b = beam_starts_by_id[bid]
                    b["last_t"] = ev_t
                    b["channeling_stage"] = ev.get("channeling_stage") or b["channeling_stage"]
            elif kind == "TARGET_HIT":
                target = ev.get("targetNodeId") or ev.get("target", "")
                hits_by_target.setdefault(target, []).append(
                    {"t": ev_t, "severity": ev.get("severity", "low"), "anomaly_flag": ev.get("anomaly_flag", False)})
            elif kind == "BEAM_END":
                bid = ev.get("beam_id") or ev.get("targetNodeId") or ev.get("target", "")
                beam_starts_by_id.pop(bid, None)
        active_beams = []
        for bid, b in beam_starts_by_id.items():
            stage = b["channeling_stage"]
            elapsed = max(0, t - b["last_t"])
            progress = min(1.0, elapsed / 5.0 if stage == "warmup" else elapsed / 3.0 if stage == "cooling" else 0)
            intensity = {"warmup": progress, "active": 1.0, "cooling": 1.0 - progress, "dead": 0.0}.get(stage, 0.0)
            target = b["target_node"]
            active_beams.append({"beam_id": bid, "source_node": b["source_node"],
                "target_node": target, "channeling_stage": stage,
                "started_at": b["started_at"], "duration": round(t - b["started_at"], 3),
                "progress": round(progress, 3), "intensity": round(intensity, 3),
                "hits": hits_by_target.get(target, [])})
        body = json.dumps({"ok": True, "run_id": run_id, "t": t, "run_start_ts": run_start_ts,
                          "is_running": is_running, "active_beams": active_beams,
                          "event_count": len(events)}, ensure_ascii=False).encode("utf-8")
        self._json_response(body)

    def _serve_execution_scene_graph(self):
        """B-4: топология боевой сцены."""
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0]
        if not run_id:
            self._json_error(400, "run_id required")
            return
        if not self._gate_run_id(run_id):
            return
        meta = diary_bus.get_meta()
        graph = meta.get("scene_graph")
        if isinstance(graph, dict) and graph.get("nodes") and graph.get("edges"):
            body = json.dumps({"ok": True, "run_id": run_id, **graph}, ensure_ascii=False).encode("utf-8")
        else:
            body = json.dumps({"ok": True, "run_id": run_id, "nodes": [], "edges": []},
                            ensure_ascii=False).encode("utf-8")
        self._json_response(body)

    def _json_response(self, body: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _accept_ci_status(self):
        """Runner / GHA → Live CI status for Results «Статус запуска»."""
        payload = self._read_json_body()
        if payload is None:
            self._json_error(400, "invalid JSON object")
            return
        try:
            result = apply_ci_status(payload)
        except ValueError as e:
            self._json_error(400, str(e))
            return
        try:
            from utils.runs_index import upsert_run_index

            rid = str(payload.get("run_id") or payload.get("session") or "").strip()
            if rid:
                upsert_run_index(
                    {
                        "run_id": rid,
                        "check_id": payload.get("check_id"),
                        "status": payload.get("status") or payload.get("phase") or "unknown",
                        "ci_verdict": payload.get("verdict") or payload.get("ci_verdict"),
                        "owner_user_id": payload.get("owner_user_id"),
                        "ended_at": payload.get("ended_at"),
                        "started_at": payload.get("started_at"),
                        "source": "ci_status",
                    }
                )
        except Exception:
            pass
        body = json.dumps({"ok": True, **result}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_export_latest(self):
        path = diary_bus.latest_export_ndjson_path()
        if path is None or not path.is_file():
            self._json_error(404, "no export yet")
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Content-Disposition",
            f'attachment; filename="{path.name}"',
        )
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_export_by_run_id(self):
        """MON-3: replay экспорта конкретного прогона по ?run_id=."""
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0]
        if not run_id:
            self._json_error(400, "run_id required")
            return
        if not self._gate_run_id(run_id):
            return
        path = diary_bus.export_ndjson_path_for_run_id(run_id)
        if path is None or not path.is_file():
            self._json_error(404, "no export for run_id")
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Content-Disposition",
            f'attachment; filename="{path.name}"',
        )
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_package_latest(self):
        """RES-7 MVP: zip diary + log_cuts + meta + hooks (+ fuzz/run extras)."""
        qs = parse_qs(urlparse(self.path).query)
        run_id = (qs.get("run_id") or [""])[0]
        # MC-RES-3: ?recalc=0|1 перекрывает PK_PACKAGE_RECALC_GATE
        recalc_raw = (qs.get("recalc") or [""])[0].strip().lower()
        recalc_gate = None
        if recalc_raw in {"0", "false", "off", "no"}:
            recalc_gate = False
        elif recalc_raw in {"1", "true", "on", "yes"}:
            recalc_gate = True
        try:
            from utils.run_package import build_or_latest_package

            path, info = build_or_latest_package(
                run_id=str(run_id or ""),
                recalc_gate=recalc_gate,
            )
        except Exception as e:
            self._json_error(500, f"package build failed: {e}")
            return
        if info.get("error") == "plaintext_secrets":
            body = json.dumps(
                {
                    "ok": False,
                    "error": "plaintext_secrets",
                    "secret_scan": info.get("secret_scan") or {},
                },
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(409)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
            return
        if path is None or not path.is_file():
            self._json_error(404, "package empty")
            return
        body = path.read_bytes()
        filename = str(info.get("filename") or path.name)
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Content-Disposition",
            f'attachment; filename="{filename}"',
        )
        self.send_header("Access-Control-Expose-Headers", "Content-Disposition")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_diary_sse(self, channel: str, run_id: str = "", kind_filter: str = ""):
        """
        File-based SSE so an idle Live process sees events from orchestrator.
        Backlog from diary.ndjson, then byte-offset tail (no in-process dupes).
        run_id — MON-3: filter to a specific run (replay / multi-monitor).
        kind_filter — B-3: comma-separated kinds.
        """
        filt = (channel or "all").strip().lower() or "all"
        want_run = (run_id or "").strip()
        want_kind = (kind_filter or "").strip()

        def _match(ev: dict) -> bool:
            return _diary_event_matches(ev, want_run, want_kind)

        backlog = [e for e in diary_bus.read_file_backlog(filt) if _match(e)]
        offset = diary_bus.file_size()
        keepalive_every = 50  # ~15s at 0.3s sleep
        idle_ticks = 0
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            for event in backlog:
                self._write_sse(event)
            while True:
                new_events, offset = diary_bus.read_file_since(offset, filt)
                if new_events:
                    idle_ticks = 0
                    for event in new_events:
                        if not _match(event):
                            continue
                        try:
                            self._write_sse(event)
                        except (BrokenPipeError, ConnectionResetError, OSError):
                            return
                else:
                    idle_ticks += 1
                    if idle_ticks >= keepalive_every:
                        idle_ticks = 0
                        try:
                            self.wfile.write(b": keepalive\n\n")
                            self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError, OSError):
                            break
                time.sleep(0.3)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return

    def _write_sse(self, event: dict) -> None:
        payload = json.dumps(event, ensure_ascii=False)
        self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
        self.wfile.flush()

    # ── WIRE-WZ: SSE scene_state из EventJournal ──

    def _serve_warzone_scene_sse(self):
        """WIRE-WZ: живой SSE scene_state S(t) на каждый diary-событие.

        Строит EventJournal из diary.ndjson backlog, затем tail-поток:
        каждое новое событие → state_at(t) → scene_state_payload → SSE.
        Инвариант 100/100: forward/backward seek дают одинаковый state_hash.
        """
        from warzone.event_journal import EventJournal

        # Backlog: diary события → EventJournal
        backlog = list(diary_bus.read_file_backlog("diary"))
        journal = EventJournal.from_diary_events(backlog)
        offset = diary_bus.file_size()

        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            # Отправить scene_state на последний известный t (backlog)
            if journal.events:
                last_t = journal.events[-1].ts
                payload = journal.scene_state_payload(last_t)
                self._write_sse(payload)

            # Tail: новые diary события → пересчёт S(t)
            while True:
                new_events, offset = diary_bus.read_file_since(offset, "diary")
                if new_events:
                    new_journal = EventJournal.from_diary_events(new_events)
                    for e in new_journal.events:
                        payload = journal.scene_state_payload(e.ts)
                        try:
                            self._write_sse(payload)
                        except (BrokenPipeError, ConnectionResetError, OSError):
                            return
                    # Обновить journal для учёта новых событий в свертке
                    journal = EventJournal.from_diary_events(
                        list(diary_bus.read_file_backlog("diary"))
                    )
                else:
                    try:
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        break
                time.sleep(0.3)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return

    def _serve_warzone_scene_at(self, t: float):
        """WIRE-WZ: точечный S(t) + state_hash (seek / инвариант 100/100)."""
        from warzone.event_journal import EventJournal

        backlog = list(diary_bus.read_file_backlog("diary"))
        journal = EventJournal.from_diary_events(backlog)
        payload = journal.scene_state_payload(t)
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ── PERS-B1: Run Registry API handlers ──

    def _serve_runs_list(self, *, limit=50, offset=0, status_f="", check_id="", sort="-created_at"):
        try:
            from api.runs_api import handle_list_runs
            data = handle_list_runs(limit=limit, offset=offset,
                                    status=status_f, check_id=check_id, sort=sort)
        except Exception as exc:
            self._json_error(500, "runs_list_failed")
            return
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_run_detail(self, run_id: str):
        try:
            from api.runs_api import handle_get_run
            data = handle_get_run(run_id)
        except Exception as exc:
            self._json_error(500, "run_detail_failed")
            return
        status = 200 if data.get("ok") else 404
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ── PERS-B4: Run events ──

    def _serve_run_events(self, run_id: str):
        try:
            from api.runs_api import handle_get_run_events
            data = handle_get_run_events(run_id)
        except Exception:
            self._json_error(500, "run_events_failed")
            return
        status = 200 if data.get("ok") else 404
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ── PERS-B4: Live stream SSE ──

    def _serve_live_stream_sse(self):
        """SSE-стрим статуса активного прогона. На каждое обновление run_records
        клиент получает текущий статус + последние evidence."""
        from api.runs_api import handle_get_run, handle_get_run_events
        from models.db import get_session
        from models.run_record import RunRecord

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self._cors_headers()
        self.end_headers()

        last_count = 0
        while True:
            try:
                s = get_session()
                total = s.query(RunRecord).count()
                s.close()
            except Exception:
                total = last_count

            if total != last_count:
                last_count = total
                payload = {
                    "type": "live_stream",
                    "total_runs": total,
                    "active_runs": _count_active_runs(),
                }
                self._write_sse(payload)
            else:
                self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()

            time.sleep(2)

    # ── PERS-B4: Summary trend ──

    def _serve_summary_trend(self, days: int = 30):
        try:
            from api.runs_api import handle_get_trend
            data = handle_get_trend(days=days)
        except Exception:
            self._json_error(500, "trend_failed")
            return
        # LIVE-SUMMARY-TREND-MEMORY: кодирование/отдача не должны ронять shell.
        try:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        except (MemoryError, RecursionError, ValueError, TypeError):
            self._json_error(500, "trend_too_large")
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionError, OSError):
            return

    def _serve_run_evidence(self, run_id: str):
        """PERS-B5: evidence proxy — список артефактов прогона с presigned URLs."""
        try:
            from api.runs_api import handle_get_run_evidence
            data = handle_get_run_evidence(run_id)
        except Exception:
            # Fallback: reports/ директория (Pure Box без PG)
            data = _fallback_run_evidence(run_id)
        status = 200 if data.get("ok") else 404
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)


def _fallback_run_evidence(run_id: str) -> dict:
    """PERS-B5 fallback: evidence из reports/ когда PG/MinIO не готовы."""
    reports_dir = Path(__file__).resolve().parents[1] / "reports"
    run_dir = reports_dir / run_id
    if not run_dir.is_dir():
        return {"ok": False, "error": f"run {run_id} not found"}
    items = []
    for fpath in sorted(run_dir.rglob("*")):
        if not fpath.is_file():
            continue
        rel = str(fpath.relative_to(reports_dir))
        kind: str
        if fpath.suffix in (".mp4", ".webm"):
            kind = "video"
        elif fpath.suffix in (".png", ".jpg"):
            kind = "screenshot"
        elif fpath.suffix == ".har":
            kind = "har"
        elif fpath.suffix in (".json", ".html", ".xml", ".txt"):
            kind = "report"
        else:
            kind = "other"
        import hashlib
        sha = hashlib.sha256(fpath.read_bytes()).hexdigest()[:16]
        items.append({
            "id": f"ev-{run_id}-{fpath.stem}",
            "runId": run_id,
            "kind": kind,
            "label": rel,
            "sha256": sha,
            "sizeBytes": fpath.stat().st_size,
            "createdAt": _time_module.strftime("%Y-%m-%dT%H:%M:%SZ", _time_module.gmtime(fpath.stat().st_mtime)),
            "localPath": str(fpath),
            "presignedUrl": "",
        })
    return {"ok": True, "items": items}


# ── PERS-B4: helper count ──

def _count_active_runs() -> int:
    """Best-effort подсчёт активных запусков (running status)."""
    try:
        from models.db import get_session
        from models.run_record import RunRecord
        s = get_session()
        count = s.query(RunRecord).filter(RunRecord.status == "running").count()
        s.close()
        return count
    except Exception:
        return 0



# ── PERS-B4: helper count ──

def _count_active_runs() -> int:
    """Best-effort подсчёт активных запусков (running status)."""
    try:
        from models.db import get_session
        from models.run_record import RunRecord
        s = get_session()
        count = s.query(RunRecord).filter(RunRecord.status == "running").count()
        s.close()
        return count
    except Exception:
        return 0

def build_scene_graph_from_wired(wired: dict) -> dict[str, list]:
    """B-6: извлечь ноды и рёбра боевой сцены из wired манифеста."""
    import hashlib
    nodes, edges = [], []
    def _nid(prefix, raw): return hashlib.sha256(f"{prefix}:{raw}".encode()).hexdigest()[:12]
    suites = wired.get("test_suites") if isinstance(wired, dict) else getattr(wired, "test_suites", None)
    if not suites:
        return {"nodes": nodes, "edges": edges}

    # ── CF-B3: Fuzzer API handlers ──

    def _serve_fuzzer_status(self):
        """GET /api/fuzzer/status — текущее состояние фаззера."""
        from fuzzer.findings import _LAST_FUZZ_RESULT

        result = _LAST_FUZZ_RESULT if _LAST_FUZZ_RESULT else {"status": "idle", "findings": 0}
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_fuzzer_findings(self, limit: int = 100, severity: str = ""):
        """GET /api/fuzzer/findings — список находок."""
        from fuzzer.findings import _LAST_FINDINGS

        findings = list(_LAST_FINDINGS)
        if severity:
            findings = [f for f in findings if f.get("severity") == severity]
        findings = findings[:limit]

        body = json.dumps({
            "total": len(findings),
            "findings": findings,
        }, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_fuzzer_findings_sse(self):
        """GET /api/fuzzer/findings/sse — SSE finding.created поток."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        # Отдать существующие находки как backlog
        from fuzzer.findings import _LAST_FINDINGS
        for finding in list(_LAST_FINDINGS):
            event = {"type": "finding.created", "finding": finding}
            self._write_sse(event)

        offset = diary_bus.file_size()
        keepalive_every = 50
        idle_ticks = 0
        try:
            while True:
                new_events, offset = diary_bus.read_file_since(offset, "diary")
                if new_events:
                    idle_ticks = 0
                    for ev in new_events:
                        if ev.get("kind", "").startswith("FINDING") or ev.get("kind", "").startswith("finding."):
                            try:
                                self._write_sse(ev)
                            except (BrokenPipeError, ConnectionResetError, OSError):
                                return
                else:
                    idle_ticks += 1
                    if idle_ticks >= keepalive_every:
                        idle_ticks = 0
                        try:
                            self.wfile.write(b": keepalive\n\n")
                            self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError, OSError):
                            break
                time.sleep(0.3)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return
    si = suites if isinstance(suites, dict) else suites.model_dump() if hasattr(suites, "model_dump") else {}
    imports = si.get("imports") or []
    pages = si.get("pages") or {}
    modules = si.get("test_data_constructor") or []
    # Imports → data_module nodes
    for imp in imports:
        if isinstance(imp, dict) and imp.get("kind") == "data_file":
            aid = _nid("data", imp.get("path", ""))
            nodes.append({"id": aid, "type": "data_module", "label": imp.get("as", "data"), "status": "idle", "position": {"x": -300, "y": len(nodes) * 100}})
    # Pages → page_model nodes
    for pid, pdata in (pages.items() if isinstance(pages, dict) else []):
        nid = _nid("page", str(pid))
        label = pdata.get("title", pid) if isinstance(pdata, dict) else str(pid)
        nodes.append({"id": nid, "type": "page_model", "label": label, "status": "idle", "position": {"x": 0, "y": len(nodes) * 130}})
    # Modules
    fuzz_count = conn_count = 0
    for mod in modules:
        if not isinstance(mod, dict):
            continue
        mid = mod.get("id", "")
        mtype = str(mod.get("module_type") or "")
        fields = mod.get("fuzzing_fields") or mod.get("connector_fields") or mod.get("data_storage_fields") or {}
        if isinstance(fields, dict):
            target = fields.get("target_url") or fields.get("prom_url") or fields.get("dsn") or ""
        else:
            target = ""
        if "fuzzing_fields" in mod or "Fuzzer" in mtype:
            nid = _nid("fuzz", str(mid))
            nodes.append({"id": nid, "type": "fuzzer", "label": str(mod.get("label") or mid), "status": "idle", "position": {"x": 300, "y": fuzz_count * 130}})
            fuzz_count += 1
            if target:
                edges.append({"id": _nid("edge", f"fuzz-{mid}"), "type": "dependency", "source": nid, "target": target[:48]})
        elif "connector_fields" in mod or "Коннектор" in mtype:
            nid = _nid("conn", str(mid))
            nodes.append({"id": nid, "type": "connector", "label": str(mod.get("label") or mid), "status": "idle", "position": {"x": 600, "y": conn_count * 130}})
            conn_count += 1
        elif "data_storage_fields" in mod:
            nid = _nid("data", str(mid))
            nodes.append({"id": nid, "type": "data_module", "label": str(mod.get("label") or mid), "status": "idle", "position": {"x": -300, "y": (len(nodes) + 1) * 100}})
    # Edges: page→fuzzer, fuzzer→connector, data→page
    for node in nodes:
        if node["type"] == "fuzzer":
            pages_near = [n for n in nodes if n["type"] == "page_model"]
            if pages_near:
                edges.append({"id": _nid("edge", f"page-fuzz-{node['id']}"), "type": "fuzz_target", "source": pages_near[0]["id"], "target": node["id"]})
    return {"nodes": nodes, "edges": edges}


def start_live_server(session_name: str = "") -> Optional[str]:
    """
    Start Live HTTP if enabled. Returns public URL or None when disabled.
    If bind fails (port busy), log and return the URL anyway — diary file still works.
    """
    global _server, _thread, _owns_server

    if not live_enabled():
        logger.info("PK Live disabled (PK_LIVE=0)")
        return None

    url = live_url()
    with _lock:
        if _server is not None:
            # Shell up only — run status (running/waiting) is owned by controller / idle.
            diary_bus.set_meta(live_url=url)
            if session_name:
                diary_bus.set_meta(session_name=session_name)
            return url

        port = live_port()
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), _LiveHandler)
        except OSError as e:
            logger.info(
                "PK Live already on 127.0.0.1:%s (%s) — diary file only; open %s",
                port,
                e,
                url,
            )
            diary_bus.set_meta(
                live_url=url,
                session_name=session_name or diary_bus.get_meta().get("session_name") or "",
            )
            _owns_server = False
            return url

        thread = threading.Thread(
            target=server.serve_forever,
            name="pk-live-http",
            daemon=True,
        )
        _server = server
        _thread = thread
        _owns_server = True
        thread.start()

        diary_bus.set_meta(
            live_url=url,
            session_name=session_name or diary_bus.get_meta().get("session_name") or "",
        )
        logger.info("PK Live diary+VNC: %s", url)
        return url


def handle_run_ended(
    run_id: str = "",
    filter_preset: str = "all",
) -> dict:
    """Shell-side run_ended: snapshot diary, keep HTTP up, status=waiting."""
    snap = diary_bus.export_diary_snapshot(
        run_id=run_id,
        filter_preset=filter_preset,
    )
    diary_bus.set_meta(status="waiting")
    return snap


def _filter_apps_by_caller(
    apps: list,
    caller_id: str,
) -> list:
    """MH-7: отфильтровать apps → только instance'ы заданного владельца.
    Убрать пустые deploy и apps без instance'ов.
    """
    result = []
    for app in apps:
        deploys_out = []
        for deploy in (app.get("deploys") or []):
            insts = [
                i
                for i in (deploy.get("instances") or [])
                if str(i.get("owner") or "").strip() == caller_id
            ]
            if insts:
                deploys_out.append({**deploy, "instances": insts})
        if deploys_out:
            result.append({**app, "deploys": deploys_out})
    return result


def _parse_ci_exit_code(raw: Any) -> Optional[int]:
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError) as e:
        raise ValueError("exit_code must be int") from e


def _ci_str(payload: dict, *keys: str) -> str:
    for key in keys:
        if key in payload and payload[key] is not None:
            return str(payload[key]).strip()
    return ""


def _normalize_ci_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    phase = _ci_str(payload, "phase").lower()
    conclusion_raw = payload.get("conclusion")
    conclusion = (
        "" if conclusion_raw is None else str(conclusion_raw).strip().lower()
    )
    job_name = _ci_str(payload, "job_name")
    job_description = _ci_str(payload, "job_description")
    job_url = _ci_str(payload, "job_url", "html_url")
    html_url = _ci_str(payload, "html_url") or job_url
    gate = _ci_str(payload, "gate").lower()
    exit_code = _parse_ci_exit_code(payload.get("exit_code"))
    risk_hints = payload.get("risk_hints")
    if risk_hints is not None and not isinstance(risk_hints, dict):
        raise ValueError("risk_hints must be object")
    recommendations = payload.get("recommendations")
    if recommendations is not None and not isinstance(recommendations, list):
        raise ValueError("recommendations must be array")
    if not phase and exit_code is None and not conclusion and not job_name:
        raise ValueError("need phase, conclusion, exit_code, or job_name")
    # Новый running/queued сбрасывает residual hints прошлого прогона
    # (set_meta не умеет None → иначе pass_watch «липнет» в waiting room).
    if phase in ("queued", "in_progress"):
        if risk_hints is None:
            risk_hints = {}
        if recommendations is None:
            recommendations = []
    return {
        "phase": phase,
        "conclusion": conclusion,
        "job_name": job_name,
        "job_description": job_description,
        "job_url": job_url,
        "html_url": html_url,
        "gate": gate,
        "exit_code": exit_code,
        "risk_hints": risk_hints,
        "recommendations": recommendations,
    }


def apply_ci_status(payload: dict) -> dict:
    """Persist CI fields into Live meta + derive ci_verdict."""
    from utils.pipeline_verdict import derive_pipeline_verdict

    norm = _normalize_ci_payload(payload)
    verdict = derive_pipeline_verdict(
        phase=norm["phase"],
        conclusion=norm["conclusion"],
        exit_code=norm["exit_code"],
        gate=norm["gate"],
        risk_hints=norm["risk_hints"],
    )
    meta_kwargs = {
        "ci_phase": norm["phase"] or None,
        "ci_conclusion": norm["conclusion"] or None,
        "ci_job_name": norm["job_name"] or None,
        "ci_job_description": norm["job_description"] or None,
        "ci_job_url": norm["job_url"] or None,
        "ci_html_url": norm["html_url"] or None,
        "ci_exit_code": norm["exit_code"],
        "ci_gate": norm["gate"] or None,
        "ci_verdict": verdict,
        "ci_updated_at": time.time(),
        "ci_risk_hints": norm["risk_hints"],
        "ci_recommendations": norm["recommendations"],
    }
    # set_meta skips None — drop Nones explicitly for clear updates
    clean = {k: v for k, v in meta_kwargs.items() if v is not None}
    diary_bus.set_meta(**clean)
    return {
        "verdict": verdict,
        "ci_job_name": norm["job_name"],
        "ci_job_url": norm["job_url"],
        "ci_exit_code": norm["exit_code"],
        "ci_gate": norm["gate"],
    }


def notify_results_hook(service: str, report_url: str, **extra) -> Optional[dict]:
    """
    RES-H: Runner → Live POST /api/results/hooks (HTTP), fallback local file bus.
    Prefer HTTP so idle Live process owns results_hooks.json.
    """
    svc = (service or "").strip().lower()
    url = (report_url or "").strip()
    if not svc or not url:
        return None
    payload = {"service": svc, "report_url": url}
    for key, val in extra.items():
        if val is not None:
            payload[key] = val

    if live_enabled():
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        http_url = live_url().rstrip("/") + "/api/results/hooks"
        try:
            from urllib.error import HTTPError, URLError
            from urllib.request import Request, urlopen

            req = Request(
                http_url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, dict) and data.get("ok"):
                return data
            logger.warning("PK Live results/hooks HTTP unexpected: %s", str(data)[:200])
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
            logger.info("PK Live results/hooks HTTP miss (%s) — local file bus", e)

    try:
        hooks = diary_bus.set_results_hook(svc, url, **extra)
        return {"ok": True, "hooks": hooks}
    except (ValueError, OSError) as e:
        logger.warning("PK Live results/hooks local push failed: %s", e)
        return None


def notify_ci_status(**fields) -> Optional[dict]:
    """
    Runner → Live POST /api/ci/status (HTTP), fallback local apply_ci_status.
    Does not shut down Live HTTP.
    """
    if not live_enabled():
        return None
    payload = {k: v for k, v in fields.items() if v is not None}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    url = live_url().rstrip("/") + "/api/ci/status"
    try:
        from urllib.error import HTTPError, URLError
        from urllib.request import Request, urlopen

        req = Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if isinstance(data, dict) and data.get("ok"):
            return data
        logger.warning("PK Live ci/status HTTP unexpected: %s", str(data)[:200])
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
        logger.info("PK Live ci/status HTTP miss (%s) — local apply", e)

    try:
        result = apply_ci_status(payload)
        return {"ok": True, **result}
    except (ValueError, OSError) as e:
        logger.warning("PK Live ci/status local apply failed: %s", e)
        return None


def notify_live_run_ended(
    run_id: str = "",
    filter_preset: str = "all",
) -> Optional[dict]:
    """
    Runner signal to Live shell. Prefer HTTP (idle owns the port); fallback to
    in-process snapshot when the shell HTTP is unreachable.
    Does not shut down Live HTTP.
    """
    if not live_enabled():
        return None
    owner = None
    try:
        owner = diary_bus.get_meta().get("owner_user_id")
    except Exception:
        owner = None
    if not owner:
        try:
            from utils.live_pers_acl import resolve_run_owner_user_id

            owner = resolve_run_owner_user_id()
        except Exception:
            owner = None
    event_body: dict[str, Any] = {
        "event": "run_ended",
        "run_id": run_id or "",
        "filter_preset": filter_preset or "all",
    }
    if owner:
        event_body["owner_user_id"] = owner
    payload = json.dumps(event_body, ensure_ascii=False).encode("utf-8")
    url = live_url().rstrip("/") + "/api/run/event"
    try:
        from urllib.error import HTTPError, URLError
        from urllib.request import Request, urlopen

        req = Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8")
        data = json.loads(body)
        if isinstance(data, dict) and data.get("ok"):
            publish_recording_finalized(run_id)
            return data
        logger.warning("PK Live run_ended HTTP unexpected: %s", body[:200])
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
        logger.info("PK Live run_ended HTTP miss (%s) — local snapshot", e)

    try:
        result = handle_run_ended(run_id=run_id, filter_preset=filter_preset)
        publish_recording_finalized(run_id)
        return {"ok": True, **result}
    except (OSError, ValueError) as e:
        logger.warning("PK Live run_ended local export failed: %s", e)
        diary_bus.set_meta(status="waiting")
        return None


def publish_recording_finalized(run_id: str = "") -> None:
    """B-2/B-8: сигнал готовности видео в SSE (recording_ready + path)."""
    try:
        from utils.run_recording import find_video_for_run
        path = find_video_for_run(run_id)
    except Exception:
        path = None
    if path is None:
        return
    try:
        from utils.diary_bus import append, _active_run_id
        recording_path = str(path)
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        rid = run_id or _active_run_id()
        append("diary", {
            "kind": "RECORDING_FINALIZED",
            "text": f"Видео готово: {path.name} ({size} bytes)",
            "run_id": rid,
            "recording_ready": True,
            "recording_path": recording_path,
            "recording_size": size,
        })
    except Exception as exc:
        logger.info("RECORDING_FINALIZED skip: %s", exc)


def stop_live_server() -> None:
    """
    Tear down HTTP only for idle-wrapper exit / unit fixtures.
    Product run end must use notify_live_run_ended — do not kill the shell.
    """
    global _server, _thread, _owns_server
    with _lock:
        server = _server if _owns_server else None
        if _owns_server:
            _server = None
            _thread = None
            _owns_server = False
    if server is None:
        return
    try:
        server.shutdown()
    except Exception as e:
        logger.debug("live_server shutdown: %s", e)
    try:
        server.server_close()
    except Exception:
        pass
    diary_bus.set_meta(status="finished")
    logger.info("PK Live stopped")
