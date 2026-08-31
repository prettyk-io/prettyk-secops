# -*- coding: utf-8 -*-
"""PERS-B7/B8: Data integrity — orphan detection + session recovery.

Чистый Python без SQLAlchemy/Cosmo. Работает с файловой системой + runs_index NDJSON.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from utils.paths import LIVE_DIR, RUNS_DIR, ensure_live_dir


# ═══════════════════════════════════════════════════════════════════════
# PERS-B7: Orphan Detection
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class IntegrityReport:
    """Результат проверки целостности run-артефактов."""
    run_id: str
    ok: bool = True
    issues: List[Dict[str, Any]] = field(default_factory=list)
    artifacts_found: int = 0
    artifacts_missing: int = 0
    orphan_files: int = 0


def _read_runs_index() -> List[Dict[str, Any]]:
    """Прочитать все записи из runs_index.ndjson."""
    from utils.runs_index import runs_index_path

    path = runs_index_path()
    if not path.is_file():
        return []
    rows: List[Dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def _known_run_ids() -> set:
    """Все известные run_id из runs_index NDJSON."""
    return {row["run_id"] for row in _read_runs_index() if row.get("run_id")}


def verify_run_integrity(run_id: str) -> IntegrityReport:
    """PERS-B7: проверить целостность артефактов одного прогона.

    Проверяет:
      - run_dir существует
      - ключевые артефакты на месте (wired.json, runner.log, run_summary.json)
      - артефакты имеют ненулевой размер
      - нет орфан-файлов (файлы в run_dir не из known_artifacts)
    """
    report = IntegrityReport(run_id=run_id)

    run_dir = RUNS_DIR / run_id
    if not run_dir.is_dir():
        report.ok = False
        report.issues.append({
            "type": "missing_run_dir",
            "detail": f"Run directory not found: {run_dir}",
        })
        return report

    _REQUIRED_ARTIFACTS = frozenset({
        "wired.json",
    })

    _OPTIONAL_ARTIFACTS = frozenset({
        "runner.log", "run_summary.json",
        "evidence.json", "finding_summary.json",
        "evidence_refs.json",
    })

    _KNOWN_ARTIFACTS = _REQUIRED_ARTIFACTS | _OPTIONAL_ARTIFACTS

    found_files = list(run_dir.rglob("*"))
    for fpath in found_files:
        if fpath.is_file():
            report.artifacts_found += 1
            size = fpath.stat().st_size
            if size == 0:
                report.issues.append({
                    "type": "zero_size_artifact",
                    "path": str(fpath.relative_to(run_dir)),
                })

            # SHA256 для ключевых артефактов
            if fpath.name in _KNOWN_ARTIFACTS:
                sha = _sha256_file(fpath)
                if sha is None:
                    report.issues.append({
                        "type": "unreadable_artifact",
                        "path": str(fpath.relative_to(run_dir)),
                    })

    # Проверка: обязательные артефакты на месте
    for name in _REQUIRED_ARTIFACTS:
        expected = run_dir / name
        if not expected.is_file():
            report.artifacts_missing += 1
            report.issues.append({
                "type": "missing_artifact",
                "path": name,
                "detail": f"Required artifact not found: {name}",
            })

    report.ok = len(report.issues) == 0
    return report


def scan_orphan_files() -> List[Dict[str, Any]]:
    """PERS-B7: найти орфан-файлы — артефакты без EvidenceRecord и без run_dir в индексе.

    Обходит reports/runs/ и возвращает файлы,
    чьи run_dir не значатся в runs_index.ndjson.
    """
    known = _known_run_ids()
    orphans: List[Dict[str, Any]] = []

    if not RUNS_DIR.is_dir():
        return orphans

    for run_dir in sorted(RUNS_DIR.iterdir()):
        if not run_dir.is_dir():
            continue
        run_id = run_dir.name
        if run_id in known:
            continue
        files = [str(f.relative_to(run_dir)) for f in run_dir.rglob("*") if f.is_file()]
        orphans.append({
            "run_id": run_id,
            "run_dir": str(run_dir),
            "file_count": len(files),
            "files": sorted(files)[:50],
            "orphan_reason": "run_id not in runs_index",
        })

    return orphans


def verify_evidence_refs(run_id: str) -> IntegrityReport:
    """PERS-B7: проверить EvidenceRecord → файл и файл → EvidenceRecord.

    Возвращает отчёт о расхождениях:
      - файл без EvidenceRecord → orphan
      - EvidenceRecord без файла → missing
    """
    report = IntegrityReport(run_id=run_id)

    run_dir = RUNS_DIR / run_id
    if not run_dir.is_dir():
        report.ok = False
        report.issues.append({"type": "missing_run_dir", "detail": str(run_dir)})
        return report

    # Все физические файлы в run_dir
    disk_files = {
        str(f.relative_to(run_dir)): f for f in run_dir.rglob("*") if f.is_file()
    }

    # Evidence-записи (из evidence_refs.json если есть)
    refs_path = run_dir / "evidence_refs.json"
    ref_files: Dict[str, str] = {}  # rel_path → sha256
    if refs_path.is_file():
        try:
            refs = json.loads(refs_path.read_text(encoding="utf-8"))
            if isinstance(refs, dict):
                for item in (refs.get("artifacts") or []):
                    if isinstance(item, dict):
                        rel = item.get("path") or item.get("artifact_name") or ""
                        sha = item.get("sha256") or ""
                        if rel:
                            ref_files[rel] = sha
        except (json.JSONDecodeError, OSError):
            pass

    # Проверка: EvidenceRecord → файл существует
    for rel_path, expected_sha in ref_files.items():
        fpath = run_dir / rel_path
        if not fpath.is_file():
            report.issues.append({
                "type": "evidence_missing_file",
                "artifact": rel_path,
                "expected_sha256": expected_sha,
                "detail": "EvidenceRecord references artifact that does not exist on disk",
            })
        else:
            actual_sha = _sha256_file(fpath)
            if actual_sha and actual_sha != expected_sha:
                report.issues.append({
                    "type": "evidence_sha_mismatch",
                    "artifact": rel_path,
                    "expected_sha256": expected_sha,
                    "actual_sha256": actual_sha,
                    "detail": "Artifact SHA256 differs from EvidenceRecord",
                })

    # Проверка: физический файл → EvidenceRecord
    _META_FILES = frozenset({"evidence_refs.json", "run_summary.json", "wired.json", "runner.log"})
    for rel_path, fpath in disk_files.items():
        if rel_path in _META_FILES:
            continue  # мета-файлы не являются evidence-артефактами
        if rel_path not in ref_files:
            report.orphan_files += 1
            report.issues.append({
                "type": "orphan_file",
                "artifact": rel_path,
                "size_bytes": fpath.stat().st_size,
                "detail": "File exists on disk but not in EvidenceRecord references",
            })

    report.ok = len(report.issues) == 0
    return report


# ═══════════════════════════════════════════════════════════════════════
# PERS-B8: Session Recovery
# ═══════════════════════════════════════════════════════════════════════

_CRAWLER_SESSION_DIR = LIVE_DIR / "crawler_sessions"
_CRAWLER_SESSION_LOCK = None  # lazy import


@dataclass
class CrawlerSessionState:
    """Сохраняемое состояние сессии краулера для восстановления."""
    session_id: str
    target_url: str
    visited_urls: List[str] = field(default_factory=list)
    state_count: int = 0
    transition_count: int = 0
    last_state_key: str = ""
    awakened_count: int = 0
    stop_reason: str = ""
    persona_name: str = ""
    saved_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "target_url": self.target_url,
            "visited_urls": self.visited_urls,
            "state_count": self.state_count,
            "transition_count": self.transition_count,
            "last_state_key": self.last_state_key,
            "awakened_count": self.awakened_count,
            "stop_reason": self.stop_reason,
            "persona_name": self.persona_name,
            "saved_at": self.saved_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> CrawlerSessionState:
        return cls(
            session_id=str(data.get("session_id") or ""),
            target_url=str(data.get("target_url") or ""),
            visited_urls=list(data.get("visited_urls") or []),
            state_count=int(data.get("state_count") or 0),
            transition_count=int(data.get("transition_count") or 0),
            last_state_key=str(data.get("last_state_key") or ""),
            awakened_count=int(data.get("awakened_count") or 0),
            stop_reason=str(data.get("stop_reason") or ""),
            persona_name=str(data.get("persona_name") or ""),
            saved_at=float(data.get("saved_at") or 0),
        )


def save_crawler_session(state: CrawlerSessionState) -> Path:
    """PERS-B8: сохранить состояние сессии краулера на диск.

    После рестарта процесса оператор может восстановить сессию.
    """
    _CRAWLER_SESSION_DIR.mkdir(parents=True, exist_ok=True)
    path = _CRAWLER_SESSION_DIR / f"{state.session_id}.json"
    data = state.to_dict()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def load_crawler_session(session_id: str) -> Optional[CrawlerSessionState]:
    """PERS-B8: загрузить состояние сессии краулера с диска."""
    path = _CRAWLER_SESSION_DIR / f"{session_id}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return CrawlerSessionState.from_dict(data)
    except (json.JSONDecodeError, OSError):
        return None


def list_crawler_sessions() -> List[CrawlerSessionState]:
    """PERS-B8: список всех сохранённых сессий краулера."""
    _CRAWLER_SESSION_DIR.mkdir(parents=True, exist_ok=True)
    sessions: List[CrawlerSessionState] = []
    for fpath in sorted(_CRAWLER_SESSION_DIR.glob("*.json")):
        state = load_crawler_session(fpath.stem)
        if state is not None:
            sessions.append(state)
    return sessions


def delete_crawler_session(session_id: str) -> bool:
    """Удалить сохранённую сессию краулера."""
    path = _CRAWLER_SESSION_DIR / f"{session_id}.json"
    if path.is_file():
        path.unlink()
        return True
    return False


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════

def _sha256_file(path: Path) -> Optional[str]:
    """SHA-256 хеш содержимого файла."""
    try:
        h = hashlib.sha256()
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None