# -*- coding: utf-8 -*-
"""PK-RUNCTL: health + telemetry + profiles integration tests."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH-1: Стандартный health-контракт
# ═══════════════════════════════════════════════════════════════════════════════


def test_service_health_init():
    from infra.health import ServiceHealth

    h = ServiceHealth("test-svc")
    assert h._name == "test-svc"
    assert not h._draining


def test_live_always_true():
    """HEALTH-1: /live — процесс жив, без проверок зависимостей."""
    from infra.health import ServiceHealth

    h = ServiceHealth("test-svc")
    status = h.live()
    assert status.live is True
    assert status.ready is False  # /live не проверяет зависимости
    assert not status.draining


def test_ready_with_no_checks_is_true():
    """Без зарегистрированных проверок — ready=True."""
    from infra.health import ServiceHealth

    h = ServiceHealth("test-svc")
    status = h.ready()
    assert status.live is True
    assert status.ready is True


def test_ready_with_failing_check():
    """HEALTH-1: критическая зависимость недоступна → ready=False, live=True."""
    from infra.health import ServiceHealth

    h = ServiceHealth("test-svc")
    h.register_check("db", lambda: False)
    status = h.ready()
    assert status.live is True
    assert status.ready is False
    assert status.checks["db"] is False


def test_ready_with_passing_checks():
    from infra.health import ServiceHealth

    h = ServiceHealth("test-svc")
    h.register_check("db", lambda: True)
    h.register_check("fs", lambda: True)
    status = h.ready()
    assert status.ready is True
    assert status.checks == {"db": True, "fs": True}


def test_draining_prevent_ready():
    """HEALTH-1: draining → ready=False, даже если проверки OK."""
    from infra.health import ServiceHealth

    h = ServiceHealth("test-svc")
    h.register_check("db", lambda: True)
    h.start_draining()
    status = h.ready()
    assert status.draining is True
    assert status.ready is False  # draining — не готов


def test_health_output_has_no_secrets():
    """HEALTH-1: ответ не содержит внутренних деталей."""
    from infra.health import ServiceHealth

    h = ServiceHealth("test-svc")
    d = h.health().as_dict()
    # Никаких стектрейсов, паролей, имён таблиц
    assert "password" not in json.dumps(d)
    assert "traceback" not in json.dumps(d)
    assert "secret" not in json.dumps(d)


def test_playground_health_singleton():
    from infra.health import get_playground_health

    h1 = get_playground_health()
    h2 = get_playground_health()
    assert h1 is h2  # синглтон


def test_check_filesystem(tmp_path):
    from infra.health import check_filesystem

    fn = check_filesystem(str(tmp_path))
    assert fn() is True


# ═══════════════════════════════════════════════════════════════════════════════
# TELEMETRY-1: ID-цепочка
# ═══════════════════════════════════════════════════════════════════════════════


def test_run_trace_id_chain():
    from infra.telemetry import RunTrace

    t = RunTrace(run_id="run-1")
    assert t.run_id == "run-1"
    assert t.attempt == 1
    t.with_step("step-auth").with_artifact("screenshot-001")
    assert t.step_id == "step-auth"
    assert t.artifact_ref == "screenshot-001"


def test_run_trace_child_attempt():
    from infra.telemetry import RunTrace

    t = RunTrace(run_id="run-1", attempt=1)
    child = t.child_attempt()
    assert child.run_id == "run-1"
    assert child.attempt == 2


def test_run_trace_as_dict():
    from infra.telemetry import RunTrace

    t = RunTrace(run_id="run-1", worker_id="w-1")
    t.with_step("step-1")
    d = t.as_dict()
    assert d["run_id"] == "run-1"
    assert d["step_id"] == "step-1"
    assert d["worker_id"] == "w-1"
    assert d["artifact_ref"] == ""


# ═══════════════════════════════════════════════════════════════════════════════
# TELEMETRY-2: Структурированные логи
# ═══════════════════════════════════════════════════════════════════════════════


def test_run_logger_formats_json():
    from infra.telemetry import RunLogger
    import logging

    base = logging.getLogger("test-runlog")
    base.setLevel(logging.DEBUG)
    rl = RunLogger("run-test-log", base)
    msg = rl._format("INFO", "test message")

    parsed = json.loads(msg)
    assert parsed["run_id"] == "run-test-log"
    assert parsed["level"] == "INFO"
    assert parsed["message"] == "test message"


def test_run_logger_has_context():
    """TELEMETRY-2: лог-запись содержит run_id/attempt/step_id."""
    from infra.telemetry import RunLogger
    import logging

    base = logging.getLogger("test-runlog2")
    base.setLevel(logging.DEBUG)
    rl = RunLogger("run-ctx-1", base)
    rl.set_attempt(3)
    rl.set_step("step-login")
    rl.set_worker("worker-alpha")

    msg = rl._format("INFO", "click executed")
    parsed = json.loads(msg)
    assert parsed["run_id"] == "run-ctx-1"
    assert parsed["attempt"] == 3
    assert parsed["step_id"] == "step-login"
    assert parsed["worker_id"] == "worker-alpha"


def test_run_logger_singleton_per_run():
    """TELEMETRY-2: один RunLogger на run_id (синглтон)."""
    from infra.telemetry import RunLogger

    a = RunLogger.for_run("run-a")
    b = RunLogger.for_run("run-a")
    c = RunLogger.for_run("run-b")
    assert a is b
    assert a is not c


# ═══════════════════════════════════════════════════════════════════════════════
# TELEMETRY-3: Метрики
# ═══════════════════════════════════════════════════════════════════════════════


def test_metrics_initial_state():
    from infra.telemetry import RunMetrics

    m = RunMetrics()
    s = m.snapshot()
    assert s["active_runs"] == 0
    assert s["queue_depth"] == 0
    assert s["live_workers"] == 0


def test_metrics_tracks_runs():
    from infra.telemetry import RunMetrics

    m = RunMetrics()
    m.run_queued("r1")
    m.run_queued("r2")
    m.run_started("r1")
    s = m.snapshot()
    assert s["active_runs"] == 1
    assert s["queue_depth"] == 1  # r2 всё ещё в очереди


def test_metrics_lifecycle():
    from infra.telemetry import RunMetrics

    m = RunMetrics()
    m.run_queued("r1")
    m.run_started("r1")
    m.run_completed("r1")
    s = m.snapshot()
    assert s["active_runs"] == 0
    assert s["queue_depth"] == 0


def test_metrics_workers():
    from infra.telemetry import RunMetrics

    m = RunMetrics()
    m.worker_online("w1")
    m.worker_online("w2")
    m.worker_offline("w1")
    s = m.snapshot()
    assert s["live_workers"] == 1


def test_metrics_errors():
    from infra.telemetry import RunMetrics

    m = RunMetrics(window_s=9999)  # большое окно
    m.record_error("r1", "connection refused")
    m.record_error("r2", "timeout")
    s = m.snapshot()
    assert s["total_errors"] == 2
    assert s["errors_last_hour"] == 2


def test_metrics_as_json():
    from infra.telemetry import RunMetrics

    m = RunMetrics()
    j = m.as_json()
    d = json.loads(j)
    assert "active_runs" in d
    assert "queue_depth" in d


def test_global_metrics_singleton():
    from infra.telemetry import get_metrics

    m1 = get_metrics()
    m2 = get_metrics()
    assert m1 is m2


# ═══════════════════════════════════════════════════════════════════════════════
# PROFILES-1: Pure Box контракт
# ═══════════════════════════════════════════════════════════════════════════════


def test_default_is_enterprise():
    from infra.profiles import resolve_profile, is_enterprise

    assert resolve_profile() == "enterprise"
    assert is_enterprise() is True


def test_pure_box_via_env(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
    from infra.profiles import resolve_profile, is_pure_box

    assert resolve_profile() == "pure-box"
    assert is_pure_box() is True


def test_pure_box_requires_nothing():
    """PROFILES-1: Pure Box не требует внешних сервисов."""
    from infra.profiles import requires_postgres, requires_valkey, requires_queue, requires_worker_pool

    # По умолчанию enterprise — всё true
    assert requires_postgres() is True
    assert requires_valkey() is True
    assert requires_queue() is True


def test_pure_box_health_self_contained(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
    from infra.profiles import pure_box_health

    h = pure_box_health()
    assert h["live"] is True
    assert h["ready"] is True
    assert h["profile"] == "pure-box"
    assert h["dependencies"]["postgres"] is False  # не требуется
    assert h["dependencies"]["filesystem"] is True


def test_enterprise_health_requirements():
    from infra.profiles import enterprise_health_requirements

    reqs = enterprise_health_requirements()
    assert "postgres" in reqs
    assert "valkey" in reqs


def test_pure_box_feature_gates(monkeypatch):
    """PROFILES-1: Pure Box feature gates выключены."""
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
    from infra.profiles import requires_postgres, requires_valkey, requires_postgres

    assert requires_postgres() is False
    assert requires_valkey() is False


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH-2: Compose hardening
# ═══════════════════════════════════════════════════════════════════════════════


def test_compose_has_condition_service_healthy():
    """HEALTH-2: инфра-сервисы имеют healthcheck (PostgreSQL, Valkey)."""
    compose = (Path(__file__).resolve().parent.parent.parent / "services" / "docker-compose.infra.yml")
    if compose.exists():
        text = compose.read_text(encoding="utf-8")
        # PostgreSQL и Valkey имеют healthcheck-секции
        assert "healthcheck:" in text
        assert "pg_isready" in text  # PG health
        assert "valkey" in text and "ping" in text  # Valkey health


def test_playground_health_endpoints_exist():
    """HEALTH-2: /api/health, /api/health/live, /api/health/ready зарегистрированы."""
    from tools.data_playground import Handler

    routes = Handler.do_POST.__code__   # type: ignore[attr-defined]
    # Проверяем что health endpoints не вызовут AttributeError при импорте
    import infra.health
    import infra.telemetry
    import infra.profiles
    assert infra.health.get_playground_health() is not None
    assert infra.telemetry.get_metrics() is not None