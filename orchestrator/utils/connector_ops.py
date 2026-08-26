# -*- coding: utf-8 -*-
"""CONN-11…13: Prom/SSH/logs + MQ/DB TCP probe (lab)."""
from __future__ import annotations

import json
import os
import re
import shlex
import socket
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from utils.api_module_runtime import find_api_module
from utils.env_dual import pk_env, pk_env_name

CONNECTOR_MODULE_TYPE = "Коннектор"
ENV_LIVE = "PK_CONNECTOR_LIVE"
ENV_SSH = "PK_CONNECTOR_SSH"
ENV_LOGS = "PK_CONNECTOR_LOGS"
ENV_MQ = "PK_CONNECTOR_MQ"
ENV_DB = "PK_CONNECTOR_DB"
LOG_CONNECTOR_TYPE = "Система логгирования"
MQ_CONNECTOR_TYPE = "Очередь сообщений"
DB_CONNECTOR_TYPE = "База данных"

# Pack id → PromQL (lab templates; lookback подставляется).
METRIC_PACK_QUERIES: Dict[str, str] = {
    "http_red": (
        'sum(rate(http_requests_total[{lb}])) or '
        'sum(rate(http_server_requests_seconds_count[{lb}])) or vector(0)'
    ),
    "auth_fail": (
        'sum(rate(http_requests_total{status=~"401|403"}[{lb}])) or vector(0)'
    ),
    "rate_limit": (
        'sum(rate(http_requests_total{status="429"}[{lb}])) or vector(0)'
    ),
    "network_io": (
        "sum(rate(node_network_receive_bytes_total[{lb}])) or vector(0)"
    ),
    "conn_sat": (
        "sum(node_netstat_Tcp_CurrEstab) or vector(0)"
    ),
    "runtime": (
        "avg(rate(process_cpu_seconds_total[{lb}])) or "
        "avg(process_resident_memory_bytes) or vector(0)"
    ),
    "db_pool": (
        "sum(db_pool_waiting) or sum(hikaricp_connections_pending) or vector(0)"
    ),
    "queue_lag": (
        "sum(kafka_consumergroup_lag) or sum(rabbitmq_queue_messages) or vector(0)"
    ),
    "resp_size": (
        "avg(http_response_size_bytes) or vector(0)"
    ),
}

KNOWN_PACKS = frozenset(METRIC_PACK_QUERIES)


@dataclass
class ResolvedConnector:
    module_id: str = ""
    from_module: bool = False
    connector_type: str = ""
    prom_url: str = ""
    prom_lookback: str = "15m"
    metric_packs: List[str] = field(default_factory=list)
    ssh_host: str = ""
    ssh_port: str = "22"
    ssh_username: str = ""
    ssh_key_ref: str = ""
    ssh_allowlist: str = ""
    log_source: str = ""
    log_query: str = ""
    log_window: str = ""
    log_host: str = ""
    log_port: str = ""
    broker_url: str = ""
    topic: str = ""
    dsn: str = ""
    configured: bool = False
    notes: List[str] = field(default_factory=list)


def _fields_dict(mod: Any) -> Dict[str, Any]:
    raw = getattr(mod, "connector_fields", None)
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    if hasattr(raw, "model_dump"):
        return raw.model_dump()
    out: Dict[str, Any] = {}
    for key in (
        "connector_type",
        "notes",
        "metric_packs",
        "prom_url",
        "prom_lookback",
        "dsn",
        "host",
        "port",
        "username",
        "key_ref",
        "allowlist",
        "broker_url",
        "topic",
        "dsn",
        "log_source",
        "log_query",
        "log_window",
    ):
        if hasattr(raw, key):
            out[key] = getattr(raw, key)
    return out


def parse_metric_packs_csv(raw: str) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for part in (raw or "").split(","):
        pid = part.strip()
        if not pid or pid in seen:
            continue
        if pid not in KNOWN_PACKS:
            continue
        seen.add(pid)
        out.append(pid)
    return out


def _fill_connector_fields(out: ResolvedConnector, fd: Dict[str, Any]) -> List[str]:
    packs = parse_metric_packs_csv(str(fd.get("metric_packs") or ""))
    out.metric_packs = packs
    out.prom_url = str(fd.get("prom_url") or "").strip().rstrip("/")
    out.prom_lookback = (str(fd.get("prom_lookback") or "15m").strip() or "15m")
    out.ssh_host = str(fd.get("host") or "").strip()
    out.ssh_port = (str(fd.get("port") or "22").strip() or "22")
    out.ssh_username = str(fd.get("username") or "").strip()
    out.ssh_key_ref = str(fd.get("key_ref") or "").strip()
    out.ssh_allowlist = str(fd.get("allowlist") or "").strip()
    out.log_source = str(fd.get("log_source") or "").strip()
    out.log_query = str(fd.get("log_query") or "").strip()
    out.log_window = str(fd.get("log_window") or "").strip()
    out.log_host = str(fd.get("host") or "").strip()
    out.log_port = str(fd.get("port") or "").strip()
    out.broker_url = str(fd.get("broker_url") or "").strip()
    out.topic = str(fd.get("topic") or "").strip()
    out.dsn = str(fd.get("dsn") or "").strip()
    return packs


def _configure_prom_connector(out: ResolvedConnector, mid: str, packs: List[str]) -> None:
    out.configured = bool(out.prom_url)
    if not out.prom_url:
        out.notes.append(f"модуль {mid}: prom_url пуст (обнови snapshot из Admin)")
    if not packs:
        out.notes.append(f"модуль {mid}: metric_packs пуст — query выберет http_red")
    out.notes.append(
        f"модуль Коннектор: {mid} → Prometheus @ {out.prom_url or '(no url)'} "
        f"packs={','.join(packs) or '-'}"
    )


def _configure_ssh_connector(out: ResolvedConnector, mid: str) -> None:
    out.configured = bool(out.ssh_host and out.ssh_allowlist)
    if not out.ssh_host:
        out.notes.append(f"модуль {mid}: SSH host пуст")
    if not out.ssh_allowlist:
        out.notes.append(f"модуль {mid}: SSH allowlist пуст — команды запрещены")
    out.notes.append(
        f"модуль Коннектор: {mid} → SSH "
        f"{out.ssh_username or '?'}@{out.ssh_host or '?'}:{out.ssh_port}"
    )


def _configure_log_connector(out: ResolvedConnector, mid: str) -> None:
    out.configured = bool(out.log_host and out.log_query)
    if not out.log_host:
        out.notes.append(f"модуль {mid}: host/URL логов пуст")
    if not out.log_query:
        out.notes.append(f"модуль {mid}: log_query пуст")
    out.notes.append(
        f"модуль Коннектор: {mid} → logs "
        f"source={out.log_source or '-'} host={out.log_host or '?'}"
    )


def _configure_mq_connector(out: ResolvedConnector, mid: str) -> None:
    out.configured = bool(out.broker_url)
    if not out.broker_url:
        out.notes.append(f"модуль {mid}: broker_url пуст")
    out.notes.append(
        f"модуль Коннектор: {mid} → MQ "
        f"broker={_redact_url(out.broker_url) if out.broker_url else '?'} "
        f"topic={out.topic or '-'}"
    )


def _configure_db_connector(out: ResolvedConnector, mid: str) -> None:
    out.configured = bool(out.dsn)
    if not out.dsn:
        out.notes.append(f"модуль {mid}: dsn пуст")
    out.notes.append(
        f"модуль Коннектор: {mid} → DB dsn={_redact_dsn(out.dsn) if out.dsn else '?'}"
    )


def _apply_connector_type(out: ResolvedConnector, mid: str, packs: List[str]) -> None:
    ctype = out.connector_type
    handlers = {
        "Prometheus": lambda: _configure_prom_connector(out, mid, packs),
        "SSH": lambda: _configure_ssh_connector(out, mid),
        LOG_CONNECTOR_TYPE: lambda: _configure_log_connector(out, mid),
        MQ_CONNECTOR_TYPE: lambda: _configure_mq_connector(out, mid),
        DB_CONNECTOR_TYPE: lambda: _configure_db_connector(out, mid),
    }
    handler = handlers.get(ctype)
    if handler is None:
        out.configured = False
        out.notes.append(f"CONN lab: неизвестный тип {ctype!r} — init ok, probe skip")
        return
    handler()


def resolve_connector_module(wired: Any, module_id: str) -> ResolvedConnector:
    mid = (module_id or "").strip()
    out = ResolvedConnector()
    if not mid:
        out.notes.append("пустой идентификатор модуля Коннектор")
        return out
    mod = find_api_module(wired, mid, module_types=[CONNECTOR_MODULE_TYPE])
    if mod is None:
        out.notes.append(f"модуль Коннектор не найден: {mid}")
        return out
    fd = _fields_dict(mod)
    ctype = str(fd.get("connector_type") or "").strip()
    out.module_id = mid
    out.from_module = True
    out.connector_type = ctype
    if not ctype:
        out.notes.append(f"модуль {mid}: тип не активирован (connector_type пуст)")
        return out
    packs = _fill_connector_fields(out, fd)
    _apply_connector_type(out, mid, packs)
    return out


def live_enabled(env_flag: str = ENV_LIVE) -> bool:
    flag = pk_env_name(env_flag).strip().lower()
    return flag in ("1", "true", "yes", "on")


def promql_for_pack(pack: str, lookback: str = "15m") -> str:
    pid = (pack or "").strip()
    if pid not in METRIC_PACK_QUERIES:
        raise ValueError(f"unknown metric pack: {pack!r}")
    lb = (lookback or "15m").strip() or "15m"
    # lookback только [15m]-слоты; не даём инъекцию в остальной PromQL
    if not all(c.isalnum() or c in "smhd_" for c in lb):
        lb = "15m"
    return METRIC_PACK_QUERIES[pid].replace("{lb}", lb)


def _redact_url(url: str) -> str:
    """Убрать userinfo из URL для notes/meta."""
    try:
        p = urllib.parse.urlsplit(url)
        if p.username or p.password:
            host = p.hostname or ""
            if p.port:
                host = f"{host}:{p.port}"
            return urllib.parse.urlunsplit((p.scheme, host, p.path, p.query, p.fragment))
    except Exception:  # noqa: BLE001
        pass
    return url.split("@")[-1] if "@" in url else url


def query_prometheus_instant(
    base_url: str,
    promql: str,
    *,
    timeout: float = 8.0,
) -> Dict[str, Any]:
    """GET /api/v1/query — без токена в payload (auth через URL userinfo опц.)."""
    root = (base_url or "").strip().rstrip("/")
    if not root:
        raise ValueError("prom_url пуст")
    q = urllib.parse.urlencode({"query": promql})
    url = f"{root}/api/v1/query?{q}"
    req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — lab URL from Admin
        body = resp.read().decode("utf-8", errors="replace")
        status = getattr(resp, "status", 200) or 200
    data = json.loads(body) if body.strip() else {}
    result = (data.get("data") or {}).get("result") if isinstance(data, dict) else None
    samples = len(result) if isinstance(result, list) else 0
    return {
        "ok": str(data.get("status") or "").lower() == "success",
        "http_status": int(status),
        "sample_count": samples,
        "prom_status": data.get("status"),
        # не кладём raw series / values в evidence
    }


def init_connector_payload(resolved: ResolvedConnector) -> Dict[str, Any]:
    notes = list(resolved.notes)
    ok = bool(resolved.from_module and resolved.connector_type)
    if resolved.connector_type == "Prometheus" and not resolved.prom_url:
        ok = False
    return {
        "ok": ok,
        "attempted": False,
        "skipped": False,
        "module_id": resolved.module_id,
        "connector_type": resolved.connector_type,
        "prom_url": _redact_url(resolved.prom_url) if resolved.prom_url else "",
        "prom_lookback": resolved.prom_lookback,
        "metric_packs": list(resolved.metric_packs),
        "configured": resolved.configured,
        "notes": notes,
    }


def query_pack_payload(
    resolved: ResolvedConnector,
    pack: str = "",
    *,
    env_flag: str = ENV_LIVE,
    http_query=query_prometheus_instant,
) -> Dict[str, Any]:
    notes = list(resolved.notes)
    result: Dict[str, Any] = {
        "ok": False,
        "attempted": False,
        "skipped": True,
        "module_id": resolved.module_id,
        "connector_type": resolved.connector_type,
        "pack": "",
        "promql": "",
        "sample_count": 0,
        "prom_url": _redact_url(resolved.prom_url) if resolved.prom_url else "",
        "notes": notes,
    }
    if not resolved.from_module:
        return result
    if resolved.connector_type != "Prometheus":
        result["notes"] = notes + [
            f"query skip: тип {resolved.connector_type!r} не Prometheus (CONN-11)"
        ]
        result["ok"] = True  # честный skip, не фейк успеха probe
        return result
    if not resolved.prom_url:
        result["skipped"] = False
        result["notes"] = notes + ["нужен prom_url в snapshot"]
        return result

    want = (pack or "").strip()
    if not want:
        want = resolved.metric_packs[0] if resolved.metric_packs else "http_red"
    if want not in KNOWN_PACKS:
        result["skipped"] = False
        result["notes"] = notes + [f"неизвестный pack: {want!r}"]
        return result
    if resolved.metric_packs and want not in resolved.metric_packs:
        notes.append(f"pack {want!r} вне snapshot metric_packs — lab всё равно пробует")

    try:
        promql = promql_for_pack(want, resolved.prom_lookback)
    except ValueError as exc:
        result["skipped"] = False
        result["notes"] = notes + [str(exc)]
        return result

    result["pack"] = want
    result["promql"] = promql
    result["skipped"] = False

    if not live_enabled(env_flag):
        result["ok"] = True
        result["notes"] = notes + [
            f"{env_flag} не включён — query stub (bolvan); сеть не дергаем"
        ]
        return result

    result["attempted"] = True
    try:
        probe = http_query(resolved.prom_url, promql)
        result["ok"] = bool(probe.get("ok"))
        result["sample_count"] = int(probe.get("sample_count") or 0)
        result["notes"] = notes + [
            f"live prom query pack={want} samples={result['sample_count']} "
            f"url={_redact_url(resolved.prom_url)}"
        ]
    except urllib.error.HTTPError as exc:
        result["ok"] = False
        result["notes"] = notes + [f"prom HTTP {exc.code}: {_redact_url(resolved.prom_url)}"]
    except Exception as exc:  # noqa: BLE001
        result["ok"] = False
        result["notes"] = notes + [f"prom query error: {exc}"]
    return result


def parse_ssh_allowlist(raw: str) -> List[str]:
    return [p.strip() for p in (raw or "").replace("\n", ",").split(",") if p.strip()]


def ssh_command_allowed(command: str, allowlist: str) -> bool:
    """Команда должна совпасть с allowlist (точное или prefix head)."""
    cmd = (command or "").strip()
    if not cmd:
        return False
    allowed = parse_ssh_allowlist(allowlist)
    if not allowed:
        return False
    try:
        head = shlex.split(cmd, posix=os.name != "nt")[0]
    except ValueError:
        head = cmd.split()[0] if cmd.split() else ""
    for entry in allowed:
        if cmd == entry or cmd.startswith(entry + " ") or head == entry:
            return True
    return False


def ssh_command_payload(
    resolved: ResolvedConnector,
    command: str = "",
    *,
    env_flag: str = ENV_SSH,
    runner=None,
) -> Dict[str, Any]:
    """CONN-12: SSH allowlist command; live при PK_CONNECTOR_SSH=1 (BatchMode ssh)."""
    notes = list(resolved.notes)
    result: Dict[str, Any] = {
        "ok": False,
        "attempted": False,
        "skipped": True,
        "module_id": resolved.module_id,
        "connector_type": resolved.connector_type,
        "command": "",
        "exit_code": None,
        "stdout_chars": 0,
        "host": resolved.ssh_host,
        "notes": notes,
    }
    if not resolved.from_module:
        return result
    if resolved.connector_type != "SSH":
        result["ok"] = True
        result["notes"] = notes + [
            f"ssh skip: тип {resolved.connector_type!r} не SSH (CONN-12)"
        ]
        return result
    cmd = (command or "").strip()
    result["command"] = cmd
    result["skipped"] = False
    if not cmd:
        result["notes"] = notes + ["пустая команда"]
        return result
    if not resolved.ssh_host:
        result["notes"] = notes + ["нужен host в snapshot SSH"]
        return result
    if not ssh_command_allowed(cmd, resolved.ssh_allowlist):
        result["notes"] = notes + [
            f"команда вне allowlist: {cmd!r} "
            f"(allow={resolved.ssh_allowlist!r})"
        ]
        return result

    if not live_enabled(env_flag):
        result["ok"] = True
        result["notes"] = notes + [
            f"{env_flag} не включён — ssh stub (bolvan); сеть не дергаем; "
            f"allowlist ok for {cmd!r}"
        ]
        return result

    result["attempted"] = True
    run = runner or _run_ssh_subprocess
    try:
        rc, out_len, err_note = run(resolved, cmd)
        result["exit_code"] = rc
        result["stdout_chars"] = out_len
        result["ok"] = rc == 0
        result["notes"] = notes + [
            f"live ssh rc={rc} stdout_chars={out_len} "
            f"host={resolved.ssh_username}@{resolved.ssh_host}:{resolved.ssh_port}"
        ]
        if err_note:
            result["notes"].append(err_note)
    except Exception as exc:  # noqa: BLE001
        result["ok"] = False
        result["notes"] = notes + [f"ssh error: {exc}"]
    return result


def _run_ssh_subprocess(
    resolved: ResolvedConnector, command: str
) -> Tuple[int, int, str]:
    """OpenSSH client; ключ из key_ref если файл. Без пароля в argv."""
    user_host = resolved.ssh_host
    if resolved.ssh_username:
        user_host = f"{resolved.ssh_username}@{resolved.ssh_host}"
    argv = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-p",
        str(resolved.ssh_port or "22"),
    ]
    key = (resolved.ssh_key_ref or "").strip()
    if key and Path(key).expanduser().is_file():
        argv.extend(["-i", str(Path(key).expanduser())])
    argv.extend([user_host, command])
    proc = subprocess.run(
        argv,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    # не возвращаем тело — только длина (секреты/артефакты)
    note = ""
    if proc.returncode != 0 and not out:
        note = "ssh: empty output, non-zero rc"
    return int(proc.returncode), len(out), note


def build_log_query_url(
    host: str,
    log_query: str,
    *,
    port: str = "",
) -> str:
    """Собрать URL для thin HTTP GET (lab SIEM/logs). Не кладём секреты."""
    q = (log_query or "").strip()
    if q.lower().startswith(("http://", "https://")):
        return q
    base = (host or "").strip().rstrip("/")
    if not base:
        raise ValueError("host/URL логов пуст")
    if not base.lower().startswith(("http://", "https://")):
        base = f"http://{base}"
    parsed = urllib.parse.urlsplit(base)
    netloc = parsed.netloc
    if port and ":" not in netloc:
        netloc = f"{netloc}:{port.strip()}"
        base = urllib.parse.urlunsplit(
            (parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment)
        ).rstrip("/")
    if not q:
        return base
    if q.startswith("/"):
        return f"{base}{q}"
    if q.startswith("?"):
        return f"{base}{q}"
    return f"{base}?q={urllib.parse.quote(q, safe='')}"


def query_logs_http(
    url: str,
    *,
    timeout: float = 8.0,
    token: str = "",
) -> Dict[str, Any]:
    """GET log endpoint — в evidence только статус и длина тела, не raw logs."""
    target = (url or "").strip()
    if not target:
        raise ValueError("log url пуст")
    headers = {"Accept": "application/json, text/plain, */*"}
    tok = (token or "").strip()
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    req = urllib.request.Request(target, method="GET", headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — lab URL
        body = resp.read()
        status = getattr(resp, "status", 200) or 200
    return {
        "ok": 200 <= int(status) < 400,
        "http_status": int(status),
        "body_chars": len(body),
    }


def query_logs_payload(
    resolved: ResolvedConnector,
    query: str = "",
    *,
    env_flag: str = ENV_LOGS,
    http_query=query_logs_http,
) -> Dict[str, Any]:
    """CONN logs/SIEM: thin HTTP GET; live при PK_CONNECTOR_LOGS=1."""
    notes = list(resolved.notes)
    result: Dict[str, Any] = {
        "ok": False,
        "attempted": False,
        "skipped": True,
        "module_id": resolved.module_id,
        "connector_type": resolved.connector_type,
        "log_source": resolved.log_source,
        "query": "",
        "url": "",
        "http_status": None,
        "body_chars": 0,
        "notes": notes,
    }
    if not resolved.from_module:
        return result
    if resolved.connector_type != LOG_CONNECTOR_TYPE:
        result["ok"] = True
        result["notes"] = notes + [
            f"logs skip: тип {resolved.connector_type!r} не {LOG_CONNECTOR_TYPE}"
        ]
        return result

    q = (query or "").strip() or resolved.log_query
    result["query"] = q
    result["skipped"] = False
    if not resolved.log_host:
        result["notes"] = notes + ["нужен host/URL в snapshot логов"]
        return result
    if not q:
        result["notes"] = notes + ["нужен log_query / аргумент query"]
        return result

    try:
        url = build_log_query_url(resolved.log_host, q, port=resolved.log_port)
    except ValueError as exc:
        result["notes"] = notes + [str(exc)]
        return result
    result["url"] = _redact_url(url)

    if not live_enabled(env_flag):
        result["ok"] = True
        result["notes"] = notes + [
            f"{env_flag} не включён — logs stub (bolvan); сеть не дергаем; "
            f"url={result['url']}"
        ]
        return result

    result["attempted"] = True
    token = (pk_env("CONNECTOR_LOG_TOKEN") or "").strip()
    try:
        probe = http_query(url, token=token)
        result["ok"] = bool(probe.get("ok"))
        result["http_status"] = probe.get("http_status")
        result["body_chars"] = int(probe.get("body_chars") or 0)
        result["notes"] = notes + [
            f"live logs GET status={result['http_status']} "
            f"chars={result['body_chars']} url={result['url']}"
        ]
    except urllib.error.HTTPError as exc:
        result["ok"] = False
        result["http_status"] = int(exc.code)
        result["notes"] = notes + [f"logs HTTP {exc.code}: {result['url']}"]
    except Exception as exc:  # noqa: BLE001
        result["ok"] = False
        result["notes"] = notes + [f"logs query error: {exc}"]
    return result


def _redact_dsn(dsn: str) -> str:
    """Спрятать пароль в DSN / URL для notes."""
    raw = (dsn or "").strip()
    if not raw:
        return ""
    if "://" in raw:
        return _redact_url(raw)
    # user:pass@host:port/db
    if "@" in raw:
        return "***@" + raw.split("@", 1)[-1]
    return raw


_SCHEME_DEFAULT_PORTS = {
    "postgres": 5432,
    "postgresql": 5432,
    "mysql": 3306,
    "mariadb": 3306,
    "amqp": 5672,
    "amqps": 5671,
    "redis": 6379,
    "rediss": 6379,
    "kafka": 9092,
    "https": 443,
    "http": 80,
}


def _host_port_from_url(text: str, default_port: int) -> Tuple[str, int]:
    p = urllib.parse.urlsplit(text)
    host = p.hostname or ""
    if p.port:
        return host, int(p.port)
    scheme = (p.scheme or "").lower()
    return host, int(_SCHEME_DEFAULT_PORTS.get(scheme, default_port))


def _host_port_from_plain(text: str, default_port: int) -> Tuple[str, int]:
    m = re.search(r"(?:host|server)\s*=\s*([^\s;]+)", text, re.I)
    if m:
        host = m.group(1).strip()
        pm = re.search(r"port\s*=\s*(\d+)", text, re.I)
        port = int(pm.group(1)) if pm else default_port
        return host, port
    if "@" in text:
        after = text.split("@", 1)[-1]
        hostport = after.split("/", 1)[0]
        if ":" in hostport:
            host, port_s = hostport.rsplit(":", 1)
            return host, int(port_s)
        return hostport, default_port
    if ":" in text and text.count(":") == 1:
        host, port_s = text.split(":", 1)
        return host, int(port_s)
    return text.split("/", 1)[0], default_port


def parse_endpoint_host_port(
    raw: str,
    *,
    default_port: int,
) -> Tuple[str, int]:
    """Host/port from broker URL, DSN URL, or host:port — без секретов в return."""
    text = (raw or "").strip()
    if not text:
        raise ValueError("endpoint пуст")
    if "://" in text:
        host, port = _host_port_from_url(text, default_port)
    else:
        host, port = _host_port_from_plain(text, default_port)
    host = (host or "").strip().strip("[]")
    if not host:
        raise ValueError(f"не разобрать host из {_redact_dsn(text)!r}")
    return host, int(port)


def probe_tcp_endpoint(
    host: str,
    port: int,
    *,
    timeout: float = 5.0,
) -> Dict[str, Any]:
    """TCP connect only — без протокола MQ/SQL (честный reachability probe)."""
    with socket.create_connection((host, int(port)), timeout=timeout):
        pass
    return {"ok": True, "host": host, "port": int(port)}


def probe_queue_payload(
    resolved: ResolvedConnector,
    topic: str = "",
    *,
    env_flag: str = ENV_MQ,
    tcp_probe=probe_tcp_endpoint,
) -> Dict[str, Any]:
    """CONN-13: MQ broker TCP probe; live при PK_CONNECTOR_MQ=1."""
    notes = list(resolved.notes)
    result: Dict[str, Any] = {
        "ok": False,
        "attempted": False,
        "skipped": True,
        "module_id": resolved.module_id,
        "connector_type": resolved.connector_type,
        "broker_url": _redact_url(resolved.broker_url) if resolved.broker_url else "",
        "topic": (topic or "").strip() or resolved.topic,
        "host": "",
        "port": None,
        "notes": notes,
    }
    if not resolved.from_module:
        return result
    if resolved.connector_type != MQ_CONNECTOR_TYPE:
        result["ok"] = True
        result["notes"] = notes + [
            f"mq skip: тип {resolved.connector_type!r} не {MQ_CONNECTOR_TYPE}"
        ]
        return result
    result["skipped"] = False
    if not resolved.broker_url:
        result["notes"] = notes + ["нужен broker_url в snapshot очереди"]
        return result
    try:
        host, port = parse_endpoint_host_port(resolved.broker_url, default_port=5672)
    except ValueError as exc:
        result["notes"] = notes + [str(exc)]
        return result
    result["host"] = host
    result["port"] = port

    if not live_enabled(env_flag):
        result["ok"] = True
        result["notes"] = notes + [
            f"{env_flag} не включён — mq stub (bolvan); TCP не дергаем; "
            f"broker={result['broker_url']} topic={result['topic'] or '-'} "
            f"→ {host}:{port}"
        ]
        return result

    result["attempted"] = True
    try:
        tcp_probe(host, port)
        result["ok"] = True
        result["notes"] = notes + [
            f"live mq TCP ok {host}:{port} topic={result['topic'] or '-'} "
            f"(без publish/consume)"
        ]
    except Exception as exc:  # noqa: BLE001
        result["ok"] = False
        result["notes"] = notes + [f"mq TCP fail {host}:{port}: {exc}"]
    return result


def probe_db_payload(
    resolved: ResolvedConnector,
    *,
    env_flag: str = ENV_DB,
    tcp_probe=probe_tcp_endpoint,
) -> Dict[str, Any]:
    """CONN-13: DB DSN TCP probe (RO reachability); live при PK_CONNECTOR_DB=1."""
    notes = list(resolved.notes)
    result: Dict[str, Any] = {
        "ok": False,
        "attempted": False,
        "skipped": True,
        "module_id": resolved.module_id,
        "connector_type": resolved.connector_type,
        "dsn": _redact_dsn(resolved.dsn) if resolved.dsn else "",
        "host": "",
        "port": None,
        "notes": notes,
    }
    if not resolved.from_module:
        return result
    if resolved.connector_type != DB_CONNECTOR_TYPE:
        result["ok"] = True
        result["notes"] = notes + [
            f"db skip: тип {resolved.connector_type!r} не {DB_CONNECTOR_TYPE}"
        ]
        return result
    result["skipped"] = False
    if not resolved.dsn:
        result["notes"] = notes + ["нужен dsn в snapshot БД"]
        return result
    try:
        host, port = parse_endpoint_host_port(resolved.dsn, default_port=5432)
    except ValueError as exc:
        result["notes"] = notes + [str(exc)]
        return result
    result["host"] = host
    result["port"] = port

    if not live_enabled(env_flag):
        result["ok"] = True
        result["notes"] = notes + [
            f"{env_flag} не включён — db stub (bolvan); TCP не дергаем; "
            f"dsn={result['dsn']} → {host}:{port}"
        ]
        return result

    result["attempted"] = True
    try:
        tcp_probe(host, port)
        result["ok"] = True
        result["notes"] = notes + [
            f"live db TCP ok {host}:{port} (без SQL; RO DSN с вас)"
        ]
    except Exception as exc:  # noqa: BLE001
        result["ok"] = False
        result["notes"] = notes + [f"db TCP fail {host}:{port}: {exc}"]
    return result


def dumps_connector(payload: Mapping[str, Any]) -> str:
    return json.dumps(dict(payload), ensure_ascii=False)


def _probe_meta_base(mid: str, kind: str, out: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "connector_probe": True,
        "connector_probe_kind": kind,
        "connector_module_id": out.get("module_id") or mid,
        "connector_probe_ok": bool(out.get("ok")),
        "connector_probe_attempted": bool(out.get("attempted")),
        "connector_probe_notes": list(out.get("notes") or [])[:8],
    }


def probe_after_fuzz_meta(
    wired: Any,
    *,
    module_id: str = "",
    pack: str = "",
    query: str = "",
    env_module: str = "PK_CONNECTOR_MODULE",
    env_enable: str = "PK_CONNECTOR_AFTER_FUZZ",
) -> Dict[str, Any]:
    """
    Thin hook после fuzz wave: opt-in probe по типу слота → meta без секретов.
    Prometheus → pack query; Система логгирования → logs GET.
    Нужны PK_CONNECTOR_AFTER_FUZZ=1 и module id (арг или PK_CONNECTOR_MODULE).
    """
    if not live_enabled(env_enable):
        return {}
    mid = (module_id or "").strip() or pk_env_name(env_module).strip()
    if not mid:
        return {
            "connector_probe": False,
            "connector_probe_notes": [f"{env_enable}=1 но нет module_id / {env_module}"],
        }
    resolved = resolve_connector_module(wired, mid)
    ctype = (resolved.connector_type or "").strip()
    if ctype == LOG_CONNECTOR_TYPE:
        out = query_logs_payload(resolved, query=query)
        meta = _probe_meta_base(mid, "logs", out)
        meta["connector_log_source"] = out.get("log_source") or ""
        meta["connector_http_status"] = out.get("http_status")
        meta["connector_body_chars"] = int(out.get("body_chars") or 0)
        return meta
    if ctype == "Prometheus":
        out = query_pack_payload(resolved, pack=pack)
        meta = _probe_meta_base(mid, "prometheus", out)
        meta["connector_pack"] = out.get("pack") or ""
        meta["connector_sample_count"] = int(out.get("sample_count") or 0)
        return meta
    if ctype == MQ_CONNECTOR_TYPE:
        out = probe_queue_payload(resolved)
        meta = _probe_meta_base(mid, "mq", out)
        meta["connector_topic"] = out.get("topic") or ""
        return meta
    if ctype == DB_CONNECTOR_TYPE:
        out = probe_db_payload(resolved)
        return _probe_meta_base(mid, "db", out)
    return {
        "connector_probe": True,
        "connector_probe_kind": ctype or "unknown",
        "connector_module_id": mid,
        "connector_probe_ok": True,
        "connector_probe_attempted": False,
        "connector_probe_notes": [
            f"after-fuzz skip: тип {ctype!r} — нет thin probe"
        ],
    }
