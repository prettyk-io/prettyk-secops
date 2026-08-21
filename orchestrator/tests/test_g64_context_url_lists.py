# -*- coding: utf-8 -*-
"""G-64: НовыйКонтекст → auto-include base + URL-списков suites."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.controller import Controller
from core.data_stream import DataStream
from models.wired import SuiteImport


class _Zap:
    def __init__(self):
        self.includes: list[tuple[str, str]] = []

    def set_context_include(self, context_name, regex):
        self.includes.append((context_name, regex))

    @staticmethod
    def domains_csv_to_include_regexes(domains_csv: str) -> list:
        from adapters.zap_adapter import ZapAdapter

        return ZapAdapter.domains_csv_to_include_regexes(domains_csv)


def _ctrl(*, base="http://juice-shop:3000", imports=None, modules=None):
    ctrl = Controller.__new__(Controller)
    ctrl._url_list_keys = set()
    ctrl.adapters = {"zap": _Zap()}
    ctrl.wired = SimpleNamespace(
        test_suites=SimpleNamespace(
            imports=imports or [],
            test_data_constructor=modules or [],
        ),
        security_configuration=SimpleNamespace(
            base_url_override=base,
            allowed_extra_domains="evil.example.com",
        ),
    )
    return ctrl


def test_include_base_and_stream_urls_not_allowed_extra():
    ctrl = _ctrl()
    ctrl._url_list_keys = {"urls"}
    stream = DataStream()
    stream.set(
        "urls",
        [
            "http://juice-shop:3000/#/login",
            "http://juice-shop:3000/#/register",
        ],
    )
    ctrl._include_url_lists_in_context("juice_ctx", stream)
    zap: _Zap = ctrl.adapters["zap"]
    joined = " ".join(rx for _, rx in zap.includes)
    assert "juice-shop" in joined or "juice\\-shop" in joined
    assert "login" in joined or r"\#" in joined or "/#" in joined
    assert "evil" not in joined
    assert all(ctx == "juice_ctx" for ctx, _ in zap.includes)


def test_empty_url_list_noop():
    ctrl = _ctrl(base="")
    ctrl._url_list_keys = {"urls"}
    stream = DataStream()
    stream.set("urls", [])
    ctrl._include_url_lists_in_context("ctx", stream)
    assert ctrl.adapters["zap"].includes == []


def test_create_context_hook_calls_include(monkeypatch):
    """Интеграция с post-create_context в _run_step — через прямой вызов hook-цепочки."""
    ctrl = _ctrl()
    ctrl._url_list_keys = {"pages"}
    stream = DataStream()
    stream.set("pages", ["http://app.test/#/a"])
    zap = ctrl.adapters["zap"]
    ctrl._include_url_lists_in_context("c1", stream)
    assert len(zap.includes) >= 2  # base + one url


def test_import_txt_marks_url_list_key(tmp_path: Path):
    txt = tmp_path / "pages.txt"
    txt.write_text("/#/login\n", encoding="utf-8")
    mf = tmp_path / "m.json"
    mf.write_text("{}", encoding="utf-8")
    ctrl = _ctrl()
    ctrl.wired_path = str(mf)
    ctrl.wired.test_suites.imports = [
        SuiteImport(path="pages.txt", kind="data_file")
    ]
    stream = DataStream()
    ctrl._export_suite_imports(stream)
    assert "pages" in ctrl._url_list_keys
    assert stream.get("pages") == ["http://juice-shop:3000/#/login"]
