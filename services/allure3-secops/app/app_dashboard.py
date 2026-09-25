# -*- coding: utf-8 -*-
"""AL3-INSTANCE I2a/c: self-contained app dashboard from runs_index.ndjson.

Дублирует логику orchestrator/utils/runs_index.py list_run_apps(),
но без зависимостей от diary_bus / LIVE_DIR — только чтение NDJSON.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

_RUNS_INDEX_DIR = Path(os.environ.get("RUNS_INDEX_DIR", "/app/runs-index"))
_INDEX_NAME = "runs_index.ndjson"
_MAX_ROWS = 2000


def _ts_of(rec: Dict[str, Any], key: str) -> float:
    v = rec.get(key)
    if isinstance(v, (int, float)):
        return float(v)
    return 0.0


def _parse_lines(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    if not path.is_file():
        return rows
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
                if isinstance(obj, dict) and obj.get("run_id"):
                    rows.append(obj)
    except OSError:
        return []
    return rows


def _dedupe_newest_first(rows: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    rows = rows[-_MAX_ROWS:]
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


def list_run_apps() -> List[Dict[str, Any]]:
    path = _RUNS_INDEX_DIR / _INDEX_NAME
    rows = _dedupe_newest_first(_parse_lines(path), _MAX_ROWS)
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
                "ci_verdict": str(rec.get("ci_verdict") or "").strip() or None,
            }

    out: List[Dict[str, Any]] = []
    for app in apps.values():
        deploys_list: List[Dict[str, Any]] = []
        for dep in app["deploys"].values():
            insts_list = list(dep["instances"].values())
            insts_list.sort(key=lambda x: _ts_of(x, "last_run_ts"), reverse=True)
            deploys_list.append({"deploy_url": dep["deploy_url"], "instances": insts_list})
        deploys_list.sort(
            key=lambda d: max((_ts_of(i, "last_run_ts") for i in d["instances"]), default=0.0),
            reverse=True,
        )
        out.append({
            "app_code": app["app_code"],
            "first_run_ts": app["first_run_ts"],
            "last_run_ts": app["last_run_ts"],
            "deploys": deploys_list,
        })

    out.sort(
        key=lambda a: (_ts_of(a, "last_run_ts"), _ts_of(a, "first_run_ts")),
        reverse=True,
    )
    return out


def find_app(app_code: str) -> Optional[Dict[str, Any]]:
    for app in list_run_apps():
        if app.get("app_code") == app_code:
            return app
    return None


STATUS_COLORS = {
    "success": "#22c55e",
    "pass": "#22c55e",
    "has_failures": "#ef4444",
    "fail": "#ef4444",
    "unknown": "#94a3b8",
    "running": "#fbbf24",
}


_STYLE = """\
<style>
    :root {
        --kdt-bg: #0f172a;
        --kdt-card: #1e293b;
        --kdt-border: #334155;
        --kdt-text: #f8fafc;
        --kdt-muted: #94a3b8;
        --kdt-accent: #8ab4f8;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        background: var(--kdt-bg);
        color: var(--kdt-text);
        font: 14px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif;
        padding: 24px;
    }
    .kdt-header {
        display: flex; align-items: center; gap: 12px;
        margin-bottom: 24px; padding-bottom: 12px;
        border-bottom: 1px solid var(--kdt-border);
    }
    .kdt-header__title { font-size: 20px; font-weight: 600; }
    .kdt-header__meta { color: var(--kdt-muted); font-size: 13px; margin-left: auto; }
    .kdt-deploy-card {
        background: var(--kdt-card);
        border: 1px solid var(--kdt-border);
        border-radius: 6px; padding: 16px; margin-bottom: 16px;
    }
    .kdt-deploy-card__url {
        color: var(--kdt-muted); font-size: 12px;
        margin-bottom: 10px; word-break: break-all;
    }
    .kdt-instance-row {
        display: flex; align-items: center; gap: 12px;
        padding: 8px 10px; border-radius: 5px;
        border: 1px solid transparent; margin-bottom: 4px;
    }
    .kdt-instance-row:hover {
        border-color: var(--kdt-border);
        background: rgba(51,65,85,0.3);
    }
    .kdt-instance-row__dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .kdt-instance-row__id { font-weight: 500; min-width: 120px; }
    .kdt-instance-row__id a { color: var(--kdt-accent); text-decoration: none; }
    .kdt-instance-row__id a:hover { text-decoration: underline; }
    .kdt-instance-row__status { font-size: 12px; min-width: 90px; }
    .kdt-instance-row__meta { color: var(--kdt-muted); font-size: 11px; margin-left: auto; }
    .kdt-empty { color: var(--kdt-muted); font-style: italic; padding: 24px 0; }
</style>"""


def _render_status(status: str) -> str:
    color = STATUS_COLORS.get(status, STATUS_COLORS["unknown"])
    label = {
        "success": "OK", "pass": "OK", "has_failures": "Fail",
        "fail": "Fail", "running": "Run…", "unknown": "?",
    }.get(status, status)
    return f'<span class="kdt-instance-row__dot" style="background:{color}" title="{status}"></span> <span class="kdt-instance-row__status">{label}</span>'


def _render_instance_row(inst: Dict[str, Any]) -> str:
    check_id = str(inst.get("check_id") or inst.get("instance_id") or "").strip()
    status = str(inst.get("status") or "unknown")
    owner = str(inst.get("owner") or "")
    verdict = str(inst.get("ci_verdict") or "")
    parts = [
        '<div class="kdt-instance-row">',
        _render_status(status),
        '<span class="kdt-instance-row__id">',
        f'<a href="/projects/{check_id}/reports/latest/">',
        check_id[:16] if check_id else "—",
        "</a>",
        "</span>",
    ]
    meta = owner
    if verdict:
        meta = f"{verdict} · {owner}" if owner else verdict
    if meta:
        parts.append(f'<span class="kdt-instance-row__meta">{meta}</span>')
    parts.append("</div>")
    return "".join(parts)


def _render_deploy(deploy: Dict[str, Any]) -> str:
    deploy_url = str(deploy.get("deploy_url") or "—")
    instances = deploy.get("instances") or []
    rows = "".join(_render_instance_row(i) for i in instances) if instances else '<div class="kdt-empty">Нет проверок</div>'
    return f"""\
<div class="kdt-deploy-card">
    <div class="kdt-deploy-card__url">{deploy_url}</div>
    {rows}
</div>"""


def _render_app(app: Dict[str, Any]) -> str:
    app_code = str(app.get("app_code") or "")
    deploys = app.get("deploys") or []
    cards = "".join(_render_deploy(d) for d in deploys) if deploys else '<div class="kdt-empty">Нет deployments</div>'
    return f"""\
<div class="kdt-deploy-card">
    <div class="kdt-deploy-card__url" style="font-weight:600;font-size:13px;color:var(--kdt-text)">{app_code}</div>
    {cards}
</div>"""


def render_app_dashboard(app_code: str) -> str:
    if app_code == "_all":
        apps = list_run_apps()
        body = "".join(_render_app(a) for a in apps) if apps else '<div class="kdt-empty">Нет данных о приложениях (runs_index пуст)</div>'
    else:
        app = find_app(app_code)
        if not app:
            body = f'<div class="kdt-empty">Приложение <b>{app_code}</b> не найдено в runs_index</div>'
        else:
            body = _render_app(app)

    title = f"App {app_code}" if app_code != "_all" else "Все приложения"
    return f"""\
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>{title} — SecOps Lab</title>{_STYLE}</head>
<body>
<div id="kdt-app">
    <header class="kdt-header">
        <span class="kdt-header__title">SecOps Lab</span>
        <span class="kdt-header__meta">{title}</span>
    </header>
    <main class="kdt-main">
        {body}
    </main>
</div>
</body>
</html>"""