# -*- coding: utf-8 -*-
from pathlib import Path

from utils import allure_project as ap


def test_default_mode_flat(monkeypatch, tmp_path):
    monkeypatch.setenv("PK_REPORTS_DIR", str(tmp_path))
    monkeypatch.delenv("PK_ALLURE_PROJECT_MODE", raising=False)
    monkeypatch.delenv("PK_CHECK_ID", raising=False)
    monkeypatch.delenv("PK_RUN_ID", raising=False)
    import importlib

    from utils import paths as paths_mod

    importlib.reload(paths_mod)
    importlib.reload(ap)

    # Дефолт теперь check (per-run/per-check), но без run_id/check_id → project "default".
    assert ap.allure_project_mode() == "check"
    assert ap.resolve_allure_project_id() == "default"
    assert ap.resolve_allure_results_dir() == paths_mod.ALLURE_RESULTS_DIR


def test_check_mode_prefers_check_id(monkeypatch, tmp_path):
    monkeypatch.setenv("PK_REPORTS_DIR", str(tmp_path))
    monkeypatch.setenv("PK_ALLURE_PROJECT_MODE", "check")
    monkeypatch.setenv("PK_RUN_ID", "9fe732d1435b")
    monkeypatch.setenv("PK_CHECK_ID", "chk_abc-123!")
    import importlib

    importlib.reload(ap)

    # AL3-INSTANCE: check_id побеждает run_id — проект = instance, не per-run.
    pid = ap.resolve_allure_project_id()
    assert pid == "chk_abc-123"
    url = ap.build_allure_report_url("http://127.0.0.1:5050", pid)
    assert "/projects/chk_abc-123/reports/latest/" in url


def test_check_mode_fallback_to_run_id_when_no_check_id(monkeypatch, tmp_path):
    monkeypatch.setenv("PK_REPORTS_DIR", str(tmp_path))
    monkeypatch.setenv("PK_ALLURE_PROJECT_MODE", "check")
    monkeypatch.setenv("PK_RUN_ID", "9fe732d1435b")
    monkeypatch.delenv("PK_CHECK_ID", raising=False)
    import importlib

    importlib.reload(ap)

    # AL3-INSTANCE: fallback на run_id, когда check_id не назначен.
    pid = ap.resolve_allure_project_id()
    assert pid == "9fe732d1435b"


def test_check_mode_subdir_not_meta_project_id(monkeypatch, tmp_path):
    monkeypatch.setenv("PK_REPORTS_DIR", str(tmp_path))
    monkeypatch.setenv("PK_ALLURE_PROJECT_MODE", "check")
    monkeypatch.setenv("PK_CHECK_ID", "chk_abc-123!")
    monkeypatch.setenv("PK_META_PROJECT_ID", "ib-web")  # must NOT become allure id
    import importlib

    from utils import paths as paths_mod

    importlib.reload(paths_mod)
    importlib.reload(ap)

    pid = ap.resolve_allure_project_id()
    assert pid == "chk_abc-123"
    assert pid != "ib-web"
    results = ap.resolve_allure_results_dir()
    assert results == paths_mod.ALLURE_RESULTS_DIR / pid
    assert results.is_dir()
    url = ap.build_allure_report_url("http://127.0.0.1:5050", pid)
    assert "/projects/chk_abc-123/reports/latest/" in url


def test_slugify_rejects_empty():
    assert ap.slugify_allure_project_id("") == "default"
    assert ap.slugify_allure_project_id("!!!") == "default"


def test_summarize_allure_results_dir_counts(tmp_path):
    (tmp_path / "a-result.json").write_text(
        '{"status":"passed","name":"a"}', encoding="utf-8"
    )
    (tmp_path / "b-result.json").write_text(
        '{"status":"failed","name":"b"}', encoding="utf-8"
    )
    (tmp_path / "c-result.json").write_text(
        '{"status":"broken","name":"c"}', encoding="utf-8"
    )
    (tmp_path / "d-result.json").write_text(
        '{"status":"skipped","name":"d"}', encoding="utf-8"
    )
    summary = ap.summarize_allure_results_dir(tmp_path)
    assert summary["passed"] == 1
    assert summary["failed"] == 1
    assert summary["broken"] == 1
    assert summary["skipped"] == 1
    assert summary["total"] == 4
    assert summary["status"] == "has_failures"
