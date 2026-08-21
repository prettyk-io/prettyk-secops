# -*- coding: utf-8 -*-
"""Пути zap-results и выбор XML для Dojo."""

from pathlib import Path

from adapters.defectdojo_client import resolve_zap_xml_for_dojo
from utils import paths as paths_mod


def test_artifact_path_zap_results(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_REPORTS_DIR", str(tmp_path))
    # reload dirs from env
    import importlib

    importlib.reload(paths_mod)
    p = paths_mod.artifact_path("reports/zap-results/juice.xml")
    assert p == tmp_path / "zap-results" / "juice.xml"
    p2 = paths_mod.artifact_path("zap-results/juice.xml")
    assert p2 == tmp_path / "zap-results" / "juice.xml"
    # голое имя → allure-results (скриншоты), не zap
    assert paths_mod.artifact_path("shot.png") == tmp_path / "allure-results" / "shot.png"


def test_zap_report_path_bare_name(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_REPORTS_DIR", str(tmp_path))
    import importlib

    importlib.reload(paths_mod)
    assert paths_mod.zap_report_path("juice_dojo.xml") == tmp_path / "zap-results" / "juice_dojo.xml"
    assert paths_mod.zap_report_path("zap-results/x.xml") == tmp_path / "zap-results" / "x.xml"
    assert (
        paths_mod.zap_report_path("reports/zap-results/x.xml") == tmp_path / "zap-results" / "x.xml"
    )


def test_resolve_zap_xml_prefers_explicit(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_REPORTS_DIR", str(tmp_path))
    import importlib

    importlib.reload(paths_mod)
    from adapters import defectdojo_client as dd

    importlib.reload(dd)

    zap = tmp_path / "zap-results"
    zap.mkdir()
    older = zap / "old.xml"
    newer = zap / "new.xml"
    older.write_text("<x/>", encoding="utf-8")
    newer.write_text("<y/>", encoding="utf-8")
    assert dd.resolve_zap_xml_for_dojo(str(older)) == older
    assert dd.resolve_zap_xml_for_dojo(None) == newer
