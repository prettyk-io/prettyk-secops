# -*- coding: utf-8 -*-
"""CONN-11…13: MethodId init + Prom/SSH/logs + MQ/DB TCP probe (lab)."""
from __future__ import annotations

import logging

from adapters.base_adapter import BaseAdapter
from utils.connector_ops import (
    dumps_connector,
    init_connector_payload,
    probe_db_payload,
    probe_queue_payload,
    query_logs_payload,
    query_pack_payload,
    resolve_connector_module,
    ssh_command_payload,
)

logger = logging.getLogger("orchestrator")


class ConnectorAdapter(BaseAdapter):
    def __init__(self) -> None:
        super().__init__()
        self._run_wired = None
        self._last_init: dict = {}
        self._last_query: dict = {}
        self._last_ssh: dict = {}
        self._last_logs: dict = {}
        self._last_mq: dict = {}
        self._last_db: dict = {}

    def bind_run_wired(self, wired, wired_dir=None) -> None:
        self._run_wired = wired
        _ = wired_dir

    def init_connector(self, module_id: str) -> str:
        """ИнициализироватьКоннектор — проверить snapshot слота."""
        resolved = resolve_connector_module(self._run_wired, str(module_id or ""))
        payload = init_connector_payload(resolved)
        self._last_init = payload
        logger.info(
            "init_connector module=%s type=%s ok=%s",
            payload.get("module_id"),
            payload.get("connector_type"),
            payload.get("ok"),
        )
        return dumps_connector(payload)

    def query_metric_pack(self, module_id: str, pack: str = "") -> str:
        """ЗапроситьМетрикиКоннектора — PromQL pack (live при PK_CONNECTOR_LIVE=1)."""
        resolved = resolve_connector_module(self._run_wired, str(module_id or ""))
        payload = query_pack_payload(resolved, pack=str(pack or ""))
        self._last_query = payload
        logger.info(
            "query_metric_pack module=%s pack=%s ok=%s attempted=%s",
            payload.get("module_id"),
            payload.get("pack"),
            payload.get("ok"),
            payload.get("attempted"),
        )
        return dumps_connector(payload)

    def run_ssh_command(self, module_id: str, command: str = "") -> str:
        """ВыполнитьКомандуSSH — allowlist; live при PK_CONNECTOR_SSH=1."""
        resolved = resolve_connector_module(self._run_wired, str(module_id or ""))
        payload = ssh_command_payload(resolved, command=str(command or ""))
        self._last_ssh = payload
        logger.info(
            "run_ssh_command module=%s ok=%s attempted=%s cmd=%s",
            payload.get("module_id"),
            payload.get("ok"),
            payload.get("attempted"),
            payload.get("command"),
        )
        return dumps_connector(payload)

    def query_logs(self, module_id: str, query: str = "") -> str:
        """ЗапроситьЛогиКоннектора — thin HTTP GET; live при PK_CONNECTOR_LOGS=1."""
        resolved = resolve_connector_module(self._run_wired, str(module_id or ""))
        payload = query_logs_payload(resolved, query=str(query or ""))
        self._last_logs = payload
        logger.info(
            "query_logs module=%s ok=%s attempted=%s status=%s",
            payload.get("module_id"),
            payload.get("ok"),
            payload.get("attempted"),
            payload.get("http_status"),
        )
        return dumps_connector(payload)

    def probe_queue(self, module_id: str, topic: str = "") -> str:
        """ПроверитьОчередьКоннектора — TCP к broker; live при PK_CONNECTOR_MQ=1."""
        resolved = resolve_connector_module(self._run_wired, str(module_id or ""))
        payload = probe_queue_payload(resolved, topic=str(topic or ""))
        self._last_mq = payload
        logger.info(
            "probe_queue module=%s ok=%s attempted=%s host=%s:%s",
            payload.get("module_id"),
            payload.get("ok"),
            payload.get("attempted"),
            payload.get("host"),
            payload.get("port"),
        )
        return dumps_connector(payload)

    def probe_db(self, module_id: str) -> str:
        """ПроверитьБазуКоннектора — TCP к DSN host; live при PK_CONNECTOR_DB=1."""
        resolved = resolve_connector_module(self._run_wired, str(module_id or ""))
        payload = probe_db_payload(resolved)
        self._last_db = payload
        logger.info(
            "probe_db module=%s ok=%s attempted=%s host=%s:%s",
            payload.get("module_id"),
            payload.get("ok"),
            payload.get("attempted"),
            payload.get("host"),
            payload.get("port"),
        )
        return dumps_connector(payload)
