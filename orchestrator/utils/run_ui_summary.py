# -*- coding: utf-8 -*-
"""
RES-4: сводка для Results UI (Allure + ZAP + Dojo) + тренд severity.

Пишется в reports/live/run_ui_summary.json и severity_trend.ndjson.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.paths import LIVE_DIR, ensure_live_dir

RUN_UI_SUMMARY_PATH = LIVE_DIR / "run_ui_summary.json"
SEVERITY_TREND_PATH = LIVE_DIR / "severity_trend.ndjson"
_TREND_MAX = 24


def _risks(raw: Any) -> Dict[str, int]:
    if not isinstance(raw, dict):
        return {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    out = {}
    for key in ("critical", "high", "medium", "low", "info"):
        try:
            out[key] = int(raw.get(key) or 0)
        except (TypeError, ValueError):
            out[key] = 0
    return out


def _pick_collapse(dojo: Dict[str, Any], zap: Dict[str, Any]) -> Any:
    if isinstance(dojo.get("collapse"), dict):
        return dojo.get("collapse")
    if isinstance(zap.get("collapse"), dict):
        return zap.get("collapse")
    return None


def _pick_top_findings(collapse: Any, zap: Dict[str, Any]) -> list:
    if isinstance(collapse, dict) and isinstance(collapse.get("top_findings"), list):
        return collapse["top_findings"]
    if isinstance(zap.get("top_findings"), list):
        return zap["top_findings"]
    return []


def _allure_block(allure: Dict[str, Any]) -> Dict[str, Any]:
    summary = allure.get("summary") if isinstance(allure.get("summary"), dict) else {}
    return {
        "passed": int(summary.get("passed") or 0),
        "failed": int(summary.get("failed") or 0),
        "broken": int(summary.get("broken") or 0),
        "skipped": int(summary.get("skipped") or 0),
        "total": int(summary.get("total") or 0),
        "status": summary.get("status") or allure.get("status") or "",
    }


def _primary_risks(
    dojo_stats: Dict[str, int], zap_counts: Dict[str, int]
) -> tuple[Dict[str, int], str]:
    if any(dojo_stats.values()):
        return dojo_stats, "dojo"
    if any(zap_counts.values()):
        return zap_counts, "zap"
    return zap_counts, "none"


def build_run_ui_summary(
    *,
    allure: Optional[Dict[str, Any]] = None,
    dojo: Optional[Dict[str, Any]] = None,
    zap: Optional[Dict[str, Any]] = None,
    executive: Optional[Dict[str, Any]] = None,
    run_id: str = "",
) -> Dict[str, Any]:
    allure = allure if isinstance(allure, dict) else {}
    dojo = dojo if isinstance(dojo, dict) else {}
    zap = zap if isinstance(zap, dict) else {}
    executive = executive if isinstance(executive, dict) else {}

    dojo_stats = _risks(dojo.get("stats"))
    zap_counts = _risks(zap.get("counts"))
    primary, source = _primary_risks(dojo_stats, zap_counts)
    collapse = _pick_collapse(dojo, zap)
    top = _pick_top_findings(collapse, zap)

    return {
        "kind": "pk_run_ui_summary",
        "version": 1,
        "built_at": time.time(),
        "run_id": (run_id or "").strip(),
        "risks": primary,
        "risks_source": source,
        "dojo_stats": dojo_stats,
        "zap_counts": zap_counts,
        "zap_instance_counts": _risks(zap.get("instance_counts")),
        "zap_alert_count": int(zap.get("alert_count") or 0),
        "zap_instance_count": int(zap.get("instance_count") or 0),
        "allure": _allure_block(allure),
        "executive_class": _executive_class(executive, dojo),
        "top_findings": top[:20] if isinstance(top, list) else [],
        "collapse": collapse,
    }


def _executive_class(executive: Dict[str, Any], dojo: Dict[str, Any]) -> str:
    if executive.get("executive_class"):
        return str(executive.get("executive_class"))
    dojo_exec = dojo.get("executive")
    if isinstance(dojo_exec, dict) and dojo_exec.get("executive_class"):
        return str(dojo_exec.get("executive_class"))
    return ""


def persist_run_ui_summary(summary: Dict[str, Any]) -> Path:
    ensure_live_dir()
    RUN_UI_SUMMARY_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return RUN_UI_SUMMARY_PATH


def _allure_pass_rate(summary: Dict[str, Any]) -> Optional[float]:
    """MC-RES-2: passed(+0.5 skipped)/total → 0..1; None если Allure пуст."""
    allure = summary.get("allure") if isinstance(summary.get("allure"), dict) else {}
    total = int(allure.get("total") or 0)
    if total <= 0:
        return None
    passed = int(allure.get("passed") or 0)
    skipped = int(allure.get("skipped") or 0)
    return max(0.0, min(1.0, (passed + skipped * 0.5) / float(total)))


def append_severity_trend(summary: Dict[str, Any]) -> Path:
    """Append one trend point; keep last _TREND_MAX lines."""
    ensure_live_dir()
    risks = _risks(summary.get("risks"))
    point = {
        "ts": float(summary.get("built_at") or time.time()),
        "label": (summary.get("run_id") or time.strftime("%H:%M")).strip()[:24] or "run",
        "critical": risks["critical"],
        "high": risks["high"],
        "medium": risks["medium"],
        "low": risks["low"],
        "info": risks["info"],
        "source": summary.get("risks_source") or "",
        "executive_class": summary.get("executive_class") or "",
    }
    rate = _allure_pass_rate(summary)
    if rate is not None:
        point["allure_pass_rate"] = rate
    lines: List[str] = []
    if SEVERITY_TREND_PATH.is_file():
        try:
            lines = [
                ln
                for ln in SEVERITY_TREND_PATH.read_text(encoding="utf-8").splitlines()
                if ln.strip()
            ]
        except OSError:
            lines = []
    lines.append(json.dumps(point, ensure_ascii=False))
    lines = lines[-_TREND_MAX:]
    SEVERITY_TREND_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return SEVERITY_TREND_PATH


def read_run_ui_summary(run_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if not RUN_UI_SUMMARY_PATH.is_file():
        return None
    try:
        data = json.loads(RUN_UI_SUMMARY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    rid = (run_id or "").strip()
    if rid and str(data.get("run_id") or "").strip() != rid:
        return None
    return data


def read_severity_trend(run_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if not SEVERITY_TREND_PATH.is_file():
        return []
    out: List[Dict[str, Any]] = []
    rid = (run_id or "").strip()
    try:
        for line in SEVERITY_TREND_PATH.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict):
                if rid and str(row.get("label") or "").strip() != rid:
                    continue
                out.append(row)
    except OSError:
        return []
    return out
