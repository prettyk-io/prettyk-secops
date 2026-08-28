# -*- coding: utf-8 -*-
"""Цепь: resolve / materialize HAR + PrettyK seeds (без режим=)."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.errors import WiredError
from models.wired import Wired
from utils.api_module_runtime import find_api_module
from utils.chain_ops import ChainError, materialize_chain_fields
from utils.paths import ensure_runs_dir

CHAIN_MODULE_TYPE = "Цепь"


@dataclass
class ResolvedChain:
    module_id: str = ""
    from_module: bool = False
    sequence_name: str = ""
    har_as: str = ""
    har_path: Optional[Path] = None
    chain_fields: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


def _chain_fields_dict(mod: Any) -> Dict[str, Any]:
    raw = getattr(mod, "chain_fields", None)
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    if hasattr(raw, "model_dump"):
        return raw.model_dump()
    out: Dict[str, Any] = {}
    for key in (
        "har_as",
        "sequence_name",
        "source_har",
        "template_har",
        "steps",
        "slots",
        "bindings",
        "include_sequence_scan",
        "seed_fuzz_targets",
        "last_notes",
    ):
        if hasattr(raw, key):
            out[key] = getattr(raw, key)
    return out


def _imports_list(wired: Any) -> List[Any]:
    suites = getattr(wired, "test_suites", None)
    if suites is None:
        return []
    items = getattr(suites, "imports", None) or []
    return list(items) if isinstance(items, list) else []


def _find_har_import(wired: Any, as_name: str) -> Optional[Any]:
    want = (as_name or "").strip()
    if not want:
        return None
    for item in _imports_list(wired):
        kind = getattr(item, "kind", None)
        if kind is None and isinstance(item, dict):
            kind = item.get("kind")
        as_val = getattr(item, "as_name", None) or getattr(item, "as", None)
        if as_val is None and isinstance(item, dict):
            as_val = item.get("as")
        if str(kind or "") == "har_file" and str(as_val or "").strip() == want:
            return item
    return None


def resolve_chain_arg(
    wired: Any,
    arg: str,
    *,
    wired_dir: Optional[Path] = None,
) -> ResolvedChain:
    raw = (arg or "").strip()
    out = ResolvedChain(module_id=raw, sequence_name=raw, har_as=raw)
    if not raw:
        out.notes.append("пустой аргумент Цепь")
        return out

    mod = find_api_module(wired, raw, module_types=[CHAIN_MODULE_TYPE])
    if mod is not None:
        fields = _chain_fields_dict(mod)
        har_as = str(fields.get("har_as") or raw).strip() or raw
        seq = str(fields.get("sequence_name") or har_as).strip() or har_as
        out.module_id = raw
        out.from_module = True
        out.har_as = har_as
        out.sequence_name = seq
        out.chain_fields = fields
        out.notes.append(f"модуль Цепь: {raw}")
        return out

    imp = _find_har_import(wired, raw)
    if imp is not None:
        path = getattr(imp, "path", None)
        if path is None and isinstance(imp, dict):
            path = imp.get("path")
        rel = str(path or f"resources/{raw}.har").strip().replace("\\", "/")
        out.har_as = raw
        out.sequence_name = raw
        out.notes.append(f"imports har_file as={raw}")
        if wired_dir is not None:
            candidate = (Path(wired_dir) / rel).resolve()
            if candidate.is_file():
                out.har_path = candidate
            else:
                out.notes.append(f"файл пока нет: {candidate}")
                out.har_path = candidate
        else:
            out.har_path = Path(rel)
        return out

    out.notes.append(
        f"нет модуля Цепь id={raw!r} и нет imports har_file as={raw!r}"
    )
    return out


def _work_har_path(
    *,
    har_as: str,
    wired_dir: Optional[Path],
) -> Path:
    name = (har_as or "chain").strip() or "chain"
    if wired_dir is not None:
        dest = Path(wired_dir) / "resources" / f"{name}.har"
        dest.parent.mkdir(parents=True, exist_ok=True)
        return dest
    dest = ensure_runs_dir() / "_chain_exec" / f"{name}.har"
    dest.parent.mkdir(parents=True, exist_ok=True)
    return dest


def prepare_chain_har(
    resolved: ResolvedChain,
    *,
    wired_dir: Optional[Path] = None,
    bindings: Optional[Dict[str, str]] = None,
    verb: str = "Цепь",
) -> Path:
    """Materialize from chain_fields or reuse existing har_path."""
    if resolved.chain_fields and (
        resolved.chain_fields.get("template_har")
        or resolved.chain_fields.get("source_har")
    ):
        try:
            built = materialize_chain_fields(
                resolved.chain_fields, bindings=bindings
            )
        except ChainError as exc:
            raise WiredError(f"{verb} materialize: {exc}") from exc
        path = _work_har_path(har_as=resolved.har_as, wired_dir=wired_dir)
        path.write_text(str(built.get("har_text") or ""), encoding="utf-8")
        resolved.notes.extend(built.get("notes") or [])
        return path

    if resolved.har_path is not None:
        path = Path(resolved.har_path)
        if not path.is_file():
            raise WiredError(f"{verb}: HAR не найден: {path}")
        return path

    raise WiredError(
        f"{verb}: нечего исполнять "
        "(нужен module Цепь с template/source или har_file на диске)"
    )


def seed_prettyk_execute_chain(module_or_as: str) -> str:
    mid = (module_or_as or "").strip()
    return f"ВыполнитьЦепь {mid}" if mid else ""


def seed_prettyk_scan_chain(module_or_as: str) -> str:
    mid = (module_or_as or "").strip()
    return f"СканированиеЦепи {mid}" if mid else ""


def seed_prettyk_investigate_chain(module_or_as: str) -> str:
    from utils.chain_investigate import seed_prettyk_investigate_chain as _seed

    return _seed(module_or_as)


def seed_prettyk_prepare_chain(module_or_as: str) -> str:
    from utils.chain_ops import seed_prettyk_prepare_chain as _seed

    return _seed(module_or_as)
