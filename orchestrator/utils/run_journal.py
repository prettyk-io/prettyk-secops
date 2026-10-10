# -*- coding: utf-8 -*-
"""
RES-3: журнал прогона поверх Live export / diary (не клон Allure).

Канон: docs/internal/monitor-evidence.md
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

PathLike = Union[str, Path]

_SIGNAL_KINDS = frozenset(
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
        "HEAL",
        "HEAL_MISS",
        "LABEL",
        "LABEL_MISS",
        "LABEL_AMBIGUOUS",
        "GATHER",
    }
)


def _as_event(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "NOTE").strip().upper() or "NOTE"
    text = str(raw.get("text") or "").strip()
    if not text and not kind:
        return None
    try:
        ts = float(raw.get("ts") or 0)
    except (TypeError, ValueError):
        ts = 0.0
    ev = {
        "ts": ts,
        "kind": kind,
        "channel": str(raw.get("channel") or "diary").strip().lower() or "diary",
        "text": text[:2000],
    }
    # MONITOR-LIVE-DEEPLINK: provenance — run_id не теряется (строгий run-фильтр
    # journal'а и клиентская идентичность).
    rid = str(raw.get("run_id") or "").strip()
    if rid:
        ev["run_id"] = rid
    pretty = str(raw.get("pretty") or "").strip()
    if pretty:
        ev["pretty"] = pretty[:400]
    return ev


def read_ndjson_events(path: PathLike) -> List[Dict[str, Any]]:
    root = Path(path)
    if not root.is_file():
        return []
    out: List[Dict[str, Any]] = []
    try:
        for line in root.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                continue
            ev = _as_event(raw)
            if ev is not None:
                out.append(ev)
    except OSError:
        return []
    return out


def filter_journal_events(
    events: List[Dict[str, Any]],
    preset: str = "all",
    *,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """
    presets:
      all     — всё (хвост limit)
      errors  — ERROR + HIGH
      signal  — operational kinds (ERROR/HIGH/GATE/CI/SCAN/…)
    """
    p = (preset or "all").strip().lower() or "all"
    rows = list(events)
    if p == "errors":
        rows = [e for e in rows if e.get("kind") in ("ERROR", "HIGH")]
    elif p == "signal":
        rows = [e for e in rows if e.get("kind") in _SIGNAL_KINDS]
    # newest last in source → keep tail
    if limit > 0 and len(rows) > limit:
        rows = rows[-limit:]
    return rows


def journal_counts(events: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for ev in events:
        kind = str(ev.get("kind") or "NOTE")
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def build_run_journal(
    *,
    events: List[Dict[str, Any]],
    preset: str = "all",
    run_id: str = "",
    source_path: str = "",
    source: str = "export",
    limit: int = 200,
) -> Dict[str, Any]:
    filtered = filter_journal_events(events, preset, limit=limit)
    return {
        "kind": "pk_run_journal",
        "version": 1,
        "built_at": time.time(),
        "run_id": (run_id or "").strip(),
        "preset": (preset or "all").strip().lower() or "all",
        "source": source,
        "source_path": source_path,
        "events_total": len(events),
        "events_shown": len(filtered),
        "counts": journal_counts(events),
        "events": filtered,
    }


def build_journal_from_export(
    path: Optional[PathLike],
    *,
    preset: str = "all",
    run_id: str = "",
    limit: int = 200,
) -> Dict[str, Any]:
    if path is None:
        return build_run_journal(
            events=[],
            preset=preset,
            run_id=run_id,
            source="none",
            limit=limit,
        )
    root = Path(path)
    events = read_ndjson_events(root)
    rid = (run_id or "").strip()
    if rid:
        # MONITOR-LIVE-DEEPLINK: архив run'а — только его события (старые
        # экспорты могли нести unscoped-legacy; честно режем при выдаче).
        events = [e for e in events if str(e.get("run_id") or "").strip() == rid]
    return build_run_journal(
        events=events,
        preset=preset,
        run_id=run_id,
        source_path=str(root.resolve()) if root.is_file() else str(root),
        source="export",
        limit=limit,
    )


def build_journal_from_live_diary(
    *,
    preset: str = "all",
    run_id: str = "",
    limit: int = 200,
) -> Dict[str, Any]:
    """Fallback when export ещё нет — читаем текущий diary.ndjson."""
    from utils import diary_bus

    events = [_as_event(e) for e in diary_bus.read_file_backlog("all")]
    clean = [e for e in events if e is not None]
    rid = (run_id or "").strip()
    if rid:
        # MONITOR-LIVE-DEEPLINK: живые события — строго этого run.
        clean = [e for e in clean if str(e.get("run_id") or "").strip() == rid]
    return build_run_journal(
        events=clean,
        preset=preset,
        run_id=run_id,
        source_path=str(getattr(diary_bus, "DIARY_NDJSON", "")),
        source="diary",
        limit=limit,
    )
