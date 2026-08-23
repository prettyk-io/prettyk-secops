# -*- coding: utf-8 -*-
"""
Клиент DefectDojo: импорт ZAP XML. Вызов из utils.reporter.finalize_reports.

Базис пайпа: после прогона льём XML в Dojo.
Lab-дефолты — services/defectdojo/.env.example (в репо; UI: admin/admin).
Переменные окружения перекрывают файл.

Opt-in per-check engagement: KDT_DEFECTDOJO_ENGAGEMENT_MODE=check
(see docs/check-evidence-refs.md).
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import requests

from utils.paths import REPO_ROOT

logger = logging.getLogger(__name__)

PathLike = Union[str, Path]

_LAB_ENV = REPO_ROOT / "services" / "defectdojo" / ".env.example"
_LAB_KEYS = (
    "KDT_DEFECTDOJO_URL",
    "KDT_DEFECTDOJO_TOKEN",
    "KDT_DEFECTDOJO_ENGAGEMENT",
)
_lab_loaded = False


def _load_lab_env() -> None:
    """Подставить lab-значения из .env.example, если ключ ещё не в os.environ."""
    global _lab_loaded
    if _lab_loaded:
        return
    _lab_loaded = True
    if not _LAB_ENV.is_file():
        return
    try:
        for raw in _LAB_ENV.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            if key not in _LAB_KEYS:
                continue
            if os.environ.get(key, "").strip():
                continue
            os.environ[key] = val.strip().strip('"').strip("'")
    except OSError as exc:
        logger.warning("DefectDojo: не прочитал %s: %s", _LAB_ENV, exc)


def _env(name: str, default: str = "") -> str:
    _load_lab_env()
    pk_val = os.environ.get(f"PK_{name}", "")
    if pk_val.strip():
        return pk_val.strip()
    return os.environ.get(name, default).strip()


def defectdojo_configured() -> bool:
    return bool(_env("KDT_DEFECTDOJO_URL") and _env("KDT_DEFECTDOJO_TOKEN"))


def engagement_mode() -> str:
    """fixed | check — default fixed (lab ENGAGEMENT id)."""
    raw = _env("KDT_DEFECTDOJO_ENGAGEMENT_MODE", "fixed").lower()
    return "check" if raw in {"check", "per_check", "per-check"} else "fixed"


def build_dojo_engagement_url(base_url: str, engagement_id: Any) -> str:
    base = (base_url or "").rstrip("/")
    if not base or engagement_id is None or engagement_id == "":
        return ""
    return f"{base}/engagement/{engagement_id}"


def build_dojo_test_url(base_url: str, test_id: Any) -> str:
    base = (base_url or "").rstrip("/")
    if not base or test_id is None or test_id == "":
        return ""
    return f"{base}/test/{test_id}"


def _severity_active_count(node: Any) -> Optional[int]:
    """Dojo statistics cell: int OR {active, total, false_p, …} → ACTIVE count."""
    if node is None:
        return None
    if isinstance(node, bool):
        return None
    if isinstance(node, (int, float)):
        return max(0, int(node))
    if isinstance(node, str):
        try:
            return max(0, int(node.strip()))
        except ValueError:
            return None
    if isinstance(node, dict):
        if "active" in node and node["active"] is not None:
            try:
                return max(0, int(node["active"]))
            except (TypeError, ValueError):
                return None
        # Не подставляем total: иначе FP/mitigated раздуют gate.
        return None
    return None


def _thin_active_stats_from_bucket(node: Dict[str, Any]) -> Dict[str, int]:
    thin: Dict[str, int] = {}
    for sev in ("critical", "high", "medium", "low", "info"):
        if sev not in node:
            continue
        n = _severity_active_count(node.get(sev))
        if n is not None:
            thin[sev] = n
    return thin


def _stats_from_import(stats: Any) -> Dict[str, int]:
    if not isinstance(stats, dict):
        return {}
    # Prefer after → before → delta; nested {active:N} or flat int.
    for bucket in ("after", "before", "delta"):
        node = stats.get(bucket)
        if isinstance(node, dict):
            thin = _thin_active_stats_from_bucket(node)
            if thin:
                return thin
    return _thin_active_stats_from_bucket(stats)


def _parse_import_payload(body: Any) -> Dict[str, Any]:
    """Extract thin meta from import-scan JSON (ids + ACTIVE severity counts)."""
    if not isinstance(body, dict):
        return {}
    out: Dict[str, Any] = {}
    for key in ("product_id", "engagement_id", "test_id", "product_type_id"):
        if key in body and body[key] is not None:
            out[key] = body[key]
    thin = _stats_from_import(body.get("statistics"))
    if thin:
        out["stats"] = thin
        out["stats_shape"] = "active"
    return out


def _parse_findings_page(body: Any) -> tuple[List[Dict[str, Any]], Optional[str], bool]:
    page_items: List[Dict[str, Any]] = []
    next_url: Optional[str] = None
    has_next_key = False
    if isinstance(body, dict):
        raw = body.get("results")
        if isinstance(raw, list):
            page_items = [x for x in raw if isinstance(x, dict)]
        has_next_key = "next" in body
        nxt = body.get("next")
        if isinstance(nxt, str) and nxt.strip():
            next_url = nxt.strip()
    elif isinstance(body, list):
        page_items = [x for x in body if isinstance(x, dict)]
    return page_items, next_url, has_next_key


def _advance_findings_cursor(
    *,
    page_items: List[Dict[str, Any]],
    next_url: Optional[str],
    has_next_key: bool,
    page_limit: int,
    params: Dict[str, Any],
    endpoint: str,
) -> tuple[Optional[str], Optional[Dict[str, Any]], bool]:
    """Return (url, use_params, done)."""
    if next_url:
        return next_url, None, False
    if has_next_key:
        return None, None, True
    if len(page_items) >= page_limit:
        params["offset"] = int(params.get("offset") or 0) + page_limit
        return endpoint, params, False
    return None, None, True


def list_findings_for_gate(
    *,
    test_id: Optional[Any] = None,
    engagement_id: Optional[Any] = None,
    product_id: Optional[Any] = None,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
    limit: int = 500,
    max_pages: int = 200,
) -> Dict[str, Any]:
    """
    GET /api/v2/findings/ для admission — листает `next` / offset до конца.

    Returns:
      ok: bool
      findings: list[dict]
      pages: int
      error: optional str
    """
    _load_lab_env()
    url_base = (dojo_url or _env("KDT_DEFECTDOJO_URL")).rstrip("/")
    api_token = token or _env("KDT_DEFECTDOJO_TOKEN")
    if not url_base or not api_token:
        return {"ok": False, "findings": [], "pages": 0, "error": "not_configured"}

    page_limit = max(1, min(int(limit), 10000))
    params: Dict[str, Any] = {
        "active": "true",
        "false_p": "false",
        "duplicate": "false",
        "limit": page_limit,
        "offset": 0,
    }
    if test_id is not None and test_id != "":
        params["test"] = test_id
    elif engagement_id is not None and engagement_id != "":
        params["test__engagement"] = engagement_id
    elif product_id is not None and product_id != "":
        params["test__engagement__product"] = product_id
    else:
        return {
            "ok": False,
            "findings": [],
            "pages": 0,
            "error": "need_test_or_engagement",
        }

    endpoint = f"{url_base}/api/v2/findings/"
    timeout = int(_env("KDT_DEFECTDOJO_TIMEOUT_SEC", "120") or "120")
    headers = {"Authorization": f"Token {api_token}", "accept": "application/json"}
    results: List[Dict[str, Any]] = []
    pages = 0
    url: Optional[str] = endpoint
    use_params: Optional[Dict[str, Any]] = params
    try:
        while url and pages < max(1, int(max_pages)):
            pages += 1
            resp = requests.get(
                url, headers=headers, params=use_params, timeout=timeout
            )
            if resp.status_code >= 400:
                return {
                    "ok": False,
                    "findings": results,
                    "pages": pages,
                    "error": f"http_{resp.status_code}",
                }
            body = resp.json()
            page_items, next_url, has_next_key = _parse_findings_page(body)
            results.extend(page_items)
            url, use_params, done = _advance_findings_cursor(
                page_items=page_items,
                next_url=next_url,
                has_next_key=has_next_key,
                page_limit=page_limit,
                params=params,
                endpoint=endpoint,
            )
            if done:
                break
        return {"ok": True, "findings": results, "pages": pages}
    except Exception as exc:
        logger.error("DefectDojo findings list error: %s", exc)
        return {
            "ok": False,
            "findings": results,
            "pages": pages,
            "error": str(exc),
        }


def list_findings_suppressed(
    *,
    test_id: Optional[Any] = None,
    engagement_id: Optional[Any] = None,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
    limit: int = 200,
    max_pages: int = 50,
) -> Dict[str, Any]:
    """Pull findings with DOJO-S-3 statuses: false_p, risk_accepted, mitigated, out_of_scope, inactive.

    Returns suppressed findings with their statuses for PrettyK results display.
    These are EXCLUDED from the active gate but preserved in history.
    """
    _load_lab_env()
    url_base = (dojo_url or _env("KDT_DEFECTDOJO_URL")).rstrip("/")
    api_token = token or _env("KDT_DEFECTDOJO_TOKEN")
    if not url_base or not api_token:
        return {"ok": False, "findings": [], "suppressed_count": 0, "error": "not_configured"}

    page_limit = max(1, min(int(limit), 10000))
    params: Dict[str, Any] = {
        "limit": page_limit,
        "offset": 0,
    }
    if test_id is not None and test_id != "":
        params["test"] = test_id
    elif engagement_id is not None and engagement_id != "":
        params["test__engagement"] = engagement_id
    else:
        return {"ok": False, "findings": [], "suppressed_count": 0, "error": "need_test_or_engagement"}

    endpoint = f"{url_base}/api/v2/findings/"
    timeout = int(_env("KDT_DEFECTDOJO_TIMEOUT_SEC", "120") or "120")
    headers = {"Authorization": f"Token {api_token}", "accept": "application/json"}
    results: List[Dict[str, Any]] = []
    pages = 0
    url: Optional[str] = endpoint
    use_params: Optional[Dict[str, Any]] = params
    suppressed_count = 0
    suppressed_kinds: Dict[str, int] = {"false_p": 0, "risk_accepted": 0, "mitigated": 0, "out_of_scope": 0, "inactive": 0}

    try:
        while url and pages < max(1, int(max_pages)):
            pages += 1
            resp = requests.get(url, headers=headers, params=use_params, timeout=timeout)
            if resp.status_code >= 400:
                return {"ok": False, "findings": results, "suppressed_count": suppressed_count, "suppressed_kinds": suppressed_kinds, "error": f"http_{resp.status_code}"}
            body = resp.json()
            page_items, next_url, has_next_key = _parse_findings_page(body)
            for f in page_items:
                is_fp = f.get("false_p") is True
                is_ra = f.get("risk_accepted") is True
                is_mit = f.get("mitigated") is not None and f.get("mitigated") != ""
                is_oos = f.get("out_of_scope") is True
                is_inactive = f.get("active") is False
                if is_fp or is_ra or is_mit or is_oos or is_inactive:
                    suppressed_count += 1
                    if is_fp: suppressed_kinds["false_p"] += 1
                    if is_ra: suppressed_kinds["risk_accepted"] += 1
                    if is_mit: suppressed_kinds["mitigated"] += 1
                    if is_oos: suppressed_kinds["out_of_scope"] += 1
                    if is_inactive: suppressed_kinds["inactive"] += 1
                    results.append(f)
            url, use_params, done = _advance_findings_cursor(
                page_items=page_items, next_url=next_url, has_next_key=has_next_key,
                page_limit=page_limit, params=params, endpoint=endpoint,
            )
            if done:
                break
        return {"ok": True, "findings": results, "suppressed_count": suppressed_count, "suppressed_kinds": suppressed_kinds, "pages": pages}
    except Exception as exc:
        logger.error("DefectDojo suppressed findings error: %s", exc)
        return {"ok": False, "findings": results, "suppressed_count": suppressed_count, "suppressed_kinds": suppressed_kinds, "error": str(exc)}


def _filter_needs_findings_path(policy: Any, waivers: Any) -> bool:
    from core.admission_filter import FilterPolicy, default_filter_policy

    if waivers:
        return True
    if not isinstance(policy, FilterPolicy):
        return False
    return policy != default_filter_policy()


def _collapse_findings_safe(
    findings: list,
    *,
    policy: Any,
    waivers: list,
    now: Any,
) -> Optional[Dict[str, Any]]:
    from core.finding_collapse import collapse_filtered_findings

    try:
        return collapse_filtered_findings(
            findings, policy=policy, waivers=waivers, now=now
        ).as_dict()
    except Exception:
        return None


def _try_dojo_stats_path(
    meta: Dict[str, Any],
    *,
    pol: Any,
    wlist: list,
    now: Any,
) -> Optional[
    Tuple[
        Dict[str, int],
        str,
        None,
        Dict[str, Any],
        Optional[Dict[str, Any]],
    ]
]:
    from core.admission_filter import FilterAudit
    from core.gate_policy import normalize_severity_counts

    stats = meta.get("stats")
    if not isinstance(stats, dict) or not stats:
        return None
    # per-check mode: stats from Dojo aggregate ALL tests on engagement —
    # skip and force findings path filtered by test_id.
    if engagement_mode() == "check":
        return None
    try:
        counts = normalize_severity_counts(stats)
        kept = sum(int(v) for v in counts.values())
        audit = FilterAudit(raw=kept, kept=kept, pages=0).as_dict()
        collapsed: Optional[Dict[str, Any]] = None
        test_id = meta.get("test_id")
        engagement_id = meta.get("engagement_id")
        if test_id or engagement_id:
            listed = list_findings_for_gate(
                test_id=test_id, engagement_id=engagement_id
            )
            if listed.get("ok"):
                findings = (
                    listed.get("findings")
                    if isinstance(listed.get("findings"), list)
                    else []
                )
                collapsed = _collapse_findings_safe(
                    findings, policy=pol, waivers=wlist, now=now
                )
        return counts, "dojo_stats", None, audit, collapsed
    except Exception:
        return None


def resolve_dojo_gate_counts(
    dojo_meta: Optional[Dict[str, Any]],
    *,
    filter_policy: Any = None,
    waivers: Any = None,
    now: Any = None,
) -> Tuple[
    Optional[Dict[str, int]],
    str,
    Optional[str],
    Optional[Dict[str, int]],
    Optional[Dict[str, Any]],
]:
    """
    ACTIVE counts из import stats или GET /findings/ + filter (+ audit).

    Returns (counts|None, source, error|None, filter_audit|None, collapse|None).
    source: dojo_stats | dojo_findings
    collapse: fingerprint/systemic summary for акт (RES-ACT), when findings listed.
    """
    from core.admission_filter import (
        default_filter_policy,
        filter_findings_for_gate,
    )

    meta = dojo_meta if isinstance(dojo_meta, dict) else {}
    pol = filter_policy or default_filter_policy()
    wlist = list(waivers or ())
    force_findings = _filter_needs_findings_path(pol, wlist)

    if not force_findings:
        via_stats = _try_dojo_stats_path(meta, pol=pol, wlist=wlist, now=now)
        if via_stats is not None:
            return via_stats

    test_id = meta.get("test_id")
    engagement_id = meta.get("engagement_id")
    listed = list_findings_for_gate(test_id=test_id, engagement_id=engagement_id)
    if not listed.get("ok"):
        return (
            None,
            "dojo_findings",
            str(listed.get("error") or "findings_failed"),
            None,
            None,
        )
    findings = listed.get("findings") if isinstance(listed.get("findings"), list) else []
    pages = int(listed.get("pages") or 0)
    counts, audit = filter_findings_for_gate(
        findings, pol, waivers=wlist, now=now, pages=pages
    )
    return (
        counts,
        "dojo_findings",
        None,
        audit.as_dict(),
        _collapse_findings_safe(findings, policy=pol, waivers=wlist, now=now),
    )


def trigger_defectdojo_import_detailed(
    file_path: PathLike,
    *,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
    engagement_id: Optional[str] = None,
    scan_type: str = "ZAP Scan",
    minimum_severity: str = "Info",
    active: bool = True,
    verified: bool = False,
    close_old_findings: bool = False,
    check_id: Optional[str] = None,
    product_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    POST /api/v2/import-scan/ с ZAP XML.

    Returns:
      ok: bool
      skipped: bool
      dojo: optional thin refs (ids + urls + stats)
      error: optional str
    """
    _load_lab_env()
    enabled = _env("KDT_DEFECTDOJO_ENABLED", "1").lower() not in {"0", "false", "no"}
    if not enabled:
        logger.info("DefectDojo import skipped (KDT_DEFECTDOJO_ENABLED=0)")
        return {"ok": True, "skipped": True}

    url_base = (dojo_url or _env("KDT_DEFECTDOJO_URL")).rstrip("/")
    api_token = token or _env("KDT_DEFECTDOJO_TOKEN")

    if not url_base or not api_token:
        logger.error(
            "DefectDojo import blocked: KDT_DEFECTDOJO_URL / KDT_DEFECTDOJO_TOKEN not set. "
            "Set KDT_DEFECTDOJO_ENABLED=0 to suppress."
        )
        return {"ok": False, "skipped": False, "error": "dojo_not_configured"}

    path = Path(file_path)
    if not path.is_file():
        logger.error("DefectDojo: XML не найден: %s", path)
        return {"ok": False, "skipped": False, "error": "xml_missing"}

    headers = {"Authorization": f"Token {api_token}"}
    data: Dict[str, str] = {
        "scan_type": scan_type,
        "minimum_severity": minimum_severity,
        "active": str(active).lower(),
        "verified": str(verified).lower(),
        "close_old_findings": str(close_old_findings).lower(),
    }

    mode = engagement_mode()
    if mode == "check":
        prod = (
            product_name
            or _env("KDT_DOJO_PRODUCT_NAME")
            or _env("KDT_META_PROJECT_ID")
            or "kdt-app"
        )
        eng_name = (
            check_id
            or _env("KDT_CHECK_ID")
            or _env("KDT_DOJO_ENGAGEMENT_NAME")
            or f"kdt-check-{int(path.stat().st_mtime)}"
        )
        data["auto_create_context"] = "true"
        data["product_name"] = prod
        data["engagement_name"] = eng_name
        data["product_type_name"] = (
            _env("KDT_DEFECTDOJO_PRODUCT_TYPE", "Research and Development")
        )
        # Prefer product id when operator pinned it
        product_id = _env("KDT_DOJO_PRODUCT_ID")
        if product_id:
            data["product"] = product_id
    else:
        engagement = engagement_id or _env("KDT_DEFECTDOJO_ENGAGEMENT")
        if not engagement:
            logger.error(
                "DefectDojo: нужен KDT_DEFECTDOJO_ENGAGEMENT (id). "
                "Создай Product/Engagement в UI или см. services/defectdojo/README.md"
            )
            return {"ok": False, "skipped": False, "error": "engagement_missing"}
        data["engagement"] = str(engagement)

    endpoint = f"{url_base}/api/v2/import-scan/"
    timeout = int(_env("KDT_DEFECTDOJO_TIMEOUT_SEC", "120") or "120")
    logger.info(
        "DefectDojo import %s mode=%s → %s",
        path.name,
        mode,
        endpoint,
    )
    try:
        with path.open("rb") as fh:
            resp = requests.post(
                endpoint,
                headers=headers,
                data=data,
                files={"file": (path.name, fh, "application/xml")},
                timeout=timeout,
            )
        if resp.status_code >= 400:
            logger.error(
                "DefectDojo import failed: HTTP %s %s",
                resp.status_code,
                (resp.text or "")[:800],
            )
            return {
                "ok": False,
                "skipped": False,
                "error": f"http_{resp.status_code}",
            }
        body: Any
        try:
            body = resp.json()
        except ValueError:
            body = None
        logger.info("DefectDojo import ok: %s", (resp.text or "")[:300])
        parsed = _parse_import_payload(body)
        # fixed mode: fill engagement from request if response omitted
        if mode != "check" and "engagement_id" not in parsed:
            eng = data.get("engagement")
            if eng:
                parsed["engagement_id"] = eng
        if parsed.get("engagement_id") is not None:
            parsed["engagement_url"] = build_dojo_engagement_url(
                url_base, parsed["engagement_id"]
            )
        if parsed.get("test_id") is not None:
            parsed["test_url"] = build_dojo_test_url(url_base, parsed["test_id"])
        return {"ok": True, "skipped": False, "dojo": parsed}
    except Exception as exc:
        logger.error("DefectDojo import error: %s", exc)
        return {"ok": False, "skipped": False, "error": str(exc)}


def trigger_defectdojo_import(
    file_path: PathLike,
    *,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
    engagement_id: Optional[str] = None,
    scan_type: str = "ZAP Scan",
    minimum_severity: str = "Info",
    active: bool = True,
    verified: bool = False,
) -> bool:
    """
    POST /api/v2/import-scan/ с ZAP XML.

    Источник: os.environ, иначе services/defectdojo/.env.example.
      KDT_DEFECTDOJO_URL / TOKEN / ENGAGEMENT
      KDT_DEFECTDOJO_ENABLED=0 — выкл (по умолчанию вкл)
    """
    result = trigger_defectdojo_import_detailed(
        file_path,
        dojo_url=dojo_url,
        token=token,
        engagement_id=engagement_id,
        scan_type=scan_type,
        minimum_severity=minimum_severity,
        active=active,
        verified=verified,
    )
    return bool(result.get("ok"))


def resolve_zap_xml_for_dojo(zap_report_path: Optional[str]) -> Optional[Path]:
    """
    Берём XML для Dojo: явный last_zap_report если .xml,
    иначе последний *.xml в reports/scanner-results.
    """
    from utils.paths import ZAP_RESULTS_DIR

    if zap_report_path:
        p = Path(zap_report_path)
        if p.is_file() and p.suffix.lower() == ".xml":
            return p
    if not ZAP_RESULTS_DIR.is_dir():
        return None
    xmls = sorted(ZAP_RESULTS_DIR.glob("*.xml"), key=lambda x: x.stat().st_mtime, reverse=True)
    return xmls[0] if xmls else None
