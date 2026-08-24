# -*- coding: utf-8 -*-
"""CONN-11: connector resolve + Prometheus pack query (bolvan / live mock)."""
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from adapters.connector_adapter import ConnectorAdapter
from core.method_id import lookup_method_id
from utils.connector_ops import (
    build_log_query_url,
    init_connector_payload,
    live_enabled,
    parse_endpoint_host_port,
    parse_metric_packs_csv,
    probe_after_fuzz_meta,
    probe_db_payload,
    probe_queue_payload,
    promql_for_pack,
    query_logs_payload,
    query_pack_payload,
    resolve_connector_module,
    ssh_command_allowed,
    ssh_command_payload,
)


def _slot(**fields):
    base = dict(
        connector_type="",
        metric_packs="",
        prom_url="",
        prom_lookback="15m",
        notes="",
        host="",
        port="",
        username="",
        key_ref="",
        allowlist="",
        log_source="",
        log_query="",
        log_window="",
        broker_url="",
        topic="",
        dsn="",
    )
    base.update(fields)
    return SimpleNamespace(**base)


def _Wired(prom_url="http://127.0.0.1:9090", packs="http_red,auth_fail", ctype="Prometheus"):
    return SimpleNamespace(
        test_suites=SimpleNamespace(
            test_data_constructor=[
                SimpleNamespace(
                    id="prom_slot",
                    module_type="Коннектор",
                    connector_fields=_slot(
                        connector_type=ctype,
                        metric_packs=packs,
                        prom_url=prom_url,
                        prom_lookback="5m",
                    ),
                ),
                SimpleNamespace(
                    id="ssh_slot",
                    module_type="Коннектор",
                    connector_fields=_slot(
                        connector_type="SSH",
                        host="jump.lab",
                        port="22",
                        username="kdt",
                        allowlist="uname,cat /etc/os-release",
                    ),
                ),
                SimpleNamespace(
                    id="logs_slot",
                    module_type="Коннектор",
                    connector_fields=_slot(
                        connector_type="Система логгирования",
                        host="http://127.0.0.1:9200",
                        log_source="HTTP endpoint",
                        log_query="/_search",
                        log_window="15m",
                    ),
                ),
                SimpleNamespace(
                    id="mq_slot",
                    module_type="Коннектор",
                    connector_fields=_slot(
                        connector_type="Очередь сообщений",
                        broker_url="amqp://guest:guest@127.0.0.1:5672/",
                        topic="kdt.lab",
                    ),
                ),
                SimpleNamespace(
                    id="db_slot",
                    module_type="Коннектор",
                    connector_fields=_slot(
                        connector_type="База данных",
                        dsn="postgresql://ro:secret@127.0.0.1:5432/app",
                    ),
                ),
            ]
        )
    )


def test_method_ids_wire():
    assert lookup_method_id("ИнициализироватьКоннектор") == (
        "connector",
        "init_connector",
    )
    assert lookup_method_id("ЗапроситьМетрикиКоннектора") == (
        "connector",
        "query_metric_pack",
    )
    assert lookup_method_id("ВыполнитьКомандуSSH") == (
        "connector",
        "run_ssh_command",
    )
    assert lookup_method_id("ЗапроситьЛогиКоннектора") == (
        "connector",
        "query_logs",
    )
    assert lookup_method_id("ПроверитьОчередьКоннектора") == (
        "connector",
        "probe_queue",
    )
    assert lookup_method_id("ПроверитьБазуКоннектора") == (
        "connector",
        "probe_db",
    )


def test_parse_packs_and_promql():
    assert parse_metric_packs_csv("http_red, weird, auth_fail") == [
        "http_red",
        "auth_fail",
    ]
    q = promql_for_pack("http_red", "5m")
    assert "[5m]" in q
    assert "http_requests_total" in q


def test_resolve_and_init_prometheus():
    resolved = resolve_connector_module(_Wired(), "prom_slot")
    assert resolved.from_module is True
    assert resolved.connector_type == "Prometheus"
    assert resolved.configured is True
    payload = init_connector_payload(resolved)
    assert payload["ok"] is True
    assert "http_red" in payload["metric_packs"]


def test_query_bolvan_without_flag(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_LIVE", raising=False)
    resolved = resolve_connector_module(_Wired(), "prom_slot")
    out = query_pack_payload(resolved, pack="auth_fail")
    assert out["ok"] is True
    assert out["skipped"] is False
    assert out["attempted"] is False
    assert out["pack"] == "auth_fail"
    assert any("KDT_CONNECTOR_LIVE" in n for n in out["notes"])


def test_query_live_mock(monkeypatch):
    monkeypatch.setenv("KDT_CONNECTOR_LIVE", "1")
    resolved = resolve_connector_module(_Wired(), "prom_slot")

    def _fake(url, promql, **kwargs):
        assert "9090" in url
        assert "401|403" in promql or "auth" in promql.lower() or "http_requests" in promql
        return {"ok": True, "sample_count": 2, "http_status": 200}

    out = query_pack_payload(resolved, pack="auth_fail", http_query=_fake)
    assert out["attempted"] is True
    assert out["ok"] is True
    assert out["sample_count"] == 2
    assert not any("bolvan" in n for n in out["notes"])


def test_ssh_query_honest_skip(monkeypatch):
    monkeypatch.setenv("KDT_CONNECTOR_LIVE", "1")
    resolved = resolve_connector_module(_Wired(), "ssh_slot")
    out = query_pack_payload(resolved, pack="http_red")
    assert out["skipped"] is True
    assert any("не Prometheus" in n for n in out["notes"])


def test_adapter_bind_and_json(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_LIVE", raising=False)
    ad = ConnectorAdapter()
    ad.bind_run_wired(_Wired())
    init = json.loads(ad.init_connector("prom_slot"))
    assert init["ok"] is True
    q = json.loads(ad.query_metric_pack("prom_slot", "http_red"))
    assert q["pack"] == "http_red"
    assert q["ok"] is True


def test_live_enabled(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_LIVE", raising=False)
    assert live_enabled() is False
    monkeypatch.setenv("KDT_CONNECTOR_LIVE", "1")
    assert live_enabled() is True


def test_ssh_allowlist_and_bolvan(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_SSH", raising=False)
    assert ssh_command_allowed("uname -a", "uname,cat") is True
    assert ssh_command_allowed("rm -rf /", "uname") is False
    resolved = resolve_connector_module(_Wired(), "ssh_slot")
    assert resolved.connector_type == "SSH"
    assert resolved.configured is True
    out = ssh_command_payload(resolved, command="uname -a")
    assert out["ok"] is True
    assert out["attempted"] is False
    assert any("KDT_CONNECTOR_SSH" in n for n in out["notes"])
    denied = ssh_command_payload(resolved, command="rm -rf /")
    assert denied["ok"] is False
    assert any("allowlist" in n for n in denied["notes"])


def test_ssh_live_mock(monkeypatch):
    monkeypatch.setenv("KDT_CONNECTOR_SSH", "1")
    resolved = resolve_connector_module(_Wired(), "ssh_slot")

    def _fake(res, cmd):
        assert cmd.startswith("uname")
        return 0, 12, ""

    out = ssh_command_payload(resolved, command="uname -a", runner=_fake)
    assert out["attempted"] is True
    assert out["ok"] is True
    assert out["exit_code"] == 0
    assert out["stdout_chars"] == 12


def test_probe_after_fuzz_opt_in(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_AFTER_FUZZ", raising=False)
    assert probe_after_fuzz_meta(_Wired()) == {}

    monkeypatch.setenv("KDT_CONNECTOR_AFTER_FUZZ", "1")
    monkeypatch.setenv("KDT_CONNECTOR_MODULE", "prom_slot")
    monkeypatch.delenv("KDT_CONNECTOR_LIVE", raising=False)
    meta = probe_after_fuzz_meta(_Wired())
    assert meta.get("connector_probe") is True
    assert meta.get("connector_probe_kind") == "prometheus"
    assert meta.get("connector_module_id") == "prom_slot"
    assert meta.get("connector_probe_ok") is True
    assert meta.get("connector_probe_attempted") is False


def test_probe_after_fuzz_logs(monkeypatch):
    monkeypatch.setenv("KDT_CONNECTOR_AFTER_FUZZ", "1")
    monkeypatch.setenv("KDT_CONNECTOR_MODULE", "logs_slot")
    monkeypatch.delenv("KDT_CONNECTOR_LOGS", raising=False)
    meta = probe_after_fuzz_meta(_Wired())
    assert meta.get("connector_probe") is True
    assert meta.get("connector_probe_kind") == "logs"
    assert meta.get("connector_module_id") == "logs_slot"
    assert meta.get("connector_probe_ok") is True
    assert meta.get("connector_probe_attempted") is False


def test_logs_url_and_bolvan(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_LOGS", raising=False)
    assert build_log_query_url("http://127.0.0.1:9200", "/_search").endswith("/_search")
    resolved = resolve_connector_module(_Wired(), "logs_slot")
    assert resolved.connector_type == "Система логгирования"
    assert resolved.configured is True
    out = query_logs_payload(resolved)
    assert out["ok"] is True
    assert out["attempted"] is False
    assert any("KDT_CONNECTOR_LOGS" in n for n in out["notes"])


def test_logs_live_mock(monkeypatch):
    monkeypatch.setenv("KDT_CONNECTOR_LOGS", "1")
    resolved = resolve_connector_module(_Wired(), "logs_slot")

    def _fake(url, **kwargs):
        assert "/_search" in url
        return {"ok": True, "http_status": 200, "body_chars": 42}

    out = query_logs_payload(resolved, http_query=_fake)
    assert out["attempted"] is True
    assert out["ok"] is True
    assert out["body_chars"] == 42
    assert out["http_status"] == 200


def test_logs_adapter_json(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_LOGS", raising=False)
    ad = ConnectorAdapter()
    ad.bind_run_wired(_Wired())
    payload = json.loads(ad.query_logs("logs_slot", ""))
    assert payload["ok"] is True
    assert payload["skipped"] is False


def test_parse_mq_db_endpoints():
    h, p = parse_endpoint_host_port(
        "amqp://guest:guest@127.0.0.1:5672/", default_port=5672
    )
    assert h == "127.0.0.1" and p == 5672
    h2, p2 = parse_endpoint_host_port(
        "postgresql://ro:secret@db.lab:5432/app", default_port=5432
    )
    assert h2 == "db.lab" and p2 == 5432


def test_mq_bolvan_and_live(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_MQ", raising=False)
    resolved = resolve_connector_module(_Wired(), "mq_slot")
    assert resolved.configured is True
    assert "guest" not in " ".join(resolved.notes)
    out = probe_queue_payload(resolved)
    assert out["ok"] is True
    assert out["attempted"] is False
    assert any("KDT_CONNECTOR_MQ" in n for n in out["notes"])

    monkeypatch.setenv("KDT_CONNECTOR_MQ", "1")

    def _ok(host, port, **kwargs):
        assert host == "127.0.0.1"
        assert port == 5672
        return {"ok": True, "host": host, "port": port}

    live = probe_queue_payload(resolved, tcp_probe=_ok)
    assert live["attempted"] is True
    assert live["ok"] is True


def test_db_bolvan_and_live(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_DB", raising=False)
    resolved = resolve_connector_module(_Wired(), "db_slot")
    assert resolved.configured is True
    assert "secret" not in resolved.notes[0]
    out = probe_db_payload(resolved)
    assert out["ok"] is True
    assert out["attempted"] is False
    assert "secret" not in out["dsn"]

    monkeypatch.setenv("KDT_CONNECTOR_DB", "1")

    def _ok(host, port, **kwargs):
        assert host == "127.0.0.1" and port == 5432
        return {"ok": True}

    live = probe_db_payload(resolved, tcp_probe=_ok)
    assert live["attempted"] is True and live["ok"] is True


def test_mq_db_adapter_json(monkeypatch):
    monkeypatch.delenv("KDT_CONNECTOR_MQ", raising=False)
    monkeypatch.delenv("KDT_CONNECTOR_DB", raising=False)
    ad = ConnectorAdapter()
    ad.bind_run_wired(_Wired())
    mq = json.loads(ad.probe_queue("mq_slot", "alt"))
    assert mq["topic"] == "alt"
    assert mq["ok"] is True
    db = json.loads(ad.probe_db("db_slot"))
    assert db["ok"] is True
    assert "secret" not in db["dsn"]
