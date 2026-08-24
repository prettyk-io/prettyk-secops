# -*- coding: utf-8 -*-
"""Lab single-flight run API (RES-L)."""
from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from utils import lab_run

FIX = Path(__file__).resolve().parents[1] / "fixtures" / "validate_ok.json"


@pytest.fixture
def runs_tmp(monkeypatch, tmp_path):
    runs = tmp_path / "runs"
    runs.mkdir()
    monkeypatch.setattr("utils.paths.RUNS_DIR", runs)
    monkeypatch.setattr("utils.lab_run.RUNS_DIR", runs)
    monkeypatch.setattr("utils.lab_run.ensure_runs_dir", lambda: runs)
    lab_run.reset_run_state_for_tests()
    yield runs
    lab_run.reset_run_state_for_tests()


class _FakeProc:
    """Stays running until finish() — watch thread must not flip status early."""

    def __init__(self, pid: int = 4242):
        self.pid = pid
        self._code = None
        self._done = threading.Event()

    def poll(self):
        return self._code

    def wait(self, timeout=None):
        if not self._done.wait(timeout=timeout if timeout is not None else 60):
            raise TimeoutError("fake wait timeout")
        if self._code is None:
            self._code = 0
        return self._code

    def terminate(self):
        self._code = 1
        self._done.set()

    def kill(self):
        self.terminate()

    def finish(self) -> None:
        self._code = 0
        self._done.set()


def test_start_run_ok_and_status(runs_tmp, monkeypatch):
    fake = _FakeProc()
    monkeypatch.setattr(
        "utils.lab_run.subprocess.Popen",
        lambda *a, **k: fake,
    )
    monkeypatch.setattr("utils.lab_run._pid_alive", lambda pid: True)
    monkeypatch.setattr(
        "utils.lab_run.validate_wired_file",
        lambda *a, **k: ([], object()),
    )

    wired = json.loads(FIX.read_text(encoding="utf-8"))
    started = lab_run.start_run(wired, session_name="unit")
    assert started["ok"] is True
    assert started["phase"] == "running"
    assert started["pid"] == 4242

    st = lab_run.get_run_status()
    assert st["phase"] == "running"
    assert st["run_id"] == started["run_id"]
    assert (runs_tmp / started["run_id"] / "Wired.json").is_file()


def test_start_run_rejects_concurrent(runs_tmp, monkeypatch):
    fake = _FakeProc()
    monkeypatch.setattr(
        "utils.lab_run.subprocess.Popen",
        lambda *a, **k: fake,
    )
    monkeypatch.setattr("utils.lab_run._pid_alive", lambda pid: True)
    monkeypatch.setattr(
        "utils.lab_run.validate_wired_file",
        lambda *a, **k: ([], object()),
    )
    wired = json.loads(FIX.read_text(encoding="utf-8"))
    lab_run.start_run(wired)
    with pytest.raises(RuntimeError, match="already in progress"):
        lab_run.start_run(wired)


def test_start_run_rejects_bad_Wired(runs_tmp):
    with pytest.raises(ValueError):
        lab_run.start_run({"meta": {}})


def test_lab_env_traffic_feed_allowlist(monkeypatch):
    monkeypatch.delenv("KDT_TRAFFIC_INSERTION_FEED", raising=False)
    env = lab_run._lab_env(
        session_name=None,
        env_overrides={
            "KDT_TRAFFIC_INSERTION_FEED": "1",
            "PATH": "/evil",
            "KDT_LIVE": "0",
        },
    )
    assert env["KDT_TRAFFIC_INSERTION_FEED"] == "1"
    assert env["KDT_LIVE"] == "1"
    assert env.get("PATH") != "/evil"


def test_stop_run_terminates_active(runs_tmp, monkeypatch):
    fake = _FakeProc(pid=9001)
    monkeypatch.setattr(
        "utils.lab_run.subprocess.Popen",
        lambda *a, **k: fake,
    )
    monkeypatch.setattr("utils.lab_run._pid_alive", lambda pid: True)
    monkeypatch.setattr(
        "utils.lab_run.validate_wired_file",
        lambda *a, **k: ([], object()),
    )
    monkeypatch.setattr("utils.lab_run._kill_pid_tree", lambda pid: None)
    monkeypatch.setattr(
        "utils.live_server.notify_ci_status",
        lambda **fields: {"ok": True, **fields},
    )

    wired = json.loads(FIX.read_text(encoding="utf-8"))
    started = lab_run.start_run(wired)
    stopped = lab_run.stop_run()
    assert stopped["ok"] is True
    assert stopped["stopped"] is True
    assert stopped["run_id"] == started["run_id"]
    st = lab_run.get_run_status()
    assert st["phase"] == "finished"
    assert st["exit_code"] == 1
    fake.finish()


def test_stop_run_idle_raises(runs_tmp):
    with pytest.raises(RuntimeError, match="no run in progress"):
        lab_run.stop_run()


def test_materialize_suite_imports_copies_lab_resource(runs_tmp, tmp_path, monkeypatch):
    lab_res = tmp_path / "lab" / "resources"
    lab_res.mkdir(parents=True)
    (lab_res / "r_2.txt").write_text("x\n", encoding="utf-8")
    monkeypatch.setattr(
        "utils.lab_run._import_search_roots",
        lambda: [tmp_path / "lab"],
    )
    run_dir = runs_tmp / "copyme"
    run_dir.mkdir()
    wired = {
        "test_suites": {
            "imports": [{"path": "resources/r_2.txt", "kind": "data_file", "as": "r_2"}]
        }
    }
    lab_run.materialize_suite_imports(wired, run_dir)
    dest = run_dir / "resources" / "r_2.txt"
    assert dest.is_file()
    assert dest.read_text(encoding="utf-8") == "x\n"


def test_materialize_suite_imports_missing_fails_early(runs_tmp):
    run_dir = runs_tmp / "miss"
    run_dir.mkdir()
    with pytest.raises(ValueError, match="файл не найден"):
        lab_run.materialize_suite_imports(
            {
                "test_suites": {
                    "imports": [
                        {"path": "resources/no_such_file.txt", "kind": "data_file", "as": "x"}
                    ]
                }
            },
            run_dir,
        )


def test_write_resource_contents_har(runs_tmp):
    run_dir = runs_tmp / "har_rc"
    run_dir.mkdir()
    wired = {
        "test_suites": {
            "imports": [
                {"path": "resources/checkout.har", "kind": "har_file", "as": "checkout"}
            ]
        }
    }
    lab_run.write_resource_contents(
        wired,
        run_dir,
        {"checkout": '{"log":{"entries":[]}}'},
    )
    dest = run_dir / "resources" / "checkout.har"
    assert dest.is_file()
    assert "entries" in dest.read_text(encoding="utf-8")
    lab_run.materialize_suite_imports(wired, run_dir)
    assert dest.is_file()


def test_materialize_chain_modules_writes_har(runs_tmp):
    from utils.chain_ops import chain_from_har

    mini = {
        "log": {
            "version": "1.2",
            "creator": {"name": "t", "version": "1"},
            "entries": [
                {
                    "request": {
                        "method": "GET",
                        "url": "https://api.example/v1/me",
                        "headers": [
                            {"name": "Authorization", "value": "Bearer OLD"},
                        ],
                    },
                    "response": {"status": 200},
                }
            ],
        }
    }
    built = chain_from_har(mini, har_as="me")
    wired = {
        "test_suites": {
            "imports": [],
            "test_data_constructor": [
                {
                    "id": "me_chain",
                    "module_type": "Цепь",
                    "chain_fields": {
                        "har_as": "me",
                        "sequence_name": "me",
                        "template_har": built["template_har"],
                        "slots": [
                            {
                                **built["slots"][0],
                                "bind": "literal:Bearer LIVE",
                            }
                        ],
                        "steps": built["steps"],
                        "include_sequence_scan": True,
                    },
                }
            ],
        }
    }
    merged = lab_run.materialize_chain_modules(wired, {}, {"authorization": "Bearer LIVE"})
    assert "Bearer LIVE" in merged["me"]
    assert any(
        i.get("as") == "me" and i.get("kind") == "har_file"
        for i in wired["test_suites"]["imports"]
    )
    run_dir = runs_tmp / "chain_rc"
    run_dir.mkdir()
    lab_run.write_resource_contents(wired, run_dir, merged)
    assert (run_dir / "resources" / "me.har").is_file()


def test_playground_run_routes(runs_tmp, monkeypatch):
    from http.server import ThreadingHTTPServer
    from threading import Thread
    from urllib.request import Request, urlopen

    from tools.data_playground import Handler

    fake = _FakeProc(pid=777)
    monkeypatch.setattr(
        "utils.lab_run.subprocess.Popen",
        lambda *a, **k: fake,
    )
    monkeypatch.setattr("utils.lab_run._pid_alive", lambda pid: True)
    monkeypatch.setattr(
        "utils.lab_run.validate_wired_file",
        lambda *a, **k: ([], object()),
    )

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    t = Thread(target=server.serve_forever, daemon=True)
    t.start()
    try:
        wired = json.loads(FIX.read_text(encoding="utf-8"))
        req = Request(
            f"http://127.0.0.1:{port}/api/run/start",
            data=json.dumps({"wired": wired}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        assert body["ok"] is True
        assert body["pid"] == 777

        with urlopen(f"http://127.0.0.1:{port}/api/run/status", timeout=3) as resp:
            st = json.loads(resp.read().decode("utf-8"))
        assert st["phase"] == "running"
        assert st["pid"] == 777
        # concurrent → 409 covered in test_start_run_rejects_concurrent
    finally:
        fake.finish()
        server.shutdown()
