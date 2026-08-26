# -*- coding: utf-8 -*-
"""Чтение spec/schema/proto для lab API-import (IMP)."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from utils.env_dual import pk_env


def api_lab_dry() -> bool:
    raw = (pk_env("API_LAB_DRY") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def lab_search_roots() -> List[Path]:
    """Корни для относительных путей (repo / CWD / PK_LAB_ROOT)."""
    roots: List[Path] = []
    env = (pk_env("LAB_ROOT") or "").strip()
    if env:
        roots.append(Path(env))
    # orchestrator/utils → repo root
    here = Path(__file__).resolve()
    roots.append(here.parents[2])  # prettyk-dev
    roots.append(Path.cwd())
    out: List[Path] = []
    seen: set[str] = set()
    for r in roots:
        try:
            key = str(r.resolve())
        except OSError:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(Path(key))
    return out


def resolve_lab_path(raw: str, *, search_roots: Optional[Sequence[Path]] = None) -> Optional[Path]:
    text = (raw or "").strip()
    if not text or text.startswith(("http://", "https://")):
        return None
    p = Path(text)
    try:
        if p.is_file() or p.is_dir():
            return p.resolve()
    except OSError:
        pass
    for root in search_roots or lab_search_roots():
        cand = root / text
        try:
            if cand.is_file() or cand.is_dir():
                return cand.resolve()
        except OSError:
            continue
    return None


def fetch_http_text(url: str, *, timeout: float = 8.0) -> Tuple[Optional[str], List[str]]:
    notes: List[str] = []
    raw = (url or "").strip()
    if not raw.startswith(("http://", "https://")):
        return None, ["не http(s) URL"]
    allow = (pk_env("LAB_HTTP_FETCH") or "1").strip().lower()
    if allow in ("0", "false", "no", "off"):
        notes.append("PK_LAB_HTTP_FETCH выключен — http fetch skipped")
        return None, notes
    try:
        req = urllib.request.Request(
            raw,
            headers={"Accept": "application/json, text/plain, */*", "User-Agent": "pk-lab/1.0"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — lab opt-in
            data = resp.read()
        try:
            return data.decode("utf-8"), notes
        except UnicodeDecodeError:
            return data.decode("utf-8", errors="replace"), notes + ["decode replace"]
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return None, [f"http fetch fail: {exc}"]


def read_local_text(spec_url_or_file: str) -> Tuple[Optional[str], list[str]]:
    """
    Локальный файл / inline / http(s) fetch (lab).
    → (text|None, notes)
    """
    notes: list[str] = []
    raw = (spec_url_or_file or "").strip()
    if not raw:
        return None, ["пустой путь/URL/inline"]
    if raw.startswith(("http://", "https://")):
        text, http_notes = fetch_http_text(raw)
        return text, notes + http_notes
    resolved = resolve_lab_path(raw)
    if resolved is not None and resolved.is_file():
        try:
            return resolved.read_text(encoding="utf-8"), notes
        except OSError as exc:
            return None, [f"не прочитать файл: {exc}"]
    # inline: JSON / YAML-ish / SDL / proto
    if (
        raw.startswith("{")
        or raw.startswith("openapi:")
        or raw.startswith("swagger:")
        or "type Query" in raw
        or "service " in raw
        or raw.startswith("syntax")
    ):
        return raw, notes
    notes.append(f"не файл и не inline: {raw[:80]!r}")
    return None, notes


def dumps_ops(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)
