# -*- coding: utf-8 -*-
"""
DEFECTDOJO-BIDIRECTIONAL-SYNC: двунаправленный синк находок с DefectDojo.

Направления:
  * push  — находки фаззера/атак (SecOps Lab ``Finding``) → Dojo REST API v2;
            дедуп по стабильному ``unique_id_from_tool`` (SHA256 от каноничного ключа)
            + короткий FNV-1a отпечаток для UI/ledger. Повторный прогон не плодит
            дубликаты: если находка с тем же unique_id уже есть в том же test —
            создание пропускается (Dojo на reimport инкрементит ``nb_occurences``).
  * pull  — обратный импорт статусов Dojo (false_p / is_mitigated / risk_accepted /
            active) → карта подавлений по fingerprint; False Positive гасит находку
            в Allure3 (через ``apply_dojo_suppressions``).

Retry: экспоненциальный backoff на network errors, HTTP 5xx и 429. Поток
``DojoSyncWorker`` (один инстанс, non-blocking для Live) держит очередь и пишет
состояние в ``LIVE_DIR/dojo_sync_state.json`` — его читает Admin UI.

Канон статусов severity: critical|high|medium|low|info (совместимо с Dojo/Allure).
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import requests

logger = logging.getLogger(__name__)

_SEV_TO_DOJO = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "info": "Info",
    "informational": "Info",
}

# Смещение порядка: canonical → Dojo числовой (не обязателен, но стабильность не ломаем)
_DOJO_TO_CANON = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "info": "info",
    "informational": "info",
}

_DEFAULT_RETRIES = 3
_DEFAULT_BACKOFF = 2.0
_DEFAULT_TIMEOUT_SEC = 120


# ───────────────────────── fingerprinting ─────────────────────────


def fnv1a_32(text: str) -> str:
    """FNV-1a 32-bit, паритет FE ``manifestContentHash`` (идентичные биты)."""
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return format(h & 0xFFFFFFFF, "08x")


def _canonical_key(finding: Mapping[str, Any]) -> str:
    kind = str(finding.get("kind") or finding.get("rule_id") or "").strip()
    title = str(finding.get("title") or finding.get("name") or "").strip().lower()
    sev = _canonical_severity(finding.get("severity"))
    cwe = str(finding.get("cwe") or "").strip()
    param = str(finding.get("param") or finding.get("parameter") or "").strip().lower()
    return "|".join([kind, title, sev, cwe, param])


def _canonical_severity(raw: Any) -> str:
    key = str(raw or "").strip().lower()
    if key in _DOJO_TO_CANON:
        return _DOJO_TO_CANON[key]
    return "info"


def finding_fingerprint(finding: Mapping[str, Any]) -> str:
    """Короткий FNV-1a отпечаток для UI/ledger (8 hex)."""
    return fnv1a_32(_canonical_key(finding))


def finding_unique_id(finding: Mapping[str, Any]) -> str:
    """Стабильный dedup-ключ для Dojo ``unique_id_from_tool`` (SHA256 → 16 hex)."""
    return "kdt-" + hashlib.sha256(_canonical_key(finding).encode("utf-8")).hexdigest()[:16]


def _cwe_int(raw: Any) -> int:
    """'CWE-79' / 79 / '79' → int; иначе 0."""
    if raw is None:
        return 0
    if isinstance(raw, int):
        return max(0, raw)
    text = str(raw).strip()
    if not text:
        return 0
    if text.upper().startswith("CWE-"):
        text = text[4:]
    try:
        return max(0, int(text))
    except ValueError:
        return 0


def _tags_of(finding: Mapping[str, Any]) -> List[str]:
    raw = finding.get("tags")
    if isinstance(raw, str):
        return [raw.strip()] if raw.strip() else []
    if isinstance(raw, (list, tuple)):
        return [str(t).strip() for t in raw if str(t).strip()]
    return []


# ───────────────────────── Dojo payload mapping ─────────────────────────


def finding_to_dojo_payload(
    finding: Mapping[str, Any],
    *,
    test_id: Any,
    active: bool = True,
    verified: bool = False,
    date: str = "",
) -> Dict[str, Any]:
    """Собрать тело POST /api/v2/findings/ для одной находки."""
    title = str(
        finding.get("title") or finding.get("name") or "Аномалия фаззинга"
    ).strip()
    sev = _canonical_severity(finding.get("severity"))
    description = str(finding.get("evidence") or finding.get("description") or "").strip()
    url = str(finding.get("url") or "").strip()
    tags = _tags_of(finding)
    payload: Dict[str, Any] = {
        "test": test_id,
        "title": title,
        "severity": _SEV_TO_DOJO.get(sev, "Info"),
        "cwe": _cwe_int(finding.get("cwe")),
        "description": description or title,
        "unique_id_from_tool": finding_unique_id(finding),
        "active": bool(active),
        "verified": bool(verified),
        "false_p": False,
        "duplicate": False,
        "is_mitigated": False,
        "date": date or time.strftime("%Y-%m-%d", time.gmtime()),
    }
    if url:
        payload["references"] = url
    if tags:
        payload["tags"] = tags
    return payload


# ───────────────────────── HTTP + retry/backoff ─────────────────────────


class _RetryableError(Exception):
    """5xx / 429 / network — сигнал к повтору."""


def _config() -> Tuple[str, str]:
    """(dojo_url, token) из env (паритет adapters.defectdojo_client)."""
    from adapters.defectdojo_client import _env, _load_lab_env

    _load_lab_env()
    return (
        _env("KDT_DEFECTDOJO_URL"),
        _env("KDT_DEFECTDOJO_TOKEN"),
    )


def _request_with_retry(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    retries: int = _DEFAULT_RETRIES,
    backoff_base: float = _DEFAULT_BACKOFF,
    timeout: int = _DEFAULT_TIMEOUT_SEC,
) -> requests.Response:
    """GET/POST с экспоненциальным backoff на 5xx/429/network/timeout."""
    last_exc: Optional[Exception] = None
    for attempt in range(int(retries) + 1):
        try:
            resp = requests.request(
                method,
                url,
                headers=headers,
                params=params,
                json=json_body,
                timeout=timeout,
            )
            if resp.status_code in (429,) or resp.status_code >= 500:
                raise _RetryableError(f"http_{resp.status_code}")
            return resp
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, _RetryableError) as exc:  # noqa: E501
            last_exc = exc
            if attempt >= int(retries):
                break
            delay = float(backoff_base) ** attempt
            logger.warning("dojo_sync retry %d/%d after %.2fs: %s", attempt + 1, retries, delay, exc)
            time.sleep(delay)
    raise last_exc if last_exc is not None else RuntimeError("dojo_sync request failed")


def _headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Token {token}", "accept": "application/json"}


# ───────────────────────── push / pull ─────────────────────────


def _find_existing_finding(
    unique_id: str,
    test_id: Any,
    *,
    dojo_url: str,
    token: str,
    timeout: int,
) -> Optional[int]:
    endpoint = f"{dojo_url}/api/v2/findings/"
    resp = _request_with_retry(
        "GET",
        endpoint,
        headers=_headers(token),
        params={"unique_id_from_tool": unique_id, "test": test_id, "limit": 1},
        timeout=timeout,
    )
    if resp.status_code >= 400:
        return None
    body = resp.json()
    rows = body.get("results") if isinstance(body, dict) else body
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict) and row.get("id") is not None:
                return int(row["id"])
    return None


def push_findings_to_dojo(
    findings: Iterable[Mapping[str, Any]],
    *,
    test_id: Any = None,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
    active: bool = True,
    timeout: int = _DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """
    POST /api/v2/findings/ для каждой находки (dedup по unique_id_from_tool).

    Returns:
      ok, created, deduped, failed, errors:[...], pushed_ids:[...]
    """
    url_base = (dojo_url or _config()[0]).rstrip("/")
    api_token = token or _config()[1]
    if not url_base or not api_token:
        return {"ok": False, "created": 0, "deduped": 0, "failed": 0, "errors": ["not_configured"]}
    if test_id is None or test_id == "":
        return {"ok": False, "created": 0, "deduped": 0, "failed": 0, "errors": ["test_id_required"]}

    created = 0
    deduped = 0
    failed = 0
    errors: List[str] = []
    pushed_ids: List[int] = []
    endpoint = f"{url_base}/api/v2/findings/"

    for finding in findings:
        if not isinstance(finding, Mapping):
            continue
        unique_id = finding_unique_id(finding)
        payload = finding_to_dojo_payload(
            finding, test_id=test_id, active=active
        )
        try:
            existing = _find_existing_finding(
                unique_id, test_id, dojo_url=url_base, token=api_token, timeout=timeout
            )
            if existing is not None:
                deduped += 1
                pushed_ids.append(existing)
                continue
            resp = _request_with_retry(
                "POST",
                endpoint,
                headers=_headers(api_token),
                json_body=payload,
                timeout=timeout,
            )
            if resp.status_code >= 400:
                failed += 1
                errors.append(f"http_{resp.status_code}")
                continue
            body = resp.json()
            new_id = body.get("id") if isinstance(body, dict) else None
            if new_id is not None:
                pushed_ids.append(int(new_id))
            created += 1
        except Exception as exc:  # noqa: BLE001 — один failed не валит пачку
            failed += 1
            errors.append(str(exc))

    return {
        "ok": failed == 0 and not errors,
        "created": created,
        "deduped": deduped,
        "failed": failed,
        "errors": errors,
        "pushed_ids": pushed_ids,
    }


@dataclass
class DojoStatusRow:
    """Обратный статус одной находки из Dojo."""

    fingerprint: str
    unique_id: str
    active: bool = True
    false_p: bool = False
    is_mitigated: bool = False
    risk_accepted: bool = False
    severity: str = ""
    finding_id: Optional[int] = None

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _row_bool(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    return str(raw).lower() in {"1", "true", "yes", "on"}


def pull_dojo_statuses(
    findings: Sequence[Mapping[str, Any]],
    *,
    test_id: Any = None,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
    timeout: int = _DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """
    GET /api/v2/findings/ по unique_id_from_tool → статусы по fingerprint.

    Returns:
      ok, rows:[DojoStatusRow dict], suppressed:[fingerprint], active_count, suppressed_count
    """
    url_base = (dojo_url or _config()[0]).rstrip("/")
    api_token = token or _config()[1]
    if not url_base or not api_token:
        return {"ok": False, "rows": [], "suppressed": [], "active_count": 0, "suppressed_count": 0, "error": "not_configured"}

    endpoint = f"{url_base}/api/v2/findings/"
    rows: List[DojoStatusRow] = []
    for finding in findings:
        if not isinstance(finding, Mapping):
            continue
        unique_id = finding_unique_id(finding)
        fp = finding_fingerprint(finding)
        try:
            resp = _request_with_retry(
                "GET",
                endpoint,
                headers=_headers(api_token),
                params={"unique_id_from_tool": unique_id, "limit": 1},
                timeout=timeout,
            )
            if resp.status_code >= 400:
                # находка ещё не в Dojo → считаем активной (не подавленной)
                rows.append(DojoStatusRow(fingerprint=fp, unique_id=unique_id, active=True))
                continue
            body = resp.json()
            found = None
            raw_rows = body.get("results") if isinstance(body, dict) else body
            if isinstance(raw_rows, list) and raw_rows:
                for row in raw_rows:
                    if isinstance(row, dict):
                        found = row
                        break
            if found is None:
                rows.append(DojoStatusRow(fingerprint=fp, unique_id=unique_id, active=True))
                continue
            rows.append(
                DojoStatusRow(
                    fingerprint=fp,
                    unique_id=unique_id,
                    active=_row_bool(found.get("active")),
                    false_p=_row_bool(found.get("false_p")),
                    is_mitigated=_row_bool(found.get("is_mitigated")),
                    risk_accepted=_row_bool(found.get("risk_accepted")),
                    severity=_canonical_severity(found.get("severity")),
                    finding_id=found.get("id"),
                )
            )
        except Exception as exc:  # noqa: BLE001 — сеть не должна валить пачку
            logger.warning("dojo_sync pull failed for %s: %s", fp, exc)
            rows.append(DojoStatusRow(fingerprint=fp, unique_id=unique_id, active=True))

    suppressed = [
        r.fingerprint
        for r in rows
        if r.false_p or r.is_mitigated or r.risk_accepted or not r.active
    ]
    return {
        "ok": True,
        "rows": [r.as_dict() for r in rows],
        "suppressed": suppressed,
        "active_count": sum(1 for r in rows if r.fingerprint not in suppressed),
        "suppressed_count": len(suppressed),
    }


def apply_dojo_suppressions(
    findings: Sequence[Mapping[str, Any]],
    statuses: Mapping[str, Any],
) -> Tuple[List[Mapping[str, Any]], List[Mapping[str, Any]]]:
    """
    Разбить findings на (active, suppressed) по обратным статусам Dojo.

    ``statuses`` — результат ``pull_dojo_statuses``. Подавленная находка
    (False Positive / mitigated / risk accepted / inactive) уходит в suppressed
    и не попадает в Allure3 categories активного отчёта.
    """
    suppressed_set = set(statuses.get("suppressed") or [])
    active: List[Mapping[str, Any]] = []
    suppressed: List[Mapping[str, Any]] = []
    for f in findings:
        if not isinstance(f, Mapping):
            continue
        if finding_fingerprint(f) in suppressed_set:
            suppressed.append(dict(f))
        else:
            active.append(dict(f))
    return active, suppressed


# ───────────────────────── state ledger ─────────────────────────


def _state_path() -> Path:
    from utils.paths import LIVE_DIR, ensure_live_dir

    ensure_live_dir()
    return LIVE_DIR / "dojo_sync_state.json"


def load_sync_state() -> Dict[str, Any]:
    path = _state_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def save_sync_state(patch: Dict[str, Any]) -> Dict[str, Any]:
    state = load_sync_state()
    state.update({k: v for k, v in patch.items() if v is not None})
    path = _state_path()
    try:
        path.write_text(json.dumps(state, ensure_ascii=False, indent=0), encoding="utf-8")
    except OSError as exc:
        logger.warning("dojo_sync state write: %s", exc)
    return state


def sync_status() -> Dict[str, Any]:
    """Текущее состояние синка (для Admin UI GET /api/dojo/sync/status)."""
    state = load_sync_state()
    running = _worker is not None and _worker.is_alive()
    try:
        from adapters.defectdojo_client import _env as _dojo_env

        dojo_configured = bool(
            _dojo_env("KDT_DEFECTDOJO_URL") and _dojo_env("KDT_DEFECTDOJO_TOKEN")
        )
    except Exception:
        dojo_configured = False
    return {
        "ok": True,
        "configured": dojo_configured,
        "running": running,
        "last_sync_at": state.get("last_sync_at"),
        "last_sync_ok": state.get("last_sync_ok"),
        "pushed": state.get("pushed", 0),
        "deduped": state.get("deduped", 0),
        "active_count": state.get("active_count", 0),
        "suppressed_count": state.get("suppressed_count", 0),
        "last_error": state.get("last_error"),
        "test_id": state.get("test_id"),
    }


# ───────────────────────── orchestration ─────────────────────────


def collect_pending_findings() -> List[Dict[str, Any]]:
    """Собрать находки для пуша: явные → run_summary fuzz_findings → пусто."""
    from utils.reporter import read_live_run_summary

    summary = read_live_run_summary() or {}
    fuzz = summary.get("fuzz_findings") if isinstance(summary, dict) else None
    items = fuzz.get("items") if isinstance(fuzz, dict) else None
    if isinstance(items, list):
        return [f for f in items if isinstance(f, dict)]
    return []


def dojo_sync_now(
    findings: Optional[Sequence[Mapping[str, Any]]] = None,
    *,
    test_id: Any = None,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
) -> Dict[str, Any]:
    """Один полный проход: push → pull → подавления → состояние.

    Без ``findings`` берёт pending из последнего run_summary (fuzz_findings).
    """
    items = list(findings or collect_pending_findings())
    state_patch: Dict[str, Any] = {"last_sync_at": time.time()}
    try:
        pushed = push_findings_to_dojo(
            items, test_id=test_id, dojo_url=dojo_url, token=token
        )
        statuses = pull_dojo_statuses(
            items, test_id=test_id, dojo_url=dojo_url, token=token
        )
        active, suppressed = apply_dojo_suppressions(items, statuses)
        ok = bool(pushed.get("ok")) and bool(statuses.get("ok"))
        state_patch.update(
            {
                "last_sync_ok": ok,
                "pushed": pushed.get("created", 0),
                "deduped": pushed.get("deduped", 0),
                "failed": pushed.get("failed", 0),
                "active_count": len(active),
                "suppressed_count": len(suppressed),
                "suppressed": suppressed,
                "test_id": test_id,
                "last_error": None,
            }
        )
        return {
            "ok": ok,
            "push": pushed,
            "statuses": statuses,
            "active": active,
            "suppressed": suppressed,
            "state": save_sync_state(state_patch),
        }
    except Exception as exc:  # noqa: BLE001 — sync never raises to Live
        logger.error("dojo_sync_now failed: %s", exc)
        state_patch.update({"last_sync_ok": False, "last_error": str(exc)})
        return {"ok": False, "error": str(exc), "state": save_sync_state(state_patch)}


# ───────────────────────── background worker ─────────────────────────

_worker: Optional["DojoSyncWorker"] = None
_worker_lock = threading.Lock()


class DojoSyncWorker(threading.Thread):
    """Фоновый прогон синка (non-blocking для Live POST /trigger)."""

    def __init__(self, findings: Optional[Sequence[Mapping[str, Any]]] = None, **kwargs: Any):
        super().__init__(name="dojo-sync", daemon=True)
        self.findings = findings
        self.kwargs = kwargs
        self.result: Optional[Dict[str, Any]] = None

    def run(self) -> None:
        self.result = dojo_sync_now(self.findings, **self.kwargs)


def start_sync_worker(
    findings: Optional[Sequence[Mapping[str, Any]]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Запустить (или вернуть статус) фоновый синк. Один инстанс одновременно."""
    global _worker
    with _worker_lock:
        if _worker is not None and _worker.is_alive():
            return {"ok": True, "started": False, "already_running": True}
        _worker = DojoSyncWorker(findings, **kwargs)
        _worker.start()
        return {"ok": True, "started": True, "already_running": False}
