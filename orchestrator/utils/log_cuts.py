# -*- coding: utf-8 -*-
"""
Именованные нарезки логов (LOG-CUT).

НачатьЛогирование / ОкончитьЛогирование — не гасят общий diary, а копят
отфильтрованный стрим в reports/runs/<id>/log_cuts/<NAME>.log.
Канон: docs/internal/log-cuts-poc.md
"""
from __future__ import annotations
from utils.env_dual import pk_env

import os
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set

from utils.paths import LIVE_DIR, ensure_live_dir

_NAME_RE = re.compile(r"^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9_.-]{0,63}$")
_SESSION_HINTS = (
    "session_lost",
    "session_missing",
    "login",
    "logout",
    "cookie",
    "session",
    "auth",
    "войти",
    "выйти",
    "сесси",
)
_DRIVER_HINTS = (
    "webdriver|",
    "browser|",
    "драйвер",
    "webdriver:",
    "selenium",
)

DEFAULT_OPTS = ("security",)

ATOMIC_OPTS = frozenset(
    {
        "security",
        "error",
        "session",
        "driver",
        "console",
        "step",
        "perf",
        "fuzz",
        "gate",
    }
)

COMPOUND_OPTS: Dict[str, Sequence[str]] = {
    "browser": ("session", "driver", "console", "perf"),
}

_lock = threading.RLock()
_cuts: Dict[str, "LogCut"] = {}
_browser_logs_fn: Optional[Callable[[], List[Any]]] = None
_perf_logs_fn: Optional[Callable[[], List[Any]]] = None


@dataclass
class LogCut:
    name: str
    opts: Set[str]
    comment: str = ""
    started_at: float = field(default_factory=time.time)
    pretty_start: str = ""
    lines: List[str] = field(default_factory=list)
    closed: bool = False
    path: Optional[Path] = None


def set_sidecar_providers(
    *,
    browser_logs: Optional[Callable[[], List[Any]]] = None,
    perf_logs: Optional[Callable[[], List[Any]]] = None,
) -> None:
    global _browser_logs_fn, _perf_logs_fn
    _browser_logs_fn = browser_logs
    _perf_logs_fn = perf_logs


def clear() -> None:
    """Сброс открытых cuts (новый прогон). Не удаляет файлы на диске."""
    with _lock:
        _cuts.clear()


def cuts_dir() -> Path:
    raw = (pk_env("RUN_DIR") or "").strip()
    if raw:
        base = Path(raw) / "log_cuts"
    else:
        ensure_live_dir()
        base = LIVE_DIR / "log_cuts"
    base.mkdir(parents=True, exist_ok=True)
    return base


def sanitize_name(name: str) -> str:
    raw = (name or "").strip()
    if not raw or not _NAME_RE.match(raw):
        raise ValueError(
            f"Лог-нарезка: плохое имя {name!r} "
            "(буквы/цифры/._-, до 64 символов, без path-сепараторов)"
        )
    return raw


def parse_options(options: str | None) -> Set[str]:
    """CSV опций → раскрытый набор атомов. Пусто → {security}."""
    raw = (options or "").strip()
    if not raw:
        return set(DEFAULT_OPTS)
    parts = [p.strip().lower() for p in raw.replace(";", ",").split(",") if p.strip()]
    if not parts:
        return set(DEFAULT_OPTS)
    out: Set[str] = set()
    for part in parts:
        if part == "all":
            return {"all"}
        if part in COMPOUND_OPTS:
            out.update(COMPOUND_OPTS[part])
            continue
        if part not in ATOMIC_OPTS:
            raise ValueError(
                f"Лог-нарезка: неизвестная опция {part!r}. "
                f"Допустимо: {', '.join(sorted(ATOMIC_OPTS | set(COMPOUND_OPTS) | {'all'}))}"
            )
        out.add(part)
    return out or set(DEFAULT_OPTS)


def _kind(ev: Dict[str, Any]) -> str:
    k = str(ev.get("kind") or "NOTE").strip().upper()
    if k == "FUZZ":
        return "ФАЗЗИНГ"
    return k


def _text(ev: Dict[str, Any]) -> str:
    return str(ev.get("text") or "")


def _text_l(ev: Dict[str, Any]) -> str:
    return _text(ev).lower()


def _is_attack(ev: Dict[str, Any]) -> bool:
    return _text(ev).startswith("ЛогАтаки")


def _match_security(kind: str, ev: Dict[str, Any], _text_l: str) -> bool:
    return kind in {"scanner", "ФАЗЗИНГ", "HIGH", "MEDIUM"} or _is_attack(ev)


def _match_fuzz(kind: str, _ev: Dict[str, Any], text_l: str) -> bool:
    return kind == "ФАЗЗИНГ" or "fuzz" in text_l or "фазз" in text_l


def _match_console(kind: str, ev: Dict[str, Any], _text_l: str) -> bool:
    return kind == "CONSOLE" or (kind == "LOG" and not _is_attack(ev))


def _match_driver(kind: str, _ev: Dict[str, Any], text_l: str) -> bool:
    if any(h in text_l for h in _DRIVER_HINTS):
        return True
    return kind == "STEP" and (
        "нажать" in text_l or "ввести" in text_l or "открыть" in text_l
    )


_OPT_MATCHERS = (
    ("security", _match_security),
    ("fuzz", _match_fuzz),
    ("error", lambda kind, _ev, _t: kind == "ERROR"),
    ("step", lambda kind, _ev, _t: kind in {"STEP", "NEXT"}),
    ("console", _match_console),
    ("session", lambda _k, _ev, text_l: any(h in text_l for h in _SESSION_HINTS)),
    ("driver", _match_driver),
    (
        "gate",
        lambda _k, _ev, text_l: any(
            h in text_l
            for h in ("gate", "admission", "ci_verdict", "pipelineverdict", "fail_gate")
        ),
    ),
    (
        "perf",
        lambda _k, _ev, text_l: "performance" in text_l or "метрик" in text_l,
    ),
)


def match_event(ev: Dict[str, Any], opts: Set[str]) -> bool:
    if "all" in opts:
        return True
    kind = _kind(ev)
    text_l = _text_l(ev)
    for opt, matcher in _OPT_MATCHERS:
        if opt in opts and matcher(kind, ev, text_l):
            return True
    return False


def _format_line(ev: Dict[str, Any]) -> str:
    ts = ev.get("ts")
    try:
        ts_s = datetime.fromtimestamp(float(ts), tz=timezone.utc).astimezone().isoformat(
            timespec="seconds"
        )
    except (TypeError, ValueError, OSError):
        ts_s = str(ts or "")
    kind = _kind(ev)
    text = _text(ev).replace("\n", " ").strip()
    return f"{ts_s}\t{kind}\t{text}"


def feed_event(ev: Dict[str, Any]) -> None:
    """Вызывается из diary_bus.publish — копим во все открытые cuts."""
    with _lock:
        open_cuts = [c for c in _cuts.values() if not c.closed]
    if not open_cuts:
        return
    for cut in open_cuts:
        if match_event(ev, cut.opts):
            cut.lines.append(_format_line(ev))


def start_cut(
    name: str,
    options: str = "",
    comment: str = "",
) -> Path:
    clean = sanitize_name(name)
    opts = parse_options(options)
    pretty = f"НачатьЛогирование {clean}"
    if options and str(options).strip():
        pretty = f"{pretty} {str(options).strip()}"
    with _lock:
        existing = _cuts.get(clean)
        if existing and not existing.closed:
            raise ValueError(f"Лог-нарезка {clean!r} уже открыта")
        cut = LogCut(
            name=clean,
            opts=opts,
            comment=(comment or "").strip(),
            pretty_start=pretty,
        )
        _cuts[clean] = cut
    return cuts_dir() / f"{clean}.log"


def _write_sidecar(path: Path, rows: Iterable[Any], header: str) -> None:
    lines = [header]
    for row in rows:
        lines.append(str(row))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _safe_log_rows(fn) -> list:
    if fn is None:
        return []
    try:
        return list(fn() or [])
    except Exception:
        return []


def _write_cut_sidecars(cut: LogCut) -> None:
    # browser compound уже раскрыт в атомы; sidecar — по console/perf/all
    if cut.opts & {"console", "all"}:
        rows = _safe_log_rows(_browser_logs_fn)
        if rows:
            _write_sidecar(
                cuts_dir() / f"{cut.name}.browser.log",
                rows,
                f"# browser console snapshot for {cut.name}",
            )
    if cut.opts & {"perf", "all"}:
        rows = _safe_log_rows(_perf_logs_fn)
        if rows:
            _write_sidecar(
                cuts_dir() / f"{cut.name}.perf.log",
                rows,
                f"# performance snapshot for {cut.name}",
            )


def _flush_cut(cut: LogCut, *, with_sidecars: bool) -> Path:
    out = cuts_dir() / f"{cut.name}.log"
    started = datetime.fromtimestamp(cut.started_at, tz=timezone.utc).astimezone().isoformat(
        timespec="seconds"
    )
    header = [started]
    if cut.comment:
        header.append(f"# {cut.comment}")
    header.append(cut.pretty_start)
    body = "\n".join(header + cut.lines) + "\n"
    out.write_text(body, encoding="utf-8")
    cut.path = out
    cut.closed = True
    if with_sidecars:
        _write_cut_sidecars(cut)
    return out


def end_cut(name: str, *, with_sidecars: bool = True) -> Path:
    clean = sanitize_name(name)
    with _lock:
        cut = _cuts.get(clean)
        if cut is None or cut.closed:
            raise ValueError(f"Лог-нарезка {clean!r} не открыта")
        path = _flush_cut(cut, with_sidecars=with_sidecars)
    return path


def close_all(*, with_sidecars: bool = True) -> List[Path]:
    """EOF прогона: закрыть все открытые cuts."""
    paths: List[Path] = []
    with _lock:
        open_names = [n for n, c in _cuts.items() if not c.closed]
    for name in open_names:
        try:
            paths.append(end_cut(name, with_sidecars=with_sidecars))
        except ValueError:
            continue
    return paths


def open_cut_names() -> List[str]:
    with _lock:
        return [n for n, c in _cuts.items() if not c.closed]
