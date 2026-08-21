# -*- coding: utf-8 -*-
"""Интеграция Results-потока на болванке lab_run_stub (без Juice)."""
from __future__ import annotations

import time

import pytest

from utils import diary_bus, lab_run
from utils.lab_run_stub import LabStubScenario, run_lab_stub
from utils.live_server import apply_ci_status, stop_live_server
from utils.pipeline_verdict import derive_pipeline_verdict


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    stop_live_server()
    live_dir = tmp_path / "live"
    live_dir.mkdir()
    runs = tmp_path / "runs"
    runs.mkdir()
    monkeypatch.setattr("utils.paths.LIVE_DIR", live_dir)
    monkeypatch.setattr("utils.paths.DIARY_NDJSON", live_dir / "diary.ndjson")
    monkeypatch.setattr("utils.paths.LIVE_META_JSON", live_dir / "meta.json")
    monkeypatch.setattr("utils.paths.RESULTS_HOOKS_JSON", live_dir / "results_hooks.json")
    monkeypatch.setattr("utils.paths.LIVE_EXPORTS_DIR", live_dir / "exports")
    monkeypatch.setattr("utils.diary_bus.LIVE_DIR", live_dir)
    monkeypatch.setattr("utils.diary_bus.DIARY_NDJSON", live_dir / "diary.ndjson")
    monkeypatch.setattr("utils.diary_bus.LIVE_META_JSON", live_dir / "meta.json")
    monkeypatch.setattr(
        "utils.diary_bus.RESULTS_HOOKS_JSON", live_dir / "results_hooks.json"
    )
    monkeypatch.setattr("utils.diary_bus.LIVE_EXPORTS_DIR", live_dir / "exports")
    monkeypatch.setattr("utils.paths.RUNS_DIR", runs)
    monkeypatch.setattr("utils.lab_run.RUNS_DIR", runs)
    monkeypatch.setattr("utils.lab_run.ensure_runs_dir", lambda: runs)
    monkeypatch.setenv("KDT_LIVE", "1")
    monkeypatch.setenv("KDT_LIVE_PORT", "18769")
    diary_bus.clear()
    diary_bus.clear_results_hooks()
    lab_run.reset_run_state_for_tests()
    yield
    lab_run.reset_run_state_for_tests()
    stop_live_server()
    diary_bus.clear()


def test_stub_pass_replaces_urls_and_sets_verdict():
    diary_bus.set_results_hook("allure", "http://127.0.0.1:5050/?stale=1")
    diary_bus.set_results_hook("dojo", "http://127.0.0.1:8081/engagement/999")

    code = run_lab_stub(
        LabStubScenario(
            sleep_s=0.0,
            exit_code=0,
            gate="pass",
            allure_url="http://127.0.0.1:5050/",
            dojo_url="http://127.0.0.1:8081/engagement/1",
            job_name="stub-pass",
        )
    )
    assert code == 0

    hooks = diary_bus.get_results_hooks()
    assert hooks["allure"]["report_url"] == "http://127.0.0.1:5050/"
    assert hooks["dojo"]["report_url"] == "http://127.0.0.1:8081/engagement/1"
    assert "stale=" not in hooks["allure"]["report_url"]
    assert "/999" not in hooks["dojo"]["report_url"]

    meta = diary_bus.get_meta()
    assert meta.get("ci_phase") == "completed"
    assert meta.get("ci_exit_code") == 0
    verdict = derive_pipeline_verdict(
        phase=str(meta.get("ci_phase") or ""),
        conclusion=str(meta.get("ci_conclusion") or ""),
        exit_code=meta.get("ci_exit_code"),
        gate=str(meta.get("ci_gate") or ""),
    )
    assert verdict == "pass"


def test_stub_clear_then_running_then_hooks():
    """Эмуляция кнопки: clear → running (без URL) → hooks ready."""
    diary_bus.set_results_hook("allure", "http://127.0.0.1:5050/?old=1")
    diary_bus.clear_results_hooks()
    assert diary_bus.get_results_hooks()["allure"] is None
    assert diary_bus.get_results_hooks()["dojo"] is None

    apply_ci_status(
        {
            "phase": "in_progress",
            "job_name": "mid",
            "job_description": "running window",
        }
    )
    meta = diary_bus.get_meta()
    assert (
        derive_pipeline_verdict(
            phase=str(meta.get("ci_phase") or ""),
            conclusion="",
            exit_code=None,
            gate="",
        )
        == "running"
    )
    # Пока running — hooks пустые (серые тайлы / lock).
    assert diary_bus.get_results_hooks()["allure"] is None

    run_lab_stub(LabStubScenario(sleep_s=0.0, job_name="after-clear"))
    hooks = diary_bus.get_results_hooks()
    assert hooks["allure"]["report_url"].startswith("http://127.0.0.1:5050")
    assert hooks["dojo"]["report_url"].startswith("http://127.0.0.1:8081/")


@pytest.mark.parametrize(
    "exit_code,gate,conclusion,expected",
    [
        (0, "pass", "success", "pass"),
        (2, "fail", "success", "fail_gate"),
        (1, "error", "failure", "fail_run"),
    ],
)
def test_stub_exit_maps_verdict(exit_code, gate, conclusion, expected):
    run_lab_stub(
        LabStubScenario(
            sleep_s=0.0,
            exit_code=exit_code,
            gate=gate,
            conclusion=conclusion,
            skip_hooks=(exit_code == 1),
        )
    )
    meta = diary_bus.get_meta()
    assert (
        derive_pipeline_verdict(
            phase=str(meta.get("ci_phase") or ""),
            conclusion=str(meta.get("ci_conclusion") or ""),
            exit_code=meta.get("ci_exit_code"),
            gate=str(meta.get("ci_gate") or ""),
        )
        == expected
    )


def test_stub_fail_before_hooks_leaves_empty():
    diary_bus.set_results_hook("allure", "http://127.0.0.1:5050/?x=1")
    diary_bus.clear_results_hooks()
    code = run_lab_stub(
        LabStubScenario(sleep_s=0.0, fail_before_hooks=True, job_name="crash")
    )
    assert code == 1
    hooks = diary_bus.get_results_hooks()
    assert hooks["allure"] is None
    assert hooks["dojo"] is None
    meta = diary_bus.get_meta()
    assert meta.get("ci_exit_code") == 1


def test_stub_stop_flag_cancels():
    stopped = {"v": False}

    def flag():
        return stopped["v"]

    # sleep chunked — flip stop mid-way
    t0 = time.time()

    def stopper():
        if time.time() - t0 > 0.08:
            stopped["v"] = True
        return stopped["v"]

    code = run_lab_stub(
        LabStubScenario(sleep_s=2.0, job_name="stop-me"),
        stop_flag=stopper,
    )
    assert code == 1
    assert time.time() - t0 < 1.5
    meta = diary_bus.get_meta()
    assert meta.get("ci_conclusion") == "cancelled"


class _InlineStubProc:
    """Popen-замена: stub в том же процессе (изолированный tmp live)."""

    def __init__(self, scenario: LabStubScenario, pid: int = 4242):
        import threading

        self.pid = pid
        self._code = None
        self._done = threading.Event()
        self._stop = threading.Event()

        def _run() -> None:
            self._code = run_lab_stub(scenario, stop_flag=self._stop.is_set)
            self._done.set()

        threading.Thread(target=_run, name="inline-stub", daemon=True).start()

    def poll(self):
        return self._code if self._done.is_set() else None

    def wait(self, timeout=None):
        if not self._done.wait(timeout if timeout is not None else 60):
            raise TimeoutError("inline stub wait")
        return int(self._code if self._code is not None else 1)

    def terminate(self):
        self._stop.set()

    def kill(self):
        self._stop.set()


def _install_inline_stub(monkeypatch, scenario: LabStubScenario):
    monkeypatch.setattr(
        "utils.lab_run.subprocess.Popen",
        lambda *a, **k: _InlineStubProc(scenario),
    )
    monkeypatch.setattr("utils.lab_run._pid_alive", lambda pid: True)
    monkeypatch.setattr("utils.lab_run._kill_pid_tree", lambda pid: None)
    monkeypatch.setattr(
        "utils.live_server.notify_ci_status",
        lambda **fields: apply_ci_status(
            {k: v for k, v in fields.items() if v is not None}
        ),
    )


def test_start_run_stub_clears_and_finishes(monkeypatch):
    """Тот же канал, что кнопка Editor → playground (stub=True)."""
    diary_bus.set_results_hook("allure", "http://127.0.0.1:5050/?stale=btn")
    diary_bus.set_results_hook("dojo", "http://127.0.0.1:8081/engagement/999")
    _install_inline_stub(
        monkeypatch,
        LabStubScenario(
            sleep_s=0.05,
            exit_code=0,
            gate="pass",
            allure_url="http://127.0.0.1:5050/",
            dojo_url="http://127.0.0.1:8081/engagement/42",
            job_name="btn-stub",
        ),
    )

    started = lab_run.start_run(
        {"meta": {"project_id": "stub"}},
        session_name="btn-stub",
        stub=True,
        stub_opts={"sleep_s": 0.05, "exit_code": 0},
    )
    assert started["ok"] is True
    assert started.get("stub") is True

    hooks0 = diary_bus.get_results_hooks()
    assert hooks0["allure"] is None
    assert hooks0["dojo"] is None

    deadline = time.time() + 10
    while time.time() < deadline:
        st = lab_run.get_run_status()
        if st.get("phase") == "finished" and st.get("run_id") == started["run_id"]:
            break
        time.sleep(0.05)
    else:
        pytest.fail("stub run did not finish")

    assert lab_run.get_run_status().get("exit_code") == 0
    hooks = diary_bus.get_results_hooks()
    assert hooks["allure"]["report_url"] == "http://127.0.0.1:5050/"
    assert hooks["dojo"]["report_url"] == "http://127.0.0.1:8081/engagement/42"
    meta = diary_bus.get_meta()
    assert meta.get("ci_phase") == "completed"
    assert meta.get("ci_exit_code") == 0


def test_start_run_stub_concurrent_rejected(monkeypatch):
    _install_inline_stub(
        monkeypatch,
        LabStubScenario(sleep_s=2.0, exit_code=0, job_name="long"),
    )
    lab_run.start_run({}, stub=True, stub_opts={"sleep_s": 2.0}, session_name="long")
    with pytest.raises(RuntimeError, match="already in progress"):
        lab_run.start_run({}, stub=True, stub_opts={"sleep_s": 0.0})
    stopped = lab_run.stop_run()
    assert stopped.get("stopped") is True


def test_dojo_butta_high_breaks_gate_and_keeps_hooks():
    """Бутафория Dojo High → exit 2, но ссылки на отчёты остаются (для акта)."""
    from utils.lab_run_stub import BUTTA_DOJO_HIGH

    code = run_lab_stub(
        LabStubScenario(
            sleep_s=0.0,
            dojo_butta_high=True,
            job_name="butta-gate",
        )
    )
    assert code == 2
    hooks = diary_bus.get_results_hooks()
    assert hooks["allure"]["report_url"].startswith("http://127.0.0.1:5050")
    assert hooks["dojo"]["report_url"].startswith("http://127.0.0.1:8081/")
    assert hooks["dojo"].get("stats", {}).get("high") == BUTTA_DOJO_HIGH["high"]
    meta = diary_bus.get_meta()
    assert meta.get("ci_exit_code") == 2
    assert meta.get("ci_gate") == "fail"
    assert (
        derive_pipeline_verdict(
            phase=str(meta.get("ci_phase") or ""),
            conclusion=str(meta.get("ci_conclusion") or ""),
            exit_code=meta.get("ci_exit_code"),
            gate=str(meta.get("ci_gate") or ""),
            risk_hints=meta.get("ci_risk_hints")
            if isinstance(meta.get("ci_risk_hints"), dict)
            else None,
        )
        == "fail_gate"
    )
    hints = meta.get("ci_risk_hints") or {}
    assert hints.get("elevated") is True
    assert hints.get("counts", {}).get("high") == 1


def test_dojo_soft_only_pass_watch_hints():
    """Только Medium/Low — gate pass, но risk_hints для pass_watch на FE."""
    code = run_lab_stub(
        LabStubScenario(
            sleep_s=0.0,
            exit_code=0,
            gate="pass",
            dojo_stats={"medium": 2, "low": 1},
            apply_dojo_gate=True,
            job_name="soft-only",
        )
    )
    assert code == 0
    meta = diary_bus.get_meta()
    assert meta.get("ci_exit_code") == 0
    assert meta.get("ci_gate") == "pass"
    hints = meta.get("ci_risk_hints") or {}
    assert hints.get("highest_severity") == "medium"
    assert (
        derive_pipeline_verdict(
            phase="completed",
            conclusion="success",
            exit_code=0,
            gate="pass",
            risk_hints=hints,
        )
        == "pass_watch"
    )


def test_new_stub_run_clears_sticky_risk_hints():
    """Баг-хант: после High-fail следующий clean pass не тащит elevated/pass_watch."""
    assert (
        run_lab_stub(
            LabStubScenario(sleep_s=0.0, dojo_butta_high=True, job_name="sticky-a")
        )
        == 2
    )
    assert (diary_bus.get_meta().get("ci_risk_hints") or {}).get("elevated") is True

    assert (
        run_lab_stub(
            LabStubScenario(
                sleep_s=0.0,
                exit_code=0,
                gate="pass",
                job_name="sticky-b",
            )
        )
        == 0
    )
    meta = diary_bus.get_meta()
    assert meta.get("ci_exit_code") == 0
    assert meta.get("ci_gate") == "pass"
    assert meta.get("ci_risk_hints") in ({}, None) or not meta.get("ci_risk_hints")
    assert meta.get("ci_verdict") == "pass"
    assert meta.get("ci_recommendations") in ([], None) or not meta.get(
        "ci_recommendations"
    )
