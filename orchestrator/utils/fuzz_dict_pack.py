# -*- coding: utf-8 -*-
"""KDT curated fuzz intent pack (not SecLists). Wave A of fuzz-dictionaries-defaults."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

INTENT_DIR = Path(__file__).resolve().parents[1] / "data" / "fuzz"
PACK_PATH = INTENT_DIR / "pack.json"
PACK_MAX_LINES_HARD = 200


def load_fuzz_pack(*, path: Optional[Path] = None) -> Dict[str, Any]:
    p = Path(path) if path is not None else PACK_PATH
    if not p.is_file():
        raise FileNotFoundError(f"fuzz pack missing: {p}")
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("fuzz pack: root must be object")
    return data


def list_pack_corpus_names(*, path: Optional[Path] = None) -> List[str]:
    pack = load_fuzz_pack(path=path)
    out: List[str] = []
    for row in pack.get("corpora") or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        if name:
            out.append(name)
    return out


def corpus_max_lines(name: str, *, path: Optional[Path] = None) -> int:
    pack = load_fuzz_pack(path=path)
    default = int(pack.get("max_lines_default") or PACK_MAX_LINES_HARD)
    default = min(max(1, default), PACK_MAX_LINES_HARD)
    for row in pack.get("corpora") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("name") or "").strip() != name:
            continue
        raw = row.get("max_lines")
        if raw is None:
            return default
        return min(max(1, int(raw)), PACK_MAX_LINES_HARD)
    return default


def validate_fuzz_pack(*, path: Optional[Path] = None) -> List[str]:
    """Return human errors (empty = ok)."""
    errors: List[str] = []
    try:
        pack = load_fuzz_pack(path=path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return [str(exc)]
    root = Path(path).parent if path is not None else INTENT_DIR
    corpora = pack.get("corpora")
    if not isinstance(corpora, list) or not corpora:
        errors.append("pack: corpora[] пуст")
        return errors
    seen = set()
    for i, row in enumerate(corpora):
        if not isinstance(row, dict):
            errors.append(f"pack: corpora[{i}] не object")
            continue
        name = str(row.get("name") or "").strip()
        rel = str(row.get("path") or "").strip()
        if not name:
            errors.append(f"pack: corpora[{i}] без name")
            continue
        if name in seen:
            errors.append(f"pack: duplicate corpus {name!r}")
        seen.add(name)
        if not rel:
            errors.append(f"pack: {name}: пустой path")
            continue
        fp = root / rel
        if not fp.is_file():
            errors.append(f"pack: {name}: файл не найден {fp}")
            continue
        try:
            lines = [
                ln
                for ln in fp.read_text(encoding="utf-8").splitlines()
                if ln.strip() and not ln.strip().startswith("#")
            ]
        except OSError as exc:
            errors.append(f"pack: {name}: read fail {exc}")
            continue
        if not lines:
            errors.append(f"pack: {name}: нет payload-строк")
        cap = corpus_max_lines(name, path=path)
        if len(lines) > PACK_MAX_LINES_HARD:
            errors.append(
                f"pack: {name}: {len(lines)} строк > hard cap {PACK_MAX_LINES_HARD}"
            )
        elif len(lines) > cap:
            errors.append(
                f"pack: {name}: {len(lines)} строк > max_lines {cap}"
            )
    return errors
