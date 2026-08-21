# -*- coding: utf-8 -*-
"""
gRPC PoC-адаптер: список сервисов из proto_pack + unary через harness.
Хост только из URL атаки; трафик опционально через HTTP CONNECT proxy (ZAP).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from adapters.base_adapter import BaseAdapter
from core.errors import WiredError
from utils.grpc_module_runtime import (
    dumps_runtime,
    reject_absolute_host_arg,
    resolve_grpc_module,
)
from utils.grpc_ops import GrpcParseError, resolve_proto_pack, unary_call_harness

logger = logging.getLogger("orchestrator")


class GrpcAdapter(BaseAdapter):
    def __init__(self) -> None:
        super().__init__()
        self._run_manifest = None
        self._manifest_dir: Optional[str] = None
        self._proxy_url: Optional[str] = None
        self._last_services: Dict[str, Any] = {}
        self._last_unary: Dict[str, Any] = {}

    def bind_run_wired(self, wired, manifest_dir=None) -> None:
        self._run_manifest = wired
        if manifest_dir is not None:
            self._manifest_dir = str(manifest_dir)
        elif getattr(self, "_manifest_dir", None) is None:
            self._manifest_dir = None

    def set_proxy(self, proxy_url: Optional[str] = None) -> bool:
        """HTTP CONNECT proxy (как HttpAdapter) — для попадания трафика в ZAP."""
        raw = (proxy_url or "").strip()
        self._proxy_url = raw or None
        if self._proxy_url:
            logger.info("GrpcAdapter proxy=%s", self._proxy_url)
        return True

    def list_services(self, module_id: str):
        """Список сервисов gRPC по id модуля. MethodId: СписокСервисовgRPC."""
        reject_absolute_host_arg(str(module_id or ""), label="аргумент")
        resolved = resolve_grpc_module(
            self._run_manifest,
            str(module_id or ""),
            manifest_dir=self._manifest_dir,
        )
        notes = list(resolved.notes)
        if not resolved.from_module or not resolved.proto_path:
            payload = {
                "ok": False,
                "services": [],
                "notes": notes or ["нужен идентификатор модуля gRPC с proto_as"],
            }
            self._last_services = payload
            return dumps_runtime(payload)
        try:
            parsed = resolve_proto_pack(
                resolved.proto_path,
                import_paths=resolved.import_paths or None,
            )
            payload = {
                "ok": True,
                "source": parsed.get("source"),
                "files": parsed.get("files") or [],
                "services": parsed.get("services") or [],
                "notes": notes + list(parsed.get("notes") or []),
                "module_id": resolved.module_id,
                "proto_as": resolved.proto_as,
                "host": resolved.host,
                "tls": resolved.tls,
            }
        except GrpcParseError as exc:
            payload = {
                "ok": False,
                "services": [],
                "notes": notes + [str(exc)],
                "module_id": resolved.module_id,
            }
        self._last_services = payload
        return dumps_runtime(payload)

    def unary_call(self, module_id: str, method: str = "", request_json: str = "{}"):
        """
        Одиночный вызов gRPC. MethodId: ВызовgRPC.
        Аргументы: module_id, Service/Method, request_json — без host.
        """
        mid = str(module_id or "").strip()
        meth = str(method or "").strip()
        # Legacy: ВызовgRPC host method json — отклоняем до общего reject host:port
        if mid and ":" in mid and "/" not in mid:
            _, _, port = mid.rpartition(":")
            if port.isdigit():
                raise WiredError(
                    "ВызовgRPC: устаревшая форма с host отклонена; "
                    "используйте ВызовgRPC <module_id> <Service/Method> [json]"
                )
        reject_absolute_host_arg(mid, label="идентификатор модуля")
        reject_absolute_host_arg(meth, label="метод")
        resolved = resolve_grpc_module(
            self._run_manifest,
            mid,
            manifest_dir=self._manifest_dir,
        )
        notes = list(resolved.notes)
        if not resolved.from_module or not resolved.host:
            payload = {
                "ok": False,
                "skipped": True,
                "notes": notes
                or ["нужен идентификатор модуля gRPC (цель из URL атаки)"],
                "response": None,
            }
            self._last_unary = payload
            return dumps_runtime(payload)
        if not meth or "/" not in meth:
            payload = {
                "ok": False,
                "skipped": False,
                "notes": notes + ["нужен относительный метод Service/Method"],
                "response": None,
            }
            self._last_unary = payload
            return dumps_runtime(payload)
        if self._proxy_url:
            notes.append(f"proxy={self._proxy_url} (CONNECT; harness PoC может не использовать)")
        payload = unary_call_harness(
            host=resolved.host,
            method=meth,
            request_json=str(request_json if request_json is not None else "{}"),
            proto_pack=str(resolved.proto_as or ""),
        )
        payload["notes"] = notes + list(payload.get("notes") or [])
        payload["module_id"] = resolved.module_id
        payload["proto_as"] = resolved.proto_as
        payload["tls"] = resolved.tls
        if resolved.metadata:
            payload["metadata_keys"] = sorted(resolved.metadata.keys())
        self._last_unary = payload
        return dumps_runtime(payload)
