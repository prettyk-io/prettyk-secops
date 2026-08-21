# -*- coding: utf-8 -*-
"""
Bus for [KDT-DIARY] → Live SSE.

In-process queue for the writer process; NDJSON file so a separate idle Live
process can tail the same stream.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import os
import threading
import time
from collections import deque
from pathlib import Path
from queue import Full, Queue
from typing import Any, Deque, Dict, List, Optional, Tuple

from utils.paths import (
    DIARY_NDJSON,
    LIVE_DIR,
    LIVE_EXPORTS_DIR,
    LIVE_META_JSON,
    RESULTS_HOOKS_JSON,
    ensure_live_dir,
    ensure_live_exports_dir,
)

# Без потолка: длинные прогоны + Live reconnect должны видеть всю историю файла.
_lock = threading.RLock()
_buffer: Deque[Dict[str, Any]] = deque()
_subscribers: List[Tuple[str, Queue]] = []  # (channel_filter, queue)
_meta: Dict[str, Any] = {
    "session_name": "",
    "novnc_url": "",
    "browser_type": "",
    "status": "idle",
    "live_url": "",
}
_file_lock = threading.Lock()


def _channel_match(wanted: str, event_channel: str) -> bool:
    w = (wanted or "all").strip().lower()
    if w in ("", "all"):
        return True
    return w == (event_channel or "diary").strip().lower()


def _active_run_id() -> str:
    """KDT_RUN_ID из окружения дочернего процесса (main.py).
    Если не задан — пустая строка; publish не упадёт."""
    return (pk_env("RUN_ID") or "").strip()


def _redact_live_text(text: str) -> str:
    """L-3: не светить Bearer/JWT/password в NDJSON/SSE (паритет run_package)."""
    try:
        from utils.run_package import redact_diary_text

        return redact_diary_text(str(text or ""))
    except Exception:  # noqa: BLE001 — bus never fails publish
        return str(text or "")


def publish(kind: str, text: str, channel: str = "diary", pretty: str = "") -> None:
    run_id = _active_run_id()
    event = {
        "channel": (channel or "diary").strip().lower() or "diary",
        "kind": str(kind or "NOTE").strip().upper(),
        "text": _redact_live_text(text),
        "ts": time.time(),
    }
    if pretty:
        event["pretty"] = _redact_live_text(pretty)
    if run_id:
        event["run_id"] = run_id
    _store_event(event)


def append(channel: str, payload: str | Dict[str, Any]) -> None:
    """Append a structured event without flattening its telemetry fields.

    Telemetry producers need the normal diary persistence/SSE path, while the
    event envelope itself must remain intact for graph consumers.
    """
    if isinstance(payload, str):
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            event = {"text": payload}
    else:
        event = dict(payload)
    event.setdefault("channel", (channel or "diary").strip().lower() or "diary")
    event.setdefault("ts", time.time())
    event.setdefault("kind", "NOTE")
    event.setdefault("text", str(event.get("kind") or ""))
    _store_event(event)


def _store_event(event: Dict[str, Any]) -> None:
    ensure_live_dir()
    for attempt in range(10):
        try:
            with _file_lock:
                with open(DIARY_NDJSON, "a", encoding="utf-8") as fh:
                    fh.write(json.dumps(event, ensure_ascii=False) + "\n")
            break
        except OSError:
            if attempt == 9:
                raise
            time.sleep(0.15)
    with _lock:
        _buffer.append(event)
        subs = list(_subscribers)
    for filt, q in subs:
        if not _channel_match(filt, event["channel"]):
            continue
        try:
            q.put_nowait(event)
        except Full:
            pass
    try:
        from utils.log_cuts import feed_event

        feed_event(event)
    except Exception:
        pass


def subscribe(channel: str = "all") -> Tuple[List[Dict[str, Any]], Queue]:
    """Backlog from file (cross-process) + in-process queue for new events."""
    filt = (channel or "all").strip().lower() or "all"
    backlog = read_file_backlog(filt)
    q: Queue = Queue(maxsize=1000)
    with _lock:
        # Also merge any in-memory events not yet flushed (same process, empty file edge).
        seen = {(e.get("ts"), e.get("kind"), e.get("text"), e.get("channel")) for e in backlog}
        for e in _buffer:
            if not _channel_match(filt, e.get("channel", "diary")):
                continue
            key = (e.get("ts"), e.get("kind"), e.get("text"), e.get("channel"))
            if key not in seen:
                backlog.append(e)
                seen.add(key)
        _subscribers.append((filt, q))
    return backlog, q


def unsubscribe(q: Queue) -> None:
    with _lock:
        _subscribers[:] = [(f, qq) for f, qq in _subscribers if qq is not q]


def read_file_backlog(channel: str = "all") -> List[Dict[str, Any]]:
    path = Path(DIARY_NDJSON)
    if not path.is_file():
        return []
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return []
    events: List[Dict[str, Any]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if _channel_match(channel, ev.get("channel", "diary")):
            events.append(ev)
    return events


def file_size() -> int:
    path = Path(DIARY_NDJSON)
    try:
        return path.stat().st_size if path.is_file() else 0
    except OSError:
        return 0


def read_file_since(offset: int, channel: str = "all") -> Tuple[List[Dict[str, Any]], int]:
    """Read new NDJSON lines from byte offset; return (events, new_offset)."""
    path = Path(DIARY_NDJSON)
    if not path.is_file():
        return [], 0
    try:
        size = path.stat().st_size
        if offset > size:
            offset = 0
        with open(path, "r", encoding="utf-8") as fh:
            fh.seek(offset)
            chunk = fh.read()
            new_offset = fh.tell()
    except OSError:
        return [], offset
    events: List[Dict[str, Any]] = []
    for line in chunk.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if _channel_match(channel, ev.get("channel", "diary")):
            events.append(ev)
    return events, new_offset


def set_meta(**kwargs: Any) -> None:
    """
    Merge patch into Live meta.

    Cross-process: playground/controller may write generate_act to disk while
    Live idle holds an older in-memory snapshot — pull unknown disk keys in
    before applying kwargs so notify_ci does not wipe act flags.
    """
    with _lock:
        disk = _read_meta_file() or {}
        for key, value in disk.items():
            if key not in _meta and key not in kwargs:
                _meta[key] = value
        for key, value in kwargs.items():
            if value is not None:
                _meta[key] = value
        snapshot = dict(_meta)
    _write_meta_file(snapshot)


def get_meta() -> Dict[str, Any]:
    """Prefer on-disk meta (other process may have updated it)."""
    disk = _read_meta_file()
    with _lock:
        mem = dict(_meta)
    if not disk:
        return mem
    # Disk wins for session fields when status is running.
    out = dict(mem)
    out.update(disk)
    return out


def _write_meta_file(snapshot: Dict[str, Any]) -> None:
    try:
        ensure_live_dir()
        LIVE_META_JSON.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=0),
            encoding="utf-8",
        )
    except OSError:
        pass


def _read_meta_file() -> Optional[Dict[str, Any]]:
    try:
        if not LIVE_META_JSON.is_file():
            return None
        return json.loads(LIVE_META_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def is_http_report_url(url: Any) -> bool:
    """Glow / persist only absolute http(s) report links (reject javascript:, relative)."""
    if not isinstance(url, str):
        return False
    cleaned = url.strip()
    if not cleaned:
        return False
    lower = cleaned.lower()
    return lower.startswith("http://") or lower.startswith("https://")


def get_results_hooks(run_id: Optional[str] = None) -> Dict[str, Any]:
    """Report URLs pushed by Allure / DefectDojo / ZAP summary (cross-process file).

    When run_id is given, filter entries to only hooks matching that run.
    An entry matches if it has no run_id (backwards-compat legacy), or its run_id
    equals the requested one.  check_id is NOT used as a secondary filter —
    one check may have many runs.
    """
    empty = {"allure": None, "dojo": None, "zap": None}
    try:
        if not RESULTS_HOOKS_JSON.is_file():
            return dict(empty)
        raw = json.loads(RESULTS_HOOKS_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return dict(empty)
    if not isinstance(raw, dict):
        return dict(empty)
    result = {
        "allure": _normalize_hook_entry(raw.get("allure")),
        "dojo": _normalize_hook_entry(raw.get("dojo")),
        "zap": _normalize_hook_entry(raw.get("zap")),
    }
    rid = (run_id or "").strip()
    if not rid:
        return result
    for key in ("allure", "dojo", "zap"):
        entry = result.get(key)
        if isinstance(entry, dict):
            entry_rid = str(entry.get("run_id") or "").strip()
            if entry_rid and entry_rid != rid:
                result[key] = None
    return result


def clear_results_hooks() -> Dict[str, Any]:
    """Reset report hooks (lab demo / re-smoke)."""
    ensure_live_dir()
    empty = {"allure": None, "dojo": None, "zap": None}
    with _file_lock:
        RESULTS_HOOKS_JSON.write_text(
            json.dumps(empty, ensure_ascii=False, indent=0),
            encoding="utf-8",
        )
    return get_results_hooks()


def set_results_hook(service: str, report_url: str, **extra: Any) -> Dict[str, Any]:
    """
    Persist a fresh report URL for Results tiles.
    service: allure | dojo | zap
    """
    key = (service or "").strip().lower()
    if key not in ("allure", "dojo", "zap"):
        raise ValueError("service must be allure, dojo, or zap")
    url = (report_url or "").strip()
    if not url:
        raise ValueError("report_url is required")
    if not is_http_report_url(url):
        raise ValueError("report_url must be an absolute http(s) URL")
    entry: Dict[str, Any] = {
        "report_url": url,
        "updated_at": time.time(),
    }
    for ek, ev in extra.items():
        if ev is not None:
            entry[ek] = ev
    ensure_live_dir()
    with _file_lock:
        # Merge extras: URL-only push must not wipe stats/collapse for акт.
        try:
            if RESULTS_HOOKS_JSON.is_file():
                disk = json.loads(RESULTS_HOOKS_JSON.read_text(encoding="utf-8"))
            else:
                disk = {}
        except (OSError, json.JSONDecodeError):
            disk = {}
        if not isinstance(disk, dict):
            disk = {}
        current = {
            "allure": disk.get("allure"),
            "dojo": disk.get("dojo"),
            "zap": disk.get("zap"),
        }
        prev = current.get(key)
        if isinstance(prev, dict):
            merged = dict(prev)
            merged.update(entry)
            current[key] = merged
        else:
            current[key] = entry
        RESULTS_HOOKS_JSON.write_text(
            json.dumps(current, ensure_ascii=False, indent=0),
            encoding="utf-8",
        )
    return get_results_hooks()


def _normalize_hook_entry(value: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(value, dict):
        return None
    url = value.get("report_url")
    if not is_http_report_url(url):
        return None
    out = dict(value)
    out["report_url"] = str(url).strip()
    return out


_SIGNAL_PRESET_KINDS = frozenset(
    {
        "ERROR",
        "HIGH",
        "WARN",
        "WARNING",
        "FAIL",
        "FAILED",
        "GATE",
        "CI",
        "NOTE",
        "INFO",
        "STEP",
        "SCAN",
        "FUZZ",
        "CUT",
        "ФАЗЗИНГ",
        "HEAL",
        "HEAL_MISS",
        "LABEL",
        "LABEL_MISS",
        "LABEL_AMBIGUOUS",
        "GATHER",
    }
)


def _filter_events_for_preset(
    events: List[Dict[str, Any]], filter_preset: str
) -> List[Dict[str, Any]]:
    """Built-in presets (паритет run_journal / Live UI L-1): all · errors · signal."""
    preset = (filter_preset or "all").strip().lower() or "all"
    if preset == "all":
        return list(events)
    if preset == "errors":
        return [
            ev
            for ev in events
            if str(ev.get("kind") or "").strip().upper() in ("ERROR", "HIGH")
        ]
    if preset == "signal":
        return [
            ev
            for ev in events
            if str(ev.get("kind") or "").strip().upper() in _SIGNAL_PRESET_KINDS
        ]
    raise ValueError(f"unknown filter_preset: {filter_preset!r}")


def _safe_export_stem(run_id: str) -> str:
    raw = (run_id or "").strip() or f"run-{int(time.time())}"
    cleaned = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in raw)
    cleaned = cleaned.strip("_") or f"run-{int(time.time())}"
    return cleaned[:120]


def export_diary_snapshot(
    run_id: str = "",
    filter_preset: str = "all",
) -> Dict[str, Any]:
    """
    Snapshot diary.ndjson for Results / RES-7 package.
    Owned by the Live shell event path — not by test teardown.
    """
    preset = (filter_preset or "all").strip().lower() or "all"
    raw_events = read_file_backlog("all")
    if run_id:
        raw_events = [e for e in raw_events if not e.get("run_id") or e.get("run_id") == run_id]
    events = _filter_events_for_preset(raw_events, preset)
    export_dir = ensure_live_exports_dir()
    stem = _safe_export_stem(run_id)
    ndjson_path = export_dir / f"{stem}.ndjson"
    sidecar_path = export_dir / f"{stem}.json"
    # Avoid clobber when same session re-exports.
    if ndjson_path.is_file():
        stamp = int(time.time())
        ndjson_path = export_dir / f"{stem}-{stamp}.ndjson"
        sidecar_path = export_dir / f"{stem}-{stamp}.json"

    lines = [json.dumps(ev, ensure_ascii=False) for ev in events]
    body = ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")
    created_at = time.time()
    sidecar = {
        "run_id": (run_id or "").strip() or stem,
        "filter_preset": preset,
        "events_count": len(events),
        "created_at": created_at,
        "ndjson": ndjson_path.name,
    }
    with _file_lock:
        ndjson_path.write_bytes(body)
        sidecar_path.write_text(
            json.dumps(sidecar, ensure_ascii=False, indent=0),
            encoding="utf-8",
        )

    export_path = str(ndjson_path.resolve())
    set_meta(
        last_export_path=export_path,
        last_export_at=created_at,
        last_export_run_id=sidecar["run_id"],
        last_export_preset=preset,
        last_export_sidecar=str(sidecar_path.resolve()),
        last_export_events_count=len(events),
    )
    return {
        "export_path": export_path,
        "sidecar_path": str(sidecar_path.resolve()),
        "events_count": len(events),
        "filter_preset": preset,
        "run_id": sidecar["run_id"],
        "created_at": created_at,
    }


def latest_export_ndjson_path() -> Optional[Path]:
    meta = get_meta()
    raw = meta.get("last_export_path")
    if isinstance(raw, str) and raw.strip():
        path = Path(raw.strip())
        if path.is_file():
            return path
    export_dir = Path(LIVE_EXPORTS_DIR)
    if not export_dir.is_dir():
        return None
    candidates = sorted(
        export_dir.glob("*.ndjson"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def export_ndjson_path_for_run_id(run_id: str) -> Optional[Path]:
    """Найти экспорт NDJSON по конкретному run_id (stem или sidecar.json)."""
    if not run_id:
        return None
    export_dir = Path(LIVE_EXPORTS_DIR)
    if not export_dir.is_dir():
        return None
    stem = _safe_export_stem(run_id)
    # Точное совпадение по имени файла
    candidate = export_dir / f"{stem}.ndjson"
    if candidate.is_file():
        return candidate
    # Совпадение по sidecar (run_id внутри .json)
    for sidecar in export_dir.glob("*.json"):
        try:
            data = json.loads(sidecar.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict) and data.get("run_id") == run_id:
            ndjson = export_dir / f"{sidecar.stem}.ndjson"
            if ndjson.is_file():
                return ndjson
    # Суффиксальный поиск (run_id с timestamp-префиксом при re-export)
    pattern = f"*{stem}*.ndjson"
    candidates = sorted(
        export_dir.glob(pattern),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def clear_ci_meta() -> None:
    """Сбросить CI/runtime поля в мете перед новым прогоном (старый вердикт не кешируется)."""
    ci_keys = {
        "ci_job_name",
        "ci_job_description",
        "ci_job_url",
        "ci_html_url",
        "ci_phase",
        "ci_verdict",
        "ci_gate",
        "ci_conclusion",
        "ci_exit_code",
        "ci_updated_at",
        "ci_recommendations",
        "ci_risk_hints",
        "scenario_outcomes",
        "suites_complete",
        "last_export_path",
        "last_export_at",
        "last_export_run_id",
        "last_export_preset",
        "last_export_sidecar",
        "last_export_events_count",
        "last_run_summary_path",
        "last_run_summary_at",
        "last_run_summary_exit",
        "last_run_summary_gate",
        "executive_class",
        "executive_source",
        "owner_user_id",
        "generate_act",
        "assessment_purpose",
        "debug_mode",
        "debug_paused",
        "debug_timers_suppressed",
        "requested_run_id",
        "run_id",
        "pers_redacted",
        "admission_counts",
        "dojo_stats",
        "counts_source",
        "filter_audit",
        "admission_evidence_error",
        "gate_policy_source",
        "finding_collapse",
    }
    with _lock:
        for k in ci_keys:
            _meta.pop(k, None)
    _write_meta_file(dict(_meta))


def clear() -> None:
    ensure_live_dir()
    with _file_lock:
        try:
            DIARY_NDJSON.write_text("", encoding="utf-8")
        except OSError:
            pass
        try:
            if RESULTS_HOOKS_JSON.is_file():
                RESULTS_HOOKS_JSON.unlink()
        except OSError:
            pass
    with _lock:
        _buffer.clear()
        _meta.clear()
        _meta.update(
            {
                "session_name": "",
                "novnc_url": "",
                "browser_type": "",
                "status": "idle",
                "live_url": "",
            }
        )
        _subscribers.clear()
    _write_meta_file(dict(_meta))
    try:
        from utils.log_cuts import clear as log_cuts_clear

        log_cuts_clear()
    except Exception:
        pass


def get_recent_logs(limit: int = 100) -> list[str]:
    """Return the last N log text lines from buffer + file backlog."""
    events = read_file_backlog("all")
    lines: list[str] = []
    for ev in events:
        text = str(ev.get("text") or "").strip()
        if text:
            lines.append(text)
    return lines[-limit:] if limit > 0 else lines

