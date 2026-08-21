# -*- coding: utf-8 -*-
"""
High-confidence plaintext secret scan for package/export gate.

Industry baseline (git-secrets / Red Hat patterns): block AKIA*, PEM private keys,
common token prefixes. Report type + location only — never echo secret values.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import os
import re
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

# (rule_id, compiled pattern)
_PATTERNS: Tuple[Tuple[str, re.Pattern[str]], ...] = (
    (
        "aws_access_key_id",
        re.compile(r"\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b"),
    ),
    (
        "private_key_pem",
        re.compile(
            r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PRIVATE )?PRIVATE KEY-----"
        ),
    ),
    (
        "github_token",
        re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b"),
    ),
    (
        "slack_token",
        re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    ),
)

_TEXT_SUFFIXES = frozenset(
    {
        ".txt",
        ".json",
        ".ndjson",
        ".log",
        ".md",
        ".html",
        ".xml",
        ".yml",
        ".yaml",
        ".csv",
        ".env",
        ".ini",
        ".cfg",
        ".conf",
        ".py",
        ".js",
        ".ts",
        ".tsx",
    }
)


def package_secret_block_enabled() -> bool:
    """Default on. KDT_PACKAGE_ALLOW_SECRETS=1 → warn-only (lab escape)."""
    raw = (pk_env("PACKAGE_ALLOW_SECRETS") or "").strip().lower()
    return raw not in ("1", "true", "yes", "on")


def scan_text_for_secrets(
    text: str,
    *,
    location: str = "",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Return findings without secret values (rule + location only)."""
    if not text:
        return []
    out: List[Dict[str, Any]] = []
    for rule_id, pat in _PATTERNS:
        for _m in pat.finditer(text):
            out.append({"rule": rule_id, "location": location or "text"})
            if len(out) >= limit:
                return out
    return out


def scan_path_for_secrets(path: Path, *, location: str = "") -> List[Dict[str, Any]]:
    p = Path(path)
    if not p.is_file():
        return []
    suffix = p.suffix.lower()
    name = p.name.lower()
    if suffix not in _TEXT_SUFFIXES and name not in ("dockerfile", "makefile"):
        # still scan small unknown text-ish files
        try:
            if p.stat().st_size > 2_000_000:
                return []
        except OSError:
            return []
    try:
        raw = p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return scan_text_for_secrets(raw, location=location or str(p))


def scan_run_dir_for_secrets(run_dir: Path, *, limit: int = 40) -> List[Dict[str, Any]]:
    """Priority scan: ``Wired.json`` + ``log_cuts/*`` (package gate BOT-C4)."""
    root = Path(run_dir)
    if not root.is_dir():
        return []
    findings: List[Dict[str, Any]] = []
    wired = root / "wired.json"
    if wired.is_file():
        findings.extend(
            scan_path_for_secrets(wired, location="run/wired.json")
        )
    cuts = root / "log_cuts"
    if cuts.is_dir():
        for p in sorted(cuts.iterdir()):
            if not p.is_file():
                continue
            if len(findings) >= limit:
                break
            findings.extend(
                scan_path_for_secrets(
                    p, location=f"logs/cuts/{p.name}"
                )[: max(0, limit - len(findings))]
            )
    return findings[:limit]


def _zip_member_priority(name: str) -> int:
    n = (name or "").replace("\\", "/")
    if n == "run/Wired.json" or n.startswith("run/Wired."):
        return 0
    if n.startswith("logs/cuts/"):
        return 1
    if n.startswith("run/"):
        return 2
    return 9


def scan_zip_for_secrets(
    zip_path: Path,
    *,
    limit: int = 40,
) -> List[Dict[str, Any]]:
    zpath = Path(zip_path)
    if not zpath.is_file():
        return []
    findings: List[Dict[str, Any]] = []
    try:
        with zipfile.ZipFile(zpath, "r") as zf:
            members = [i for i in zf.infolist() if not i.is_dir()]
            members.sort(key=lambda i: (_zip_member_priority(i.filename), i.filename))
            for info in members:
                name = info.filename
                suffix = Path(name).suffix.lower()
                # cuts / wired — всегда; прочий неизвестный суффикс — skip
                priority = _zip_member_priority(name)
                if suffix and suffix not in _TEXT_SUFFIXES and priority > 1:
                    continue
                if info.file_size > 2_000_000:
                    continue
                try:
                    data = zf.read(info)
                except Exception:  # noqa: BLE001
                    continue
                try:
                    text = data.decode("utf-8", errors="replace")
                except Exception:  # noqa: BLE001
                    continue
                findings.extend(
                    scan_text_for_secrets(text, location=name, limit=limit - len(findings))
                )
                if len(findings) >= limit:
                    break
    except (OSError, zipfile.BadZipFile):
        return findings
    return findings


def summarize_findings(findings: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    rules: Dict[str, int] = {}
    for f in findings:
        rid = str(f.get("rule") or "unknown")
        rules[rid] = rules.get(rid, 0) + 1
    return {"count": len(findings), "by_rule": rules, "findings": list(findings)[:40]}
