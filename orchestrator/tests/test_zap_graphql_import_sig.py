# -*- coding: utf-8 -*-
"""UD-A: ZAP GraphQL import uses (endurl, file|url) — not bare import_file(path)."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock


def test_import_graphql_file_uses_endurl_and_file(monkeypatch):
    from adapters.zap_adapter import ZapAdapter

    zap = object.__new__(ZapAdapter)
    zap._run_wired = SimpleNamespace(
        scan_base_url=lambda: "http://host.docker.internal:8090"
    )
    zap._last_graphql_import = None
    zap._last_graphql_ops = None

    gql = MagicMock()
    gql.import_url = MagicMock()
    gql.import_file = MagicMock(side_effect=RuntimeError("no host file in container"))

    fake_zap = SimpleMockZap(gql)
    zap._zap = fake_zap
    zap._ensure_connected = lambda: True
    zap._probe_zap_addon = lambda names: {"available": True, "notes": []}

    resolved = SimpleNamespace(
        schema=r"C:\lab\mini.sdl",
        endpoint="http://host.docker.internal:8090/graphql",
        from_module=True,
        zap_import=True,
        module_id="bank_graphql",
        notes=[],
    )
    monkeypatch.setattr(
        "utils.api_module_runtime.resolve_graphql_arg",
        lambda *a, **k: resolved,
    )
    monkeypatch.setattr(
        "utils.api_module_runtime.allow_zap_import",
        lambda **k: (True, []),
    )
    monkeypatch.setattr("utils.api_import_lab.api_lab_dry", lambda: False)
    zap.list_graphql_operations = lambda *_a, **_k: [{"op": "health"}]

    assert zap.import_graphql_schema("bank_graphql") is True
    gql.import_file.assert_called_once_with(
        "http://host.docker.internal:8090/graphql", r"C:\lab\mini.sdl"
    )
    gql.import_url.assert_called_once_with(
        "http://host.docker.internal:8090/graphql",
        url="http://host.docker.internal:8090/graphql",
    )


class SimpleMockZap:
    def __init__(self, graphql):
        self.graphql = graphql
