# -*- coding: utf-8 -*-
"""AL3-FRESH-REPAIR: unit-тесты сервиса allure3-secops (services/allure3-secops/app).

Модули сервиса грузятся из репы как отдельный пакет (без установки): регресс
на деструктивную default-генерацию и изоляцию scope'ов живёт в общем pytest-контуре.
"""
from __future__ import annotations

import importlib
import importlib.util
import subprocess
import sys
import time
import types
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[2]
_SERVICE_APP = _REPO / "services" / "allure3-secops" / "app"
_PKG = "allure3_under_test"


def _load_pkg() -> types.ModuleType:
    for name in [n for n in list(sys.modules) if n == _PKG or n.startswith(_PKG + ".")]:
        del sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        _PKG,
        _SERVICE_APP / "__init__.py",
        submodule_search_locations=[str(_SERVICE_APP)],
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[_PKG] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def service(tmp_path, monkeypatch):
    """Свежие модули сервиса с изолированными results/report рутами."""
    monkeypatch.setenv("ALLURE_RESULTS_DIR", str(tmp_path / "results"))
    monkeypatch.setenv("ALLURE_REPORT_DIR", str(tmp_path / "reports"))
    monkeypatch.setenv("ALLURE_AUTO_REGEN", "0")
    _load_pkg()
    paths = importlib.import_module(_PKG + ".paths")
    generate = importlib.import_module(_PKG + ".generate")
    return types.SimpleNamespace(paths=paths, generate=generate, root=tmp_path)


def _fake_allure_writer(calls: list) -> callable:
    def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        calls.append(list(cmd))
        out = Path(cmd[cmd.index("--output") + 1])
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text("<html>generated</html>", encoding="utf-8")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    return _run


# ── paths: layout ────────────────────────────────────────────────────────────


def test_report_dir_default_is_own_subfolder(service):
    assert service.paths.report_dir("default") == service.paths.REPORT_ROOT / "default"
    assert service.paths.report_dir("chk_1") == service.paths.REPORT_ROOT / "chk_1"


def test_latest_report_dir_picks_freshest(service):
    """Свежесть = последняя активность results, у scope'а должен быть отчёт."""
    reports = service.paths.REPORT_ROOT
    results = service.paths.RESULTS_ROOT
    import os

    for pid in ("default", "chk_a"):
        (reports / pid).mkdir(parents=True, exist_ok=True)
        (reports / pid / "index.html").write_text(pid, encoding="utf-8")
    (reports / "chk_no_report").mkdir(parents=True, exist_ok=True)  # без index.html
    (reports / "chk_no_results").mkdir(parents=True, exist_ok=True)
    (reports / "chk_no_results" / "index.html").write_text("x", encoding="utf-8")

    results.mkdir(parents=True)
    root_res = results / "root-result.json"
    root_res.write_text("{}", encoding="utf-8")
    os.utime(root_res, (1_000_000, 1_000_000))

    chk_res = results / "chk_a"
    chk_res.mkdir()
    chk_file = chk_res / "a-result.json"
    chk_file.write_text("{}", encoding="utf-8")
    os.utime(chk_file, (2_000_000, 2_000_000))

    # свежий по results, но без отчёта — не выбирается
    orphan = results / "chk_no_report"
    orphan.mkdir()
    orphan_file = orphan / "r-result.json"
    orphan_file.write_text("{}", encoding="utf-8")
    os.utime(orphan_file, (3_000_000, 3_000_000))

    assert service.paths.latest_report_dir() == reports / "chk_a"
    assert service.paths.latest_report_dir(reports / "missing") is None


# ── clean-results: scope isolation ──────────────────────────────────────────


def test_clean_results_default_keeps_project_subdirs(service):
    results = service.paths.RESULTS_ROOT
    results.mkdir(parents=True)
    (results / "root-result.json").write_text("{}", encoding="utf-8")
    chk = results / "chk_114"
    chk.mkdir()
    (chk / "check-result.json").write_text("{}", encoding="utf-8")

    service.generate.clean_results("default")

    assert not (results / "root-result.json").exists()
    assert (chk / "check-result.json").exists()

    service.generate.clean_results("chk_114")
    assert chk.is_dir()
    assert not (chk / "check-result.json").exists()


# ── generate: главный регресс — default не сносит отчёты чеков ──────────────


def test_default_generate_preserves_check_reports(service):
    results = service.paths.RESULTS_ROOT
    reports = service.paths.REPORT_ROOT
    results.mkdir(parents=True)
    (results / "default-result.json").write_text("{}", encoding="utf-8")

    check_report = reports / "114a306c-4ce5"
    check_report.mkdir(parents=True)
    (check_report / "index.html").write_text("<html>check report</html>", encoding="utf-8")

    calls: list = []
    service.generate._run_allure = _fake_allure_writer(calls)

    result = service.generate.generate_report("default")

    assert result["status"] == "ok"
    # главный инвариант: отчёт чека жив после default-генерации
    assert (check_report / "index.html").read_text(encoding="utf-8") == "<html>check report</html>"
    # default-отчёт сгенерирован в своей подпапке
    assert (reports / "default" / "index.html").is_file()
    assert calls


def test_generate_error_reports_status(service):
    results = service.paths.RESULTS_ROOT
    results.mkdir(parents=True)
    (results / "x-result.json").write_text("{}", encoding="utf-8")
    service.generate._run_allure = lambda cmd: subprocess.CompletedProcess(cmd, 3, "boom", "boom")

    result = service.generate.generate_report("default")
    assert result["status"] == "error"
    assert result["exit_code"] == 3


# ── results signature / scopes / auto-regen debounce ────────────────────────


def test_results_signature_and_scopes(service):
    results = service.paths.RESULTS_ROOT
    results.mkdir(parents=True)
    (results / "root-result.json").write_text("{}", encoding="utf-8")
    chk = results / "chk_b"
    chk.mkdir()
    (chk / "b-result.json").write_text("{}", encoding="utf-8")

    assert service.generate.results_signature("default")[0] == 1
    assert service.generate.results_signature("chk_b")[0] == 1
    assert set(service.generate.list_result_scopes()) == {"default", "chk_b"}


def test_auto_regen_tick_debounces_and_generates(service, monkeypatch):
    results = service.paths.RESULTS_ROOT
    results.mkdir(parents=True)
    (results / "root-result.json").write_text("{}", encoding="utf-8")

    generated: list[str] = []
    monkeypatch.setattr(service.generate, "generate_report", lambda pid: generated.append(pid))

    state: dict = {}
    # первый тик — baseline (results свежее отсутствующего отчёта → pending)
    service.generate._auto_regen_tick(state)
    assert generated == []
    assert state["default"][2] > 0

    # окно дебаунса истекло, сигнатура не менялась → генерация
    count, mtime, _pending = state["default"]
    state["default"] = (count, mtime, time.time() - 1000)
    service.generate._auto_regen_tick(state)
    assert generated == ["default"]


# ── HTTP-раздача: /reports/latest = свежайший scope ─────────────────────────


def test_latest_route_serves_freshest_and_check_urls(service):
    from fastapi.testclient import TestClient

    reports = service.paths.REPORT_ROOT
    results = service.paths.RESULTS_ROOT
    (reports / "default").mkdir(parents=True)
    (reports / "default" / "index.html").write_text("<html>stale default</html>", encoding="utf-8")
    chk = reports / "chk_fresh"
    chk.mkdir()
    (chk / "index.html").write_text("<html>fresh check</html>", encoding="utf-8")
    (chk / "full.html").write_text("<html>fresh full</html>", encoding="utf-8")
    import os

    results.mkdir(parents=True)
    root_res = results / "root-result.json"
    root_res.write_text("{}", encoding="utf-8")
    os.utime(root_res, (1_000_000, 1_000_000))
    chk_res = results / "chk_fresh"
    chk_res.mkdir()
    chk_res_file = chk_res / "f-result.json"
    chk_res_file.write_text("{}", encoding="utf-8")
    os.utime(chk_res_file, (2_000_000, 2_000_000))

    main = importlib.import_module(_PKG + ".main")
    client = TestClient(main.app)

    # канон :5050/full.html-подобный URL — теперь свежий чек, не stale default
    assert "fresh check" in client.get("/reports/latest/index.html").text
    assert "fresh full" in client.get("/reports/latest/full.html").text
    assert client.get("/reports/latest", follow_redirects=False).status_code in (302, 307)
    # канонический URL чека живёт отдельно
    assert "fresh check" in client.get("/projects/chk_fresh/reports/latest/index.html").text
    # path escape
    assert client.get("/reports/latest/../secret.txt").status_code in (403, 404)
