# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import zipfile
from pathlib import Path

from utils import diary_bus, paths, run_package


def _patch_layout(tmp_path: Path, monkeypatch):
    live = tmp_path / "live"
    exports = live / "exports"
    runs = tmp_path / "runs"
    live.mkdir()
    exports.mkdir()
    runs.mkdir()

    monkeypatch.setattr(paths, "LIVE_DIR", live)
    monkeypatch.setattr(paths, "LIVE_EXPORTS_DIR", exports)
    monkeypatch.setattr(paths, "DIARY_NDJSON", live / "diary.ndjson")
    monkeypatch.setattr(paths, "LIVE_META_JSON", live / "meta.json")
    monkeypatch.setattr(paths, "RESULTS_HOOKS_JSON", live / "results_hooks.json")
    monkeypatch.setattr(paths, "RUNS_DIR", runs)
    monkeypatch.setattr(paths, "REPORTS_DIR", tmp_path)

    monkeypatch.setattr(diary_bus, "LIVE_DIR", live)
    monkeypatch.setattr(diary_bus, "LIVE_EXPORTS_DIR", exports)
    monkeypatch.setattr(diary_bus, "DIARY_NDJSON", live / "diary.ndjson")
    monkeypatch.setattr(diary_bus, "LIVE_META_JSON", live / "meta.json")
    monkeypatch.setattr(diary_bus, "RESULTS_HOOKS_JSON", live / "results_hooks.json")

    monkeypatch.setattr(run_package, "LIVE_DIR", live)
    monkeypatch.setattr(run_package, "RUNS_DIR", runs)
    monkeypatch.setattr(run_package, "REPORTS_DIR", tmp_path)
    monkeypatch.setattr(run_package, "DIARY_NDJSON", live / "diary.ndjson")
    monkeypatch.setattr(run_package, "LIVE_META_JSON", live / "meta.json")
    monkeypatch.setattr(run_package, "RESULTS_HOOKS_JSON", live / "results_hooks.json")

    return live, exports, runs


def test_build_run_package_includes_diary_cuts_meta(tmp_path, monkeypatch):
    live, exports, runs = _patch_layout(tmp_path, monkeypatch)

    diary_bus.clear()
    diary_bus.set_meta(
        session_name="packdemo",
        status="waiting",
        generate_act=True,
        assessment_purpose="emergency",
        ci_gate="fail",
        ci_verdict="fail_gate",
        ci_exit_code=2,
        ci_recommendations=["Закрыть High до следующего допуска"],
    )
    diary_bus.set_results_hook(
        "allure",
        "http://127.0.0.1:5050/",
        summary={"passed": 3, "failed": 0, "broken": 0, "skipped": 1, "status": "ok"},
    )
    diary_bus.set_results_hook(
        "dojo",
        "http://127.0.0.1:8081/engagement/1",
        stats={"high": 1, "medium": 0, "low": 1, "info": 0, "critical": 0},
        counts_source="dojo_findings",
        filter_audit={"raw": 4, "kept": 1, "dropped_fp": 2, "dropped_dup": 1},
        collapse={
            "raw_count": 5,
            "cluster_count": 1,
            "systemic_clusters": 1,
            "top_findings": [
                {
                    "name": "Missing Anti-clickjacking Header",
                    "risk": "low",
                    "count": 5,
                }
            ],
        },
        executive={
            "executive_class": "High",
            "recommendations": [
                "Заключение: высокий уровень риска — закрыть ACTIVE High.",
            ],
        },
    )
    (live / "diary.ndjson").write_text(
        json.dumps(
            {
                "kind": "scanner",
                "text": "Authorization Bearer secret-token-abc password=hunter2",
                "channel": "scanner",
                "run_id": "packdemo",
                "ts": 1,
            }
        )
        + "\n",
        encoding="utf-8",
    )
    snap = diary_bus.export_diary_snapshot(run_id="packdemo")
    assert Path(snap["export_path"]).is_file()

    run_dir = runs / "packdemo"
    cuts = run_dir / "log_cuts"
    cuts.mkdir(parents=True)
    (cuts / "LEGION.log").write_text("cut-line\n", encoding="utf-8")
    (run_dir / "Wired.json").write_text("{}", encoding="utf-8")

    info = run_package.build_run_package(run_id="packdemo", out_dir=exports)
    zpath = Path(info["path"])
    assert zpath.is_file()
    assert info["bytes"] > 0

    with zipfile.ZipFile(zpath, "r") as zf:
        names = set(zf.namelist())
        assert "meta/meta.json" in names
        assert "meta/results_hooks.json" in names
        assert "meta/package_gate.json" in names
        assert "meta/package.json" in names
        assert "act/act.html" in names
        assert "logs/cuts/LEGION.log" in names
        assert "run/Wired.json" in names
        assert any(n.startswith("logs/diary/") for n in names)
        assert b"cut-line" in zf.read("logs/cuts/LEGION.log")
        act = zf.read("act/act.html").decode("utf-8")
        assert "Акт проверки" in act
        assert "packdemo" in act
        assert "Missing Anti-clickjacking Header" in act
        assert "high: 1" in act
        assert "Заключение (RES-5):" in act
        assert "High" in act
        assert "высокий уровень риска" in act
        assert "counts_source" in act
        assert "Dojo ACTIVE (findings)" in act
        assert "Пересчёт допуска" in act
        gate_json = json.loads(zf.read("meta/package_gate.json").decode("utf-8"))
        assert gate_json.get("gate") == "fail"
        assert gate_json.get("verdict") == "fail_gate"
        pkg = json.loads(zf.read("meta/package.json").decode("utf-8"))
        assert pkg.get("gate_recalc", {}).get("gate") == "fail"
        assert pkg.get("act") == "included"
        assert "Допуск: не пройден" in act
        # recommendation from build_executive_conclusion + ci_recommendations
        assert "ACTIVE High" in act or "до следующего допуска" in act
        assert "Allure: passed=3" in act
        assert "kept=1" in act
        diary_blob = b""
        for name in names:
            if name.startswith("logs/diary/") and name.endswith(".ndjson"):
                diary_blob = zf.read(name)
                break
        assert diary_blob
        diary_text = diary_blob.decode("utf-8")
        assert "secret-token-abc" not in diary_text
        assert "hunter2" not in diary_text
        assert "Bearer ***" in diary_text or "***" in diary_text


def test_export_diary_snapshot_is_run_scoped(tmp_path, monkeypatch):
    """MONITOR-LIVE-DEEPLINK: run-export не подмешивает unscoped/чужие события."""
    live, _exports, _runs = _patch_layout(tmp_path, monkeypatch)
    diary_bus.clear()
    (live / "diary.ndjson").write_text(
        json.dumps({"kind": "STEP", "text": "own", "run_id": "run-A", "ts": 1}) + "\n"
        + json.dumps({"kind": "STEP", "text": "unscoped", "ts": 2}) + "\n"
        + json.dumps({"kind": "STEP", "text": "foreign", "run_id": "run-B", "ts": 3}) + "\n",
        encoding="utf-8",
    )
    snap = diary_bus.export_diary_snapshot(run_id="run-A")
    lines = [
        json.loads(x)
        for x in Path(snap["export_path"]).read_text(encoding="utf-8").splitlines()
        if x.strip()
    ]
    assert [e.get("text") for e in lines] == ["own"]
    assert snap["events_count"] == 1


def test_build_run_package_omits_act_when_generate_act_false(tmp_path, monkeypatch):
    _live, exports, _runs = _patch_layout(tmp_path, monkeypatch)
    diary_bus.clear()
    diary_bus.set_meta(
        session_name="noact",
        generate_act=False,
        ci_verdict="pass",
        ci_exit_code=0,
        ci_gate="pass",
    )
    diary_bus.set_results_hook("allure", "http://127.0.0.1:5050/")
    diary_bus.set_results_hook("dojo", "http://127.0.0.1:8081/engagement/1")

    info = run_package.build_run_package(run_id="noact", out_dir=exports)
    with zipfile.ZipFile(info["path"], "r") as zf:
        names = set(zf.namelist())
        pkg = json.loads(zf.read("meta/package.json").decode("utf-8"))
    assert "act/act.html" not in names
    assert pkg.get("act") == "omitted"
    assert pkg.get("act_omit_reason") == "generate_act_off"


def test_build_run_package_omits_act_on_fail_run(tmp_path, monkeypatch):
    _live, exports, _runs = _patch_layout(tmp_path, monkeypatch)
    diary_bus.clear()
    diary_bus.set_meta(
        session_name="crashpack",
        generate_act=True,
        ci_verdict="fail_run",
        ci_exit_code=1,
        ci_gate="void",
        ci_risk_hints={"admission_void": True},
    )
    diary_bus.set_results_hook("allure", "http://127.0.0.1:5050/")
    diary_bus.set_results_hook("dojo", "http://127.0.0.1:8081/engagement/1")

    info = run_package.build_run_package(run_id="crashpack", out_dir=exports)
    with zipfile.ZipFile(info["path"], "r") as zf:
        names = set(zf.namelist())
        pkg = json.loads(zf.read("meta/package.json").decode("utf-8"))
    assert "act/act.html" not in names
    assert pkg.get("act") == "omitted"
    assert pkg.get("act_omit_reason") == "admission_axis_not_ready"


def test_is_admission_axis_ready_matrix():
    assert run_package.is_admission_axis_ready({"ci_verdict": "pass"}) is True
    assert run_package.is_admission_axis_ready({"ci_verdict": "fail_gate"}) is True
    assert run_package.is_admission_axis_ready({"ci_verdict": "fail_run"}) is False
    assert (
        run_package.is_admission_axis_ready(
            {"ci_verdict": "pass", "ci_risk_hints": {"debug_mode": True}}
        )
        is False
    )


def test_redact_diary_text_strips_bearer_and_password():
    raw = (
        'Bearer abc.def.ghi password=plain "password":"x" '
        "Authorization: Basic YWRtaW46c2VjcmV0 "
        "api_key=sk-live-123 "
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sigpart"
    )
    out = run_package.redact_diary_text(raw)
    assert "abc.def.ghi" not in out
    assert "plain" not in out
    assert "YWRtaW46c2VjcmV0" not in out
    assert "sk-live-123" not in out
    assert "eyJhbGciOiJIUzI1NiJ9" not in out
    assert "***" in out


def test_axis_labels_void_admission_on_fail_run_even_if_gate_fail():
    execution, admission = run_package._axis_labels(
        {
            "ci_verdict": "fail_run",
            "ci_exit_code": 1,
            "ci_gate": "fail",
            "ci_risk_hints": {
                "admission_void": True,
                "execution_fault_kind": "webdriver",
                "counts": {"high": 2},
            },
        }
    )
    assert "WebDriver/Selenium" in execution
    assert "недействителен" in admission
    assert "не пройден" not in admission


def test_axis_labels_debug_mode_void_admission():
    execution, admission = run_package._axis_labels(
        {
            "ci_verdict": "pass",
            "ci_exit_code": 0,
            "ci_gate": "void",
            "ci_risk_hints": {
                "admission_void": True,
                "debug_mode": True,
            },
        }
    )
    assert "завершено" in execution
    assert "режим отладки" in admission


def test_build_run_package_includes_fuzz_json(tmp_path, monkeypatch):
    _live, exports, runs = _patch_layout(tmp_path, monkeypatch)

    diary_bus.clear()
    fuzz_dir = tmp_path / "fuzz"
    fuzz_dir.mkdir()
    (fuzz_dir / "digest.json").write_text('{"ok":true}\n', encoding="utf-8")

    run_dir = runs / "fuzzpack1"
    run_dir.mkdir()
    (run_dir / "Wired.json").write_text("{}", encoding="utf-8")

    info = run_package.build_run_package(run_id="fuzzpack1", out_dir=exports)
    with zipfile.ZipFile(info["path"], "r") as zf:
        names = set(zf.namelist())
    assert "fuzz/digest.json" in names


def test_build_run_package_blocks_plaintext_secrets(tmp_path, monkeypatch):
    _live, exports, runs = _patch_layout(tmp_path, monkeypatch)
    monkeypatch.delenv("PK_PACKAGE_ALLOW_SECRETS", raising=False)

    diary_bus.clear()
    diary_bus.set_meta(session_name="secleak", generate_act=False, ci_verdict="pass")

    run_dir = runs / "secleak"
    run_dir.mkdir()
    (run_dir / "Wired.json").write_text(
        '{"note":"AKIA0123456789ABCDEF"}\n',
        encoding="utf-8",
    )

    info = run_package.build_run_package(run_id="secleak", out_dir=exports)
    assert info.get("ok") is False
    assert info.get("error") == "plaintext_secrets"
    assert info.get("path") is None
    assert (info.get("secret_scan") or {}).get("count", 0) >= 1
    assert list(exports.glob("*-package*.zip")) == []
