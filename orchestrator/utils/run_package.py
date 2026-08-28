# -*- coding: utf-8 -*-
"""
RES-7 MVP: zip-пакет прогона.

Состав (минимум):
  logs/diary/*          — Live export ndjson (или текущий diary.ndjson)
  logs/cuts/*           — LOG-CUT файлы
  meta/meta.json        — Live meta
  meta/results_hooks.json
  meta/run_ui_summary.json — RES-4 сводка (если есть)
  meta/severity_trend.ndjson — RES-4 тренд (если есть)
  meta/package.json     — опись пакета
  fuzz/*                — reports/fuzz/*.json (если есть)
  run/*                 — Wired.json / runner.log / run_summary.json из run_dir (если найден)

Канон: docs/internal/run-package.md · backlog RES-7
"""
from __future__ import annotations

import json
import re
import time
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from utils.paths import (
    DIARY_NDJSON,
    LIVE_DIR,
    LIVE_META_JSON,
    REPORTS_DIR,
    RESULTS_HOOKS_JSON,
    RUNS_DIR,
    ensure_live_exports_dir,
    ensure_runs_dir,
)

_SAFE_STEM = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_stem(raw: str, fallback: str = "run") -> str:
    text = _SAFE_STEM.sub("_", (raw or "").strip())[:80].strip("._-")
    return text or fallback


def _read_json_file(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def resolve_run_dir(run_id: str = "") -> Optional[Path]:
    """Каталог reports/runs/<id> с артефактами прогона."""
    wanted = (run_id or "").strip()
    if wanted:
        cand = ensure_runs_dir() / wanted
        if cand.is_dir():
            return cand
    # meta hint
    try:
        from utils import diary_bus

        meta = diary_bus.get_meta()
        for key in ("last_export_run_id", "session_name"):
            hint = str(meta.get(key) or "").strip()
            if hint:
                cand = ensure_runs_dir() / hint
                if cand.is_dir():
                    return cand
    except Exception:
        pass
    # newest run dir with log_cuts or wired
    root = Path(RUNS_DIR)
    if not root.is_dir():
        return None
    dirs = [p for p in root.iterdir() if p.is_dir()]
    dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for d in dirs:
        if (d / "log_cuts").is_dir() or (d / "Wired.json").is_file():
            return d
    return dirs[0] if dirs else None


def collect_cut_files(run_dir: Optional[Path]) -> List[Path]:
    candidates: List[Path] = []
    if run_dir is not None:
        cuts = run_dir / "log_cuts"
        if cuts.is_dir():
            candidates.extend(sorted(cuts.glob("*")))
    live_cuts = Path(LIVE_DIR) / "log_cuts"
    if live_cuts.is_dir():
        for p in sorted(live_cuts.glob("*")):
            if p.is_file() and p not in candidates:
                candidates.append(p)
    return [p for p in candidates if p.is_file()]


def collect_fuzz_files(limit: int = 40) -> List[Path]:
    fuzz_dir = Path(REPORTS_DIR) / "fuzz"
    if not fuzz_dir.is_dir():
        return []
    files = [p for p in fuzz_dir.glob("*.json") if p.is_file()]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return files[:limit]


def _esc(text: Any) -> str:
    return (
        str(text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


_REDACT_PATTERNS = (
    # `-` at end of class — avoid accidental ranges / duplicate chars (S5869).
    (re.compile(r"(?i)(Bearer\s+)[A-Za-z0-9._+=/-]+"), r"\1***"),
    (re.compile(r"(?i)(Authorization:\s*Bearer\s+)[A-Za-z0-9._+=/-]+"), r"\1***"),
    (re.compile(r"(?i)(Authorization:\s*Basic\s+)[A-Za-z0-9+/=]+"), r"\1***"),
    (re.compile(r"(?i)(Cookie:\s*)[^\r\n]+"), r"\1***"),
    (re.compile(r"(?i)(Set-Cookie:\s*)[^\r\n]+"), r"\1***"),
    (re.compile(r"(?i)\b(api[_-]?key|access[_-]?token|secret|client_secret)\s*[=:]\s*([\"']?)[^\s\"']+\2"), r"\1=\2***\2"),
    (re.compile(r'(?i)(password\s*[=:]\s*)(["\']?)[^\s"\']+\2'), r"\1\2***\2"),
    (re.compile(r'(?i)("(password|token|api_key|access_token|secret|client_secret)"\s*:\s*")[^"]*(")'), r"\1***\3"),
    # JWT-ish compact (header.payload.sig)
    (re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"), "***"),
)


def redact_diary_text(text: str) -> str:
    """Lab package redact for diary (stronger than MVP; not bank DLP suite)."""
    out = text or ""
    for pat, repl in _REDACT_PATTERNS:
        out = pat.sub(repl, out)
    return out


def _counts_source_label(raw: Any) -> str:
    key = str(raw or "").strip()
    return {
        "dojo_stats": "Dojo ACTIVE (stats)",
        "dojo_findings": "Dojo ACTIVE (findings)",
        "scanner": "scanner fallback",
    }.get(key, key or "—")


def _filter_audit_line(audit: Any) -> str:
    if not isinstance(audit, dict):
        return "—"
    parts = []
    for key in (
        "raw",
        "kept",
        "dropped_fp",
        "dropped_dup",
        "dropped_mitigated",
        "dropped_waiver",
        "pages",
    ):
        if isinstance(audit.get(key), (int, float)):
            parts.append(f"{key}={int(audit[key])}")
    return ", ".join(parts) if parts else "—"


def _allure_summary_line(allure: Dict[str, Any]) -> str:
    summary = allure.get("summary") if isinstance(allure.get("summary"), dict) else {}
    if summary:
        bits = []
        for key in ("passed", "failed", "broken", "skipped"):
            if key in summary:
                bits.append(f"{key}={summary.get(key)}")
        if bits:
            return "Allure: " + ", ".join(bits)
        if summary.get("status"):
            return f"Allure: status={summary.get('status')}"
    st = allure.get("status")
    return f"Allure: status={st}" if st else "Allure: —"


def is_admission_axis_ready(meta: Dict[str, Any]) -> bool:
    """
    Ось допуска авторитетна — зеркало FE launchUi.isAdmissionAxisReady.
    true: pass / pass_watch / pass_edge / fail_gate (не VOID, не crash).
    """
    exit_code = meta.get("ci_exit_code")
    verdict = str(meta.get("ci_verdict") or "").strip().lower()
    hints = meta.get("ci_risk_hints") if isinstance(meta.get("ci_risk_hints"), dict) else {}
    if hints.get("admission_void") is True or hints.get("debug_mode") is True:
        return False
    if exit_code == 1 or verdict == "fail_run":
        return False
    if verdict in {"idle", "running", ""}:
        return False
    return verdict in {"pass", "pass_watch", "pass_edge", "fail_gate"}


def package_act_decision(meta: Dict[str, Any]) -> Tuple[bool, str]:
    """Нужен ли act/act.html в zip. (include, omit_reason)."""
    if meta.get("generate_act") is not True:
        return False, "generate_act_off"
    if not is_admission_axis_ready(meta):
        return False, "admission_axis_not_ready"
    return True, ""


def _execution_axis_label(
    exit_code: Any, verdict: str, kind: str
) -> str:
    if verdict == "fail_run" or exit_code == 1:
        if kind == "webdriver":
            return "Исполнение: сбой WebDriver/Selenium (exit 1)"
        return "Исполнение: сбой (exit 1)"
    if isinstance(exit_code, int) or verdict in {
        "pass",
        "pass_watch",
        "pass_edge",
        "fail_gate",
    }:
        return "Исполнение: завершено"
    return "Исполнение: —"


def _admission_axis_label(
    *,
    admission_void: bool,
    debug_mode: bool,
    verdict: str,
    gate: str,
) -> str:
    if admission_void:
        if debug_mode:
            return "Допуск: недействителен (режим отладки)"
        return "Допуск: недействителен"
    if verdict == "fail_gate" or gate == "fail":
        return "Допуск: не пройден"
    if verdict in {"pass_watch", "pass_edge"} or gate == "watch":
        return "Допуск: с замечаниями"
    if verdict == "pass" or gate in {"pass", "ok"}:
        return "Допуск: пройден"
    return "Допуск: —"


def _axis_labels(meta: Dict[str, Any]) -> Tuple[str, str]:
    exit_code = meta.get("ci_exit_code")
    verdict = str(meta.get("ci_verdict") or "").strip().lower()
    gate = str(meta.get("ci_gate") or "").strip().lower()
    hints = meta.get("ci_risk_hints") if isinstance(meta.get("ci_risk_hints"), dict) else {}
    kind = str(hints.get("execution_fault_kind") or "").strip().lower()
    admission_void = (
        hints.get("admission_void") is True
        or verdict == "fail_run"
        or exit_code == 1
        or gate in {"void", "error"}
    )
    return (
        _execution_axis_label(exit_code, verdict, kind),
        _admission_axis_label(
            admission_void=admission_void,
            debug_mode=hints.get("debug_mode") is True,
            verdict=verdict,
            gate=gate,
        ),
    )


def _package_exec_block(
    meta: Dict[str, Any],
    dojo: Dict[str, Any],
    stats: Dict[str, Any],
    collapse: Dict[str, Any],
) -> Tuple[str, List[str]]:
    from core.executive_conclusion import build_executive_conclusion

    hook_exec = dojo.get("executive") if isinstance(dojo.get("executive"), dict) else {}
    if isinstance(hook_exec.get("recommendations"), list) and hook_exec.get(
        "executive_class"
    ):
        exec_class = str(hook_exec.get("executive_class") or "")
        rec_items = [
            str(x) for x in hook_exec["recommendations"] if isinstance(x, str) and x.strip()
        ]
        return exec_class, rec_items
    built = build_executive_conclusion(
        counts=stats,
        collapse=collapse if collapse else None,
        ci_verdict=str(meta.get("ci_verdict") or ""),
        ci_gate=str(meta.get("ci_gate") or ""),
        ci_exit_code=meta.get("ci_exit_code"),
        ci_recommendations=meta.get("ci_recommendations")
        if isinstance(meta.get("ci_recommendations"), list)
        else None,
        source=str(dojo.get("counts_source") or ""),
    )
    return built.executive_class, list(built.recommendations)


def _scenario_outcome_items(hints: Dict[str, Any]) -> List[str]:
    outcomes = (
        hints.get("scenario_outcomes")
        if isinstance(hints.get("scenario_outcomes"), list)
        else []
    )
    labels = {
        "ok": "выполнен",
        "failed": "отказ",
        "fail_allowed": "разведочная проверка (допустимый отказ)",
        "skip": "не запускался",
    }
    items: List[str] = []
    for item in outcomes:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        status = str(item.get("status") or "").strip()
        if not name:
            continue
        items.append(f"{name}: {labels.get(status, status or '—')}")
    return items


def render_package_act_html(
    meta: Dict[str, Any],
    hooks: Dict[str, Any],
    *,
    gate_recalc: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Lab-акт в zip (без letterhead spaceport). Цифры — из Live meta/hooks + collapse.
    Полный канцелярский HTML — кнопка «Сохранить акт» на FE.
    """
    from utils.package_gate_recalc import (
        format_recalc_admission_line,
        recalculate_package_gate,
    )

    dojo = hooks.get("dojo") if isinstance(hooks.get("dojo"), dict) else {}
    allure = hooks.get("allure") if isinstance(hooks.get("allure"), dict) else {}
    stats = dojo.get("stats") if isinstance(dojo.get("stats"), dict) else {}
    collapse = dojo.get("collapse") if isinstance(dojo.get("collapse"), dict) else {}
    top = collapse.get("top_findings") if isinstance(collapse.get("top_findings"), list) else []
    run_id = (
        str(meta.get("last_export_run_id") or meta.get("session_name") or "run").strip()
        or "run"
    )
    execution, admission = _axis_labels(meta)
    recalc = (
        gate_recalc
        if isinstance(gate_recalc, dict)
        else recalculate_package_gate(meta, hooks)
    )
    recalc_line = format_recalc_admission_line(recalc)
    counts_src = _counts_source_label(dojo.get("counts_source") or meta.get("counts_source"))
    audit_line = _filter_audit_line(dojo.get("filter_audit"))
    exec_class, rec_items = _package_exec_block(meta, dojo, stats, collapse)
    if not rec_items:
        recs = meta.get("ci_recommendations")
        rec_items = (
            [str(x) for x in recs if isinstance(x, str) and x.strip()]
            if isinstance(recs, list)
            else []
        )
    rec_html = (
        "<ul>" + "".join(f"<li>{_esc(x)}</li>" for x in rec_items) + "</ul>"
        if rec_items
        else "<p class='muted'>Рекомендации по допуску не сформированы.</p>"
    )
    hints = meta.get("ci_risk_hints") if isinstance(meta.get("ci_risk_hints"), dict) else {}
    outcome_items = _scenario_outcome_items(hints)
    scenarios_html = (
        "<ul>" + "".join(f"<li>{_esc(x)}</li>" for x in outcome_items) + "</ul>"
        if outcome_items
        else "<p class='muted'>Исходы сценариев не переданы.</p>"
    )
    rows = []
    for item in top[:40]:
        if not isinstance(item, dict):
            continue
        rows.append(
            "<tr>"
            f"<td>{_esc(item.get('name'))}</td>"
            f"<td>{_esc(item.get('risk'))}</td>"
            f"<td>{_esc(item.get('count'))}</td>"
            "</tr>"
        )
    if not rows:
        rows.append("<tr><td colspan='3'>—</td></tr>")
    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"/>
<title>Акт (package) — {_esc(run_id)}</title>
<style>
body{{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#1f2328}}
table{{border-collapse:collapse;width:100%;margin-top:12px}}
th,td{{border:1px solid #d1d9e0;padding:6px 8px;text-align:left}}
th{{background:#f6f8fa}}
.muted{{color:#59636e}}
</style></head><body>
<h1>Акт проверки (пакет прогона)</h1>
<p class="muted">Lab-сводка для RES-7 zip. Отраслевой бланк с letterhead — кнопка «Сохранить акт».</p>
<p><b>Сеанс:</b> {_esc(run_id)}<br/>
<b>CI gate:</b> {_esc(meta.get('ci_gate'))} · <b>verdict:</b> {_esc(meta.get('ci_verdict'))}
 · <b>exit:</b> {_esc(meta.get('ci_exit_code'))}<br/>
{"<b>Режим:</b> прогон в режиме отладки (допуск недействителен)<br/>" if hints.get("debug_mode") is True else ""}
<b>Allure:</b> {_esc(allure.get('report_url'))}<br/>
<b>DefectDojo:</b> {_esc(dojo.get('report_url'))}</p>
<h2>Заключение и допуск</h2>
<ul>
<li><b>Заключение (RES-5):</b> {_esc(exec_class or meta.get('executive_class') or '—')}</li>
<li><b>{_esc(execution)}</b></li>
<li><b>{_esc(admission)}</b></li>
<li><b>{_esc(recalc_line)}</b></li>
<li><b>Источник счётчиков (counts_source):</b> {_esc(counts_src)}</li>
<li><b>Фильтр inventory (audit):</b> {_esc(audit_line)}</li>
<li><b>{_esc(_allure_summary_line(allure))}</b></li>
</ul>
<h3>Сценарии (этап-1)</h3>
{scenarios_html}
<h3>Рекомендации</h3>
{rec_html}
<h2>Сводка ACTIVE (hooks.stats)</h2>
<ul>
<li>critical: {_esc(stats.get('critical', 0))}</li>
<li>high: {_esc(stats.get('high', 0))}</li>
<li>medium: {_esc(stats.get('medium', 0))}</li>
<li>low: {_esc(stats.get('low', 0))}</li>
<li>info: {_esc(stats.get('info', 0))}</li>
</ul>
<p class="muted">Collapse: clusters={_esc(collapse.get('cluster_count'))}
 raw={_esc(collapse.get('raw_count'))}
 systemic={_esc(collapse.get('systemic_clusters'))}</p>
<h2>Кластеры (fingerprint / systemic)</h2>
<table><thead><tr><th>Название</th><th>Риск</th><th>Count</th></tr></thead>
<tbody>
{''.join(rows)}
</tbody></table>
</body></html>
"""


class _PackageZipWriter:
    def __init__(self) -> None:
        self.written: List[str] = []

    def add_bytes(self, zf: zipfile.ZipFile, arcname: str, data: bytes) -> None:
        zf.writestr(arcname, data)
        self.written.append(arcname)

    def add_file(self, zf: zipfile.ZipFile, arcname: str, path: Path) -> None:
        zf.write(path, arcname)
        self.written.append(arcname)

    def add_diary_redacted(self, zf: zipfile.ZipFile, arcname: str, path: Path) -> None:
        try:
            raw = path.read_text(encoding="utf-8", errors="replace")
            data = redact_diary_text(raw).encode("utf-8")
            self.add_bytes(zf, arcname, data)
        except OSError:
            self.add_file(zf, arcname, path)

    def add_json(self, zf: zipfile.ZipFile, arcname: str, payload: Any) -> None:
        self.add_bytes(
            zf, arcname, json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        )


def _package_add_diary(w: _PackageZipWriter, zf: zipfile.ZipFile, diary_bus: Any) -> None:
    export = diary_bus.latest_export_ndjson_path()
    if export is not None and export.is_file():
        w.add_diary_redacted(zf, f"logs/diary/{export.name}", export)
        side = export.with_suffix(".json")
        if side.is_file():
            w.add_diary_redacted(zf, f"logs/diary/{side.name}", side)
    elif Path(DIARY_NDJSON).is_file() and Path(DIARY_NDJSON).stat().st_size > 0:
        w.add_diary_redacted(zf, "logs/diary/diary.ndjson", Path(DIARY_NDJSON))


def _package_add_live_meta_files(w: _PackageZipWriter, zf: zipfile.ZipFile) -> None:
    if Path(LIVE_META_JSON).is_file():
        w.add_file(zf, "meta/live_meta_file.json", Path(LIVE_META_JSON))
    if Path(RESULTS_HOOKS_JSON).is_file():
        w.add_file(zf, "meta/results_hooks_file.json", Path(RESULTS_HOOKS_JSON))
    for name in (
        "run_summary.json",
        "run_ui_summary.json",
        "severity_trend.ndjson",
        "check_evidence_refs.json",
    ):
        path = Path(LIVE_DIR) / name
        if path.is_file():
            w.add_file(zf, f"meta/{name}", path)


def _package_add_journal(
    w: _PackageZipWriter,
    zf: zipfile.ZipFile,
    diary_bus: Any,
    *,
    run_id: str,
) -> None:
    try:
        from utils.run_journal import build_journal_from_export

        export = diary_bus.latest_export_ndjson_path()
        if export is None or not export.is_file():
            return
        journal = build_journal_from_export(
            export, preset="signal", run_id=run_id, limit=300
        )
        events = journal.get("events")
        if isinstance(events, list):
            for ev in events:
                if isinstance(ev, dict) and isinstance(ev.get("text"), str):
                    ev["text"] = redact_diary_text(ev["text"])
        w.add_json(zf, "logs/journal/journal.json", journal)
    except Exception:
        pass


def _package_add_run_and_fuzz(
    w: _PackageZipWriter, zf: zipfile.ZipFile, run_dir: Optional[Path]
) -> None:
    if run_dir is not None:
        for name in ("Wired.json", "runner.log", "run_summary.json"):
            p = run_dir / name
            if p.is_file():
                w.add_file(zf, f"run/{name}", p)
    for fuzz in collect_fuzz_files():
        w.add_file(zf, f"fuzz/{fuzz.name}", fuzz)


def _package_secret_gate(
    *,
    zip_path: Path,
    run_dir: Optional[Path],
    run_id: str,
    written: List[str],
) -> Optional[Dict[str, Any]]:
    from utils.secret_scan import (
        package_secret_block_enabled,
        scan_run_dir_for_secrets,
        scan_zip_for_secrets,
        summarize_findings,
    )

    secret_hits: list = []
    if run_dir is not None:
        secret_hits.extend(scan_run_dir_for_secrets(run_dir))
    secret_hits.extend(scan_zip_for_secrets(zip_path))
    seen_keys = set()
    deduped = []
    for hit in secret_hits:
        key = (hit.get("rule"), hit.get("location"))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(hit)
    secret_hits = deduped
    if secret_hits and package_secret_block_enabled():
        summary = summarize_findings(secret_hits)
        try:
            zip_path.unlink()
        except OSError:
            pass
        return {
            "ok": False,
            "error": "plaintext_secrets",
            "path": None,
            "filename": None,
            "run_id": run_id,
            "files": written + ["meta/package.json"],
            "bytes": 0,
            "secret_scan": summary,
        }
    return {"secret_hits": secret_hits, "summarize": summarize_findings}


def build_run_package(
    *,
    run_id: str = "",
    out_dir: Optional[Path] = None,
    recalc_gate: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Собрать zip. Возвращает dict: path, filename, run_id, files[], bytes.

    recalc_gate: MC-RES-3 — пересчёт admission из hooks (None → env PK_PACKAGE_RECALC_GATE).
    """
    from utils import diary_bus
    from utils.package_gate_recalc import recalculate_package_gate

    meta = dict(diary_bus.get_meta())
    rid = (run_id or "").strip() or str(
        meta.get("last_export_run_id") or meta.get("session_name") or ""
    ).strip()
    run_key = rid or f"package-{int(time.time())}"
    # Per-run: fetch only hooks that belong to this run.
    hooks = diary_bus.get_results_hooks(run_id=run_key if run_key else None)
    gate_recalc = recalculate_package_gate(meta, hooks, enabled=recalc_gate)
    stem = _safe_stem(run_key, "package")
    run_dir = resolve_run_dir(rid)

    dest_root = Path(out_dir) if out_dir is not None else ensure_live_exports_dir()
    dest_root.mkdir(parents=True, exist_ok=True)
    zip_path = dest_root / f"{stem}-package.zip"
    if zip_path.is_file():
        zip_path = dest_root / f"{stem}-package-{int(time.time())}.zip"

    w = _PackageZipWriter()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        _package_add_diary(w, zf, diary_bus)
        for cut in collect_cut_files(run_dir):
            w.add_file(zf, f"logs/cuts/{cut.name}", cut)
        w.add_json(zf, "meta/meta.json", meta)
        w.add_json(zf, "meta/results_hooks.json", hooks)
        _package_add_live_meta_files(w, zf)
        _package_add_journal(w, zf, diary_bus, run_id=run_key)
        w.add_json(zf, "meta/package_gate.json", gate_recalc)

        include_act, act_omit_reason = package_act_decision(meta)
        if include_act:
            w.add_bytes(
                zf,
                "act/act.html",
                render_package_act_html(meta, hooks, gate_recalc=gate_recalc).encode(
                    "utf-8"
                ),
            )
        _package_add_run_and_fuzz(w, zf, run_dir)

        inventory: Dict[str, Any] = {
            "kind": "pk_run_package",
            "version": 1,
            "run_id": run_key,
            "built_at": time.time(),
            "run_dir": str(run_dir) if run_dir else None,
            "files": list(w.written) + ["meta/package.json"],
            "gate_recalc": {
                "gate": gate_recalc.get("gate"),
                "verdict": gate_recalc.get("verdict"),
                "diverged": gate_recalc.get("diverged"),
                "skipped": gate_recalc.get("skipped"),
                "enabled": gate_recalc.get("enabled"),
            },
        }
        if include_act:
            inventory["act"] = "included"
        else:
            inventory["act"] = "omitted"
            inventory["act_omit_reason"] = act_omit_reason
        w.add_json(zf, "meta/package.json", inventory)

    gate = _package_secret_gate(
        zip_path=zip_path, run_dir=run_dir, run_id=run_key, written=w.written
    )
    if gate is not None and gate.get("ok") is False:
        return gate
    secret_hits = list((gate or {}).get("secret_hits") or [])
    summarize_findings = (gate or {}).get("summarize")

    try:
        diary_bus.set_meta(
            last_package_path=str(zip_path),
            last_package_at=time.time(),
            last_package_run_id=run_key,
            last_package_secret_hits=len(secret_hits),
        )
    except Exception:
        pass

    out: Dict[str, Any] = {
        "ok": True,
        "path": zip_path,
        "filename": zip_path.name,
        "run_id": run_key,
        "files": w.written + ["meta/package.json"],
        "bytes": zip_path.stat().st_size,
    }
    if secret_hits and callable(summarize_findings):
        out["secret_scan"] = summarize_findings(secret_hits)
        out["secret_scan_allowed"] = True
    return out


def latest_package_path() -> Optional[Path]:
    try:
        from utils import diary_bus

        raw = diary_bus.get_meta().get("last_package_path")
        if isinstance(raw, str) and raw.strip():
            p = Path(raw.strip())
            if p.is_file():
                return p
    except Exception:
        pass
    export_dir = ensure_live_exports_dir()
    cands = sorted(
        export_dir.glob("*-package*.zip"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return cands[0] if cands else None


def build_or_latest_package(
    run_id: str = "",
    *,
    recalc_gate: Optional[bool] = None,
) -> Tuple[Optional[Path], Dict[str, Any]]:
    """Всегда пересобирает свежий zip (источники на диске могли обновиться)."""
    info = build_run_package(run_id=run_id, recalc_gate=recalc_gate)
    raw = info.get("path")
    if raw is None:
        return None, info
    return Path(raw), info
