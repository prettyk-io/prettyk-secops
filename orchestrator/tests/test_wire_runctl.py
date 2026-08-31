# -*- coding: utf-8 -*-
"""WIRE-RUNCTL: тесты подключения RunControlPlane к lab_run (submit_run).

Без реального subprocess: start_run мокается. Проверяем:
  - dedup: повторный идентичный submit → тот же run_id, start_run вызван один раз;
  - lifecycle: submit → running, _finish_plane_run → succeeded/failed;
  - валидационный провал → fail(VALIDATION), subprocess не спавнится.
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

import utils.lab_run as lab_run
from core.run_control_plane import FailureClass, RunState


@pytest.fixture(autouse=True)
def _clean_plane():
    lab_run.reset_run_plane_for_tests()
    yield
    lab_run.reset_run_plane_for_tests()


@pytest.fixture
def fake_start_run(monkeypatch):
    """Мок start_run: не спавнит subprocess, возвращает ok + run_id из kwargs."""
    calls: list[dict] = []

    def _fake(wired, **kwargs):
        calls.append(kwargs)
        return {"ok": True, "run_id": kwargs.get("run_id"), "phase": "running"}

    monkeypatch.setattr(lab_run, "start_run", _fake)
    return calls


class TestSubmitRunDedup:
    def test_duplicate_submit_returns_same_run_id(self, fake_start_run):
        wired = {"scenario": "auth"}
        r1 = lab_run.submit_run(wired)
        r2 = lab_run.submit_run(wired)

        assert r1["ok"] is True
        assert r1["run_id"] == r2["run_id"]
        assert r2["dedup"] is True
        assert r2["reused"] is True
        # start_run вызван ровно один раз
        assert len(fake_start_run) == 1

    def test_dedup_key_order_independent(self, fake_start_run):
        a = {"wired": {"x": 1}, "session_name": "s", "stub": False, "check_id": "c"}
        b = {"wired": {"x": 1}, "check_id": "c", "session_name": "s", "stub": False}
        r1 = lab_run.submit_run(a["wired"], session_name="s", check_id="c")
        r2 = lab_run.submit_run(b["wired"], session_name="s", check_id="c")
        assert r1["run_id"] == r2["run_id"]

    def test_different_params_new_run(self, fake_start_run):
        r1 = lab_run.submit_run({"scenario": "a"})
        lab_run._finish_plane_run(r1["run_id"], 0)  # завершить первый
        r2 = lab_run.submit_run({"scenario": "b"})
        assert r1["run_id"] != r2["run_id"]

    def test_completed_run_allows_new_same_params(self, fake_start_run):
        wired = {"scenario": "a"}
        r1 = lab_run.submit_run(wired)
        lab_run._finish_plane_run(r1["run_id"], 0)  # terminal → dedup освобождён
        r2 = lab_run.submit_run(wired)
        assert r1["run_id"] != r2["run_id"]
        assert r2.get("dedup") is not True


class TestSubmitRunLifecycle:
    def test_submit_goes_running(self, fake_start_run):
        r = lab_run.submit_run({"scenario": "a"})
        assert r["control_plane"]["state"] == RunState.RUNNING.value

    def test_finish_success(self, fake_start_run):
        r = lab_run.submit_run({"scenario": "a"})
        lab_run._finish_plane_run(r["run_id"], 0)
        status = lab_run.get_run_control_plane_status(r["run_id"])
        assert status["state"] == RunState.SUCCEEDED.value

    def test_finish_failure(self, fake_start_run):
        r = lab_run.submit_run({"scenario": "a"})
        lab_run._finish_plane_run(r["run_id"], 1)
        status = lab_run.get_run_control_plane_status(r["run_id"])
        assert status["state"] == RunState.FAILED.value
        assert status["failure_class"] == FailureClass.INFRA.value

    def test_validation_failure_no_spawn(self, monkeypatch):
        """Валидация упала → fail(VALIDATION), start_run НЕ вызван."""
        def _boom(wired, **kwargs):
            raise ValueError("wired must be a JSON object")

        monkeypatch.setattr(lab_run, "start_run", _boom)
        with pytest.raises(ValueError):
            lab_run.submit_run({"scenario": "a"})

        # run зафиксирован как failed с VALIDATION
        plane = lab_run._get_run_plane()
        runs = plane.list_runs()
        assert len(runs) == 1
        assert runs[0].state == RunState.FAILED
        assert runs[0].failure_class == FailureClass.VALIDATION


class TestGetStatus:
    def test_unknown_run(self):
        assert lab_run.get_run_control_plane_status("ghost")["ok"] is False

    def test_status_shape(self, fake_start_run):
        r = lab_run.submit_run({"scenario": "a"})
        s = lab_run.get_run_control_plane_status(r["run_id"])
        assert s["ok"] is True
        assert s["run_id"] == r["run_id"]
        assert s["state"] == RunState.RUNNING.value
        assert s["attempt"] == 1
        assert s["worker_id"] == "lab-single-flight"


class TestPlaneTrackingRunLifecycle:
    """WIRE-RUNCTL: start_tracking_run + finish_plane_run — полный цикл."""

    def test_start_tracking_queued_to_running(self):
        plane = lab_run._get_run_plane()
        run, _ = plane.create_run({"scenario": "track"})
        assert run.state == RunState.RUNNING  # _dispatch сразу перевёл
        s = lab_run.get_run_control_plane_status(run.id)
        assert s["state"] == RunState.RUNNING.value

    def test_start_tracking_transition(self):
        """start_tracking_run явно переводит QUEUED→RUNNING."""
        from core.run_control_plane import RunControlPlane

        # Создаём плоскость без workers — dispatch не сработает
        plane = RunControlPlane(max_concurrent=0)
        run, is_new = plane.create_run({"s": "t"})
        assert run.state == RunState.QUEUED  # нет worker'ов

        plane.start_tracking_run(run.id)
        run2 = plane.get_run(run.id)
        assert run2 is not None
        assert run2.state == RunState.RUNNING
        assert run2.started_at is not None

    def test_start_tracking_idempotent_on_running(self):
        """start_tracking_run на уже RUNNING — не ломается."""
        from core.run_control_plane import RunControlPlane

        plane = RunControlPlane(max_concurrent=0)
        run, _ = plane.create_run({"s": "t"})
        plane.start_tracking_run(run.id)
        # Второй вызов — не должен упасть
        plane.start_tracking_run(run.id)
        assert plane.get_run(run.id).state == RunState.RUNNING

    def test_start_tracking_noop_on_terminal(self):
        from core.run_control_plane import RunControlPlane

        plane = RunControlPlane(max_concurrent=0)
        run, _ = plane.create_run({"s": "t"})
        plane.start_tracking_run(run.id)
        plane.succeed_run(run.id)
        # На терминальном — noop
        plane.start_tracking_run(run.id)
        assert plane.get_run(run.id).state == RunState.SUCCEEDED

    def test_full_lifecycle_submit_finish(self, fake_start_run):
        """submit → RUNNING → _finish_plane_run(0) → SUCCEEDED."""
        r = lab_run.submit_run({"scenario": "lifecycle"})
        run_id = r["run_id"]

        # Должен быть RUNNING
        s1 = lab_run.get_run_control_plane_status(run_id)
        assert s1["state"] == RunState.RUNNING.value

        # Завершаем успешно
        lab_run._finish_plane_run(run_id, 0)
        s2 = lab_run.get_run_control_plane_status(run_id)
        assert s2["state"] == RunState.SUCCEEDED.value

    def test_full_lifecycle_submit_fail(self, fake_start_run):
        """submit → RUNNING → _finish_plane_run(1) → FAILED."""
        r = lab_run.submit_run({"scenario": "failed-lifecycle"})
        run_id = r["run_id"]
        lab_run._finish_plane_run(run_id, 1)
        s = lab_run.get_run_control_plane_status(run_id)
        assert s["state"] == RunState.FAILED.value
        assert s["failure_class"] == FailureClass.INFRA.value

    def test_already_terminal_finish_noop(self, fake_start_run):
        """Повторный finish на terminal — noop."""
        r = lab_run.submit_run({"scenario": "terminal"})
        run_id = r["run_id"]
        lab_run._finish_plane_run(run_id, 0)
        # Повторный вызов не должен падать
        lab_run._finish_plane_run(run_id, 0)
        s = lab_run.get_run_control_plane_status(run_id)
        assert s["state"] == RunState.SUCCEEDED.value
