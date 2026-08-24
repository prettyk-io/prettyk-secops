# -*- coding: utf-8 -*-
"""ADM-B1: append-only Live runs index (NDJSON lab)."""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.env_dual import pk_env

try:
    from utils.diary_bus import LIVE_DIR
except Exception:  # pragma: no cover
    LIVE_DIR = Path(__file__).resolve().parents[2] / "reports" / "live"

INDEX_NAME = "runs_index.ndjson"
MAX_ROWS = 2000


def runs_index_path() -> Path:
    override = (pk_env("RUNS_INDEX_PATH") or "").strip()
    if override:
        return Path(override)
    return Path(LIVE_DIR) / INDEX_NAME


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def append_run_index(row: Dict[str, Any]) -> Dict[str, Any]:
    """Append one run row; returns normalized record.

    Space fields (MH-4/MH-5): instance_id, app_code, deploy_url,
    first_run_ts, last_run_ts — append-only; не перезаписываются
    пустыми значениями из run_ended/CI.
    """
    rec = {
        "run_id": str(row.get("run_id") or "").strip(),
        "check_id": str(row.get("check_id") or "").strip() or None,
        "instance_id": str(row.get("instance_id") or "").strip() or None,
        "app_code": str(row.get("app_code") or "").strip() or None,
        "deploy_url": str(row.get("deploy_url") or "").strip() or None,
        "started_at": str(row.get("started_at") or "").strip() or None,
        "ended_at": str(row.get("ended_at") or _now_iso()),
        "status": str(row.get("status") or "unknown").strip() or "unknown",
        "ci_verdict": str(row.get("ci_verdict") or "").strip() or None,
        "owner_user_id": str(row.get("owner_user_id") or "").strip() or None,
        "source": str(row.get("source") or "live").strip() or "live",
        "indexed_at": _now_iso(),
    }
    # Timestamps (unix float — MH-4/MH-5)
    first_run_ts = row.get("first_run_ts")
    if isinstance(first_run_ts, (int, float)):
        rec["first_run_ts"] = float(first_run_ts)
    last_run_ts = row.get("last_run_ts")
    if isinstance(last_run_ts, (int, float)):
        rec["last_run_ts"] = float(last_run_ts)
        # Если first_run_ts ещё не был задан — ставим = last_run_ts
        if not rec.get("first_run_ts"):
            rec["first_run_ts"] = float(last_run_ts)

    if not rec["run_id"]:
        raise ValueError("run_id required")
    # Clean None-valued space fields
    for f in ("instance_id", "app_code", "deploy_url"):
        if not rec[f]:
            rec[f] = None

    path = runs_index_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec


def upsert_run_index(row: Dict[str, Any]) -> Dict[str, Any]:
    """Merge-append: если run_id уже есть — обновляем
    runtime-поля (status/ended_at/ci_verdict), но НЕ перезаписываем
    space-поля (instance_id/app_code/deploy_url/first_run_ts/last_run_ts)
    пустыми значениями."""
    rid = str(row.get("run_id") or "").strip()
    if not rid:
        raise ValueError("run_id required")
    existing = _lookup_run_index(rid)
    merged = dict(existing) if existing else {}
    # Space: только если входящий их несёт (start_run), не затирать пустыми
    for f in ("instance_id", "app_code", "deploy_url", "first_run_ts", "last_run_ts"):
        incoming = row.get(f)
        if f.endswith("_ts"):
            if isinstance(incoming, (int, float)) and not merged.get(f):
                merged[f] = float(incoming)
        else:
            incoming_str = str(incoming or "").strip()
            if incoming_str and not merged.get(f):
                merged[f] = incoming_str
    # Runtime: входящий всегда побеждает
    for f in ("check_id", "status", "ci_verdict", "owner_user_id", "source",
              "started_at", "ended_at"):
        incoming = row.get(f)
        if incoming is not None and str(incoming or "").strip():
            merged[f] = str(incoming).strip()
    merged["run_id"] = rid
    merged["indexed_at"] = _now_iso()
    # Clean
    for f in ("instance_id", "app_code", "deploy_url"):
        if not merged.get(f):
            merged[f] = None
    # Timestamps
    for f in ("first_run_ts", "last_run_ts"):
        ts = merged.get(f)
        if isinstance(ts, (int, float)):
            merged[f] = float(ts)
        else:
            merged.pop(f, None)
    return append_run_index(merged)


def _lookup_run_index(run_id: str) -> Optional[Dict[str, Any]]:
    """Найти последнюю запись по run_id в runs_index."""
    path = runs_index_path()
    if not path.is_file():
        return None
    found: Optional[Dict[str, Any]] = None
    try:
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict) and obj.get("run_id") == run_id:
                    found = obj
    except OSError:
        pass
    return found


def _parse_run_index_lines(text: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and obj.get("run_id"):
            rows.append(obj)
    return rows


def _dedupe_runs_newest_first(rows: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    rows = rows[-MAX_ROWS:]
    rows.reverse()
    deduped: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for rec in rows:
        rid = str(rec.get("run_id") or "")
        if not rid or rid in seen:
            continue
        seen.add(rid)
        deduped.append(rec)
        if len(deduped) >= max(0, int(limit)):
            break
    return deduped


def list_run_index(*, limit: int = 200) -> List[Dict[str, Any]]:
    path = runs_index_path()
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    return _dedupe_runs_newest_first(_parse_run_index_lines(text), limit)


def append_from_ci_payload(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    run_id = str(payload.get("run_id") or payload.get("session") or "").strip()
    if not run_id:
        return None
    try:
        return append_run_index(
            {
                "run_id": run_id,
                "check_id": payload.get("check_id"),
                "status": payload.get("status") or payload.get("phase") or "unknown",
                "ci_verdict": payload.get("verdict") or payload.get("ci_verdict"),
                "owner_user_id": payload.get("owner_user_id"),
                "ended_at": payload.get("ended_at"),
                "started_at": payload.get("started_at"),
                "source": "ci_status",
            }
        )
    except ValueError:
        return None


def _ts_of(rec: Dict[str, Any], key: str) -> float:
    v = rec.get(key)
    if isinstance(v, (int, float)):
        return float(v)
    return 0.0


def list_run_apps() -> List[Dict[str, Any]]:
    """MH-3: сгруппировать runs_index в app-code → deployments → instances.

    Returns (sorted: last_run_ts desc, first_run_ts desc):
    [
      {
        "app_code": "IB_WEB",
        "first_run_ts": 1000.0,
        "last_run_ts": 3000.0,
        "deploys": [
          {
            "deploy_url": "https://ib.local/",
            "instances": [
              {
                "instance_id": "ck1",
                "check_id": "ck1",
                "run_id": "r2",
                "last_run_ts": 3000.0,
                "status": "success",
                "owner": "appsec-expert",
              },
            ],
          },
        ],
      },
    ]
    """
    rows = list_run_index(limit=MAX_ROWS)
    apps: Dict[str, Dict[str, Any]] = {}

    for rec in rows:
        app_code = str(rec.get("app_code") or "").strip()
        if not app_code:
            continue
        deploy_url = str(rec.get("deploy_url") or "").strip()
        instance_id = str(rec.get("instance_id") or rec.get("check_id") or "").strip()
        run_id = str(rec.get("run_id") or "").strip()
        last_ts = _ts_of(rec, "last_run_ts") or _ts_of(rec, "first_run_ts")

        app = apps.setdefault(
            app_code,
            {"app_code": app_code, "first_run_ts": 0.0, "last_run_ts": 0.0, "deploys": {}},
        )
        # app-level timestamps
        first_ts = _ts_of(rec, "first_run_ts")
        if first_ts and (not app["first_run_ts"] or first_ts < app["first_run_ts"]):
            app["first_run_ts"] = first_ts
        if last_ts and last_ts > app["last_run_ts"]:
            app["last_run_ts"] = last_ts

        deploys = app["deploys"]
        deploy = deploys.setdefault(deploy_url, {"deploy_url": deploy_url, "instances": {}})
        insts = deploy["instances"]
        inst = insts.get(instance_id)
        if not inst or last_ts > _ts_of(inst, "last_run_ts"):
            insts[instance_id] = {
                "instance_id": instance_id,
                "check_id": str(rec.get("check_id") or "").strip() or None,
                "run_id": run_id,
                "last_run_ts": last_ts,
                "status": str(rec.get("status") or "unknown"),
                "owner": str(rec.get("owner_user_id") or "").strip() or None,
            }

    out: List[Dict[str, Any]] = []
    for app in apps.values():
        deploys_list: List[Dict[str, Any]] = []
        for dep in app["deploys"].values():
            insts_list = list(dep["instances"].values())
            insts_list.sort(key=lambda x: _ts_of(x, "last_run_ts"), reverse=True)
            deploys_list.append(
                {"deploy_url": dep["deploy_url"], "instances": insts_list}
            )
        deploys_list.sort(
            key=lambda d: max((_ts_of(i, "last_run_ts") for i in d["instances"]), default=0.0),
            reverse=True,
        )
        out.append(
            {
                "app_code": app["app_code"],
                "first_run_ts": app["first_run_ts"],
                "last_run_ts": app["last_run_ts"],
                "deploys": deploys_list,
            }
        )

    out.sort(
        key=lambda a: (_ts_of(a, "last_run_ts"), _ts_of(a, "first_run_ts")),
        reverse=True,
    )
    return out
