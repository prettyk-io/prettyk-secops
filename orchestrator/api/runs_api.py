# -*- coding: utf-8 -*-
"""PERS-B1: REST API для журнала запусков.

GET  /api/runs           — список с пагинацией и фильтрами
GET  /api/runs/{run_id}  — карточка одного прогона

Встраивается в live_server (do_GET dispatching).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from models.db import create_all, get_session
from models.run_record import RunRecord


def _utcnow() -> datetime:
    """SQLite-safe UTC now (naive datetime — SQLite теряет tzinfo)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _ensure_tables():
    """Ленивое создание таблиц (если Alembic ещё не запущен)."""
    try:
        create_all()
    except Exception:
        pass


def handle_list_runs(
    *,
    limit: int = 50,
    offset: int = 0,
    status: str = "",
    check_id: str = "",
    sort: str = "-created_at",
) -> dict:
    """GET /api/runs — список с пагинацией."""
    _ensure_tables()
    session = get_session()
    try:
        q = session.query(RunRecord)

        if status:
            q = q.filter(RunRecord.status == status)
        if check_id:
            q = q.filter(RunRecord.check_id == check_id)

        # Сортировка
        if sort.startswith("-"):
            col = sort[1:]
            from sqlalchemy import desc
            if hasattr(RunRecord, col):
                q = q.order_by(desc(getattr(RunRecord, col)))
            else:
                q = q.order_by(desc(RunRecord.created_at))
        else:
            q = q.order_by(RunRecord.created_at)

        total = q.count()
        rows = q.offset(offset).limit(limit).all()

        return {
            "ok": True,
            "items": [r.to_dict() for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    finally:
        session.close()


def handle_get_run(run_id: str) -> dict:
    """GET /api/runs/{run_id} — карточка одного прогона."""
    _ensure_tables()
    session = get_session()
    try:
        run = session.query(RunRecord).filter(RunRecord.id == run_id).first()
        if run is None:
            return {"ok": False, "error": "not_found", "run_id": run_id}
        return {"ok": True, "run": run.to_dict()}
    finally:
        session.close()


def write_run_start(
    run_id: str,
    *,
    check_id: str | None = None,
    session_name: str | None = None,
    target_url: str | None = None,
    profile: str | None = None,
    wired_path: str | None = None,
    log_path: str | None = None,
    owner_user_id: str | None = None,
) -> None:
    """Создать или обновить запись при старте прогона."""
    _ensure_tables()
    s = get_session()
    try:
        existing = s.query(RunRecord).filter(RunRecord.id == run_id).first()
        if existing is not None:
            existing.status = "running"
            existing.started_at = _utcnow()
            if check_id:
                existing.check_id = check_id
            if session_name:
                existing.session_name = session_name
            if target_url:
                existing.target_url = target_url
            if profile:
                existing.profile = profile
            if wired_path:
                existing.wired_path = wired_path
            if log_path:
                existing.log_path = log_path
            if owner_user_id:
                existing.owner_user_id = owner_user_id
        else:
            rec = RunRecord(
                id=run_id,
                check_id=check_id,
                session_name=session_name,
                status="running",
                target_url=target_url,
                profile=profile,
                wired_path=wired_path,
                log_path=log_path,
                owner_user_id=owner_user_id,
                started_at=_utcnow(),
            )
            s.add(rec)
        s.commit()
    except Exception:
        s.rollback()
    finally:
        s.close()


def write_run_finish(
    run_id: str,
    *,
    exit_code: int = 0,
    findings_count: int | None = None,
    duration_seconds: float | None = None,
    verdict: str | None = None,
    error_message: str | None = None,
) -> None:
    """Обновить запись при завершении прогона."""
    _ensure_tables()
    s = get_session()
    try:
        run = s.query(RunRecord).filter(RunRecord.id == run_id).first()
        if run is None:
            return
        run.status = "succeeded" if exit_code == 0 else "failed"
        run.exit_code = exit_code
        run.finished_at = _utcnow()
        if run.started_at:
            run.duration_seconds = (run.finished_at - run.started_at).total_seconds()
        if findings_count is not None:
            run.findings_count = findings_count
        if verdict is not None:
            run.verdict = verdict
        if duration_seconds is not None:
            run.duration_seconds = duration_seconds
        if error_message is not None:
            run.error_message = error_message
        s.commit()
    except Exception:
        s.rollback()
    finally:
        s.close()

def handle_get_run_events(run_id: str) -> dict:
    """GET /api/runs/:id/events — лента событий прогона."""
    from models.evidence_record import EvidenceRecord
    _ensure_tables()
    s = get_session()
    try:
        run = s.query(RunRecord).filter(RunRecord.id == run_id).first()
        if run is None:
            return {"ok": False, "error": "not_found", "run_id": run_id}

        events = []
        if run.created_at:
            ts = run.created_at.isoformat() if hasattr(run.created_at, 'isoformat') else str(run.created_at)
            events.append({"ts": ts, "kind": "CREATED", "text": f"Run {run_id} created"})
        if run.started_at:
            ts = run.started_at.isoformat() if hasattr(run.started_at, 'isoformat') else str(run.started_at)
            target = f" — {run.target_url}" if run.target_url else ""
            events.append({"ts": ts, "kind": "STARTED", "text": f"Run {run_id} started{target}"})
        if run.finished_at:
            ts = run.finished_at.isoformat() if hasattr(run.finished_at, 'isoformat') else str(run.finished_at)
            kind = "SUCCEEDED" if run.status == "succeeded" else "FAILED"
            text = f"Run {run_id} finished"
            if run.findings_count is not None:
                text += f" — {run.findings_count} findings"
            if run.duration_seconds is not None:
                text += f" ({run.duration_seconds:.0f}s)"
            events.append({
                "ts": ts, "kind": kind, "text": text,
                "exit_code": run.exit_code, "verdict": run.verdict,
                "findings_count": run.findings_count,
            })
        evidence = (
            s.query(EvidenceRecord)
            .filter(EvidenceRecord.run_id == run_id)
            .order_by(EvidenceRecord.uploaded_at)
            .all()
        )
        for ev in evidence:
            ts = ev.uploaded_at.isoformat() if hasattr(ev.uploaded_at, 'isoformat') else str(ev.uploaded_at)
            events.append({
                "ts": ts, "kind": "EVIDENCE",
                "text": f"Artifact: {ev.artifact_name} ({ev.artifact_type})",
                "artifact_type": ev.artifact_type, "sha256": ev.sha256,
                "storage_backend": ev.storage_backend,
            })
        events.sort(key=lambda e: e["ts"])
        return {"ok": True, "run_id": run_id, "status": run.status,
                "events": events, "total": len(events)}
    finally:
        s.close()


def handle_get_trend(*, days: int = 30) -> dict:
    """GET /api/summary/trend — тренд severity + pass_rate."""
    from datetime import timedelta
    _ensure_tables()
    s = get_session()
    try:
        cutoff = _utcnow() - timedelta(days=days)
        runs = (
            s.query(RunRecord)
            .filter(RunRecord.finished_at >= cutoff, RunRecord.finished_at.isnot(None))
            .order_by(RunRecord.finished_at)
            .all()
        )
        total = len(runs)
        passed = sum(1 for r in runs if r.status == "succeeded")
        failed = sum(1 for r in runs if r.status == "failed")
        with_findings = sum(1 for r in runs if (r.findings_count or 0) > 0)
        return {
            "ok": True, "days": days,
            "total_runs": total,
            "pass_rate": round(passed / total, 3) if total > 0 else 0,
            "passed": passed, "failed": failed,
            "with_findings": with_findings,
            "clean": total - with_findings,
            "by_day": [
                {
                    "date": ((r.finished_at or r.created_at).isoformat()[:10]
                             if (r.finished_at or r.created_at) else ""),
                    "status": r.status, "findings": r.findings_count or 0,
                }
                for r in runs
            ],
        }
    finally:
        s.close()
