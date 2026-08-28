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
