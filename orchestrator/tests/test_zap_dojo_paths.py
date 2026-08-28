# -*- coding: utf-8 -*-
"""Пути scanner-results и выбор XML для Dojo."""

from pathlib import Path

from adapters.defectdojo_client import resolve_scanner_xml_for_dojo
from utils import paths as paths_mod


def test_artifact_path_scanner_results(tmp_path, monkeypatch):
    monkeypatch.setenv("PK_REPORTS_DIR", str(tmp_path))
    # reload dirs from env
    import importlib

    importlib.reload(paths_mod)
    p = paths_mod.artifact_path("reports/scanner-results/juice.xml")
    assert p == paths_mod.scanner_RESULTS_DIR / "juice.xml"
    p2 = paths_mod.artifact_path("scanner-results/juice.xml")
    assert p2 == paths_mod.scanner_RESULTS_DIR / "juice.xml"
    # голое имя → allure-results (скриншоты), не scanner
    assert paths_mod.artifact_path("shot.png") == tmp_path / "allure-results" / "shot.png"


def test_scanner_report_path_bare_name(tmp_path, monkeypatch):
    monkeypatch.setenv("PK_REPORTS_DIR", str(tmp_path))
    import importlib

    importlib.reload(paths_mod)
    assert paths_mod.scanner_report_path("juice_dojo.xml") == paths_mod.scanner_RESULTS_DIR / "juice_dojo.xml"
    assert paths_mod.scanner_report_path("scanner-results/x.xml") == paths_mod.scanner_RESULTS_DIR / "x.xml"
    assert (
        paths_mod.scanner_report_path("reports/scanner-results/x.xml") == paths_mod.scanner_RESULTS_DIR / "x.xml"
    )


def test_resolve_scanner_xml_prefers_explicit(tmp_path, monkeypatch):
    monkeypatch.setenv("PK_REPORTS_DIR", str(tmp_path))
    import importlib

    importlib.reload(paths_mod)
    from adapters import defectdojo_client as dd

    importlib.reload(dd)

    scanner = paths_mod.scanner_RESULTS_DIR
    scanner.mkdir(parents=True, exist_ok=True)
    older = scanner / "old.xml"
    newer = scanner / "new.xml"
    older.write_text("<x/>", encoding="utf-8")
    newer.write_text("<y/>", encoding="utf-8")
    assert dd.resolve_scanner_xml_for_dojo(str(older)) == older
    assert dd.resolve_scanner_xml_for_dojo(None) == newer
