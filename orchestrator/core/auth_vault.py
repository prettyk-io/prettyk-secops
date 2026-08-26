# -*- coding: utf-8 -*-
"""AUTH-1 & AUTH-2: Auth-Chain Vault (мульти-профильная авторизация и цепочки токенов).

Функционал:
  1. ``AuthProfile`` — декларативная конфигурация профиля аутентификации (pre-flight endpoint,
     credentials, extraction mapping).
  2. ``AuthChainVault`` — выполнение pre-flight запроса, извлечение динамических токенов (JSON path / headers / cookies),
     сохранение в контекст сессии ({{auth.token}}, {{auth.cookie}}), и инъекция в ZAP/HttpAdapter.
  3. ``extract_value_by_path()`` — надежное извлечение вложенных ключей ("data.token", "response.jwt").
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urljoin

logger = logging.getLogger("orchestrator.auth_vault")


@dataclass
class AuthExtractRule:
    """Правило извлечения токена из ответа."""

    target_var: str  # Имя переменной, например "auth.token" или "auth.access_token"
    source: str = "body_json"  # "body_json", "header", "cookie", "body_raw"
    path: str = ""  # Например "access_token", "data.jwt", "Set-Cookie"
    regex: Optional[str] = None  # Опциональный Regex для извлечения


@dataclass
class AuthProfile:
    """Профиль pre-flight аутентификации."""

    name: str = "default"
    auth_type: str = "bearer"  # "bearer", "cookie", "api_key", "custom"
    login_url: str = ""
    method: str = "POST"
    headers: Dict[str, str] = field(default_factory=dict)
    body: Union[str, Dict[str, Any]] = field(default_factory=dict)
    extract_rules: List[AuthExtractRule] = field(default_factory=list)


def extract_value_by_path(data: Any, path: str) -> Any:
    """Извлечение вложенного поля по точечному пути (data.access_token)."""
    if not path or not data:
        return data
    parts = path.strip(".").split(".")
    curr = data
    for p in parts:
        if isinstance(curr, dict) and p in curr:
            curr = curr[p]
        elif isinstance(curr, list) and p.isdigit():
            idx = int(p)
            if 0 <= idx < len(curr):
                curr = curr[idx]
            else:
                return None
        else:
            return None
    return curr


class AuthChainVault:
    """Хранилище контекста сессии и исполнитель pre-flight авторизации."""

    def __init__(self) -> None:
        self.session_context: Dict[str, Any] = {}

    def set_token(self, key: str, value: Any) -> None:
        clean_key = key.strip("{}").replace("auth.", "")
        self.session_context[clean_key] = value
        self.session_context[f"auth.{clean_key}"] = value

    def get_token(self, key: str) -> Optional[Any]:
        clean_key = key.strip("{}").replace("auth.", "")
        return self.session_context.get(clean_key) or self.session_context.get(f"auth.{clean_key}")

    def execute_preflight(
        self,
        profile: AuthProfile,
        base_url: str = "",
        http_client: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Выполняет pre-flight запрос авторизации и сохраняет извлеченные токены."""
        url = profile.login_url
        if base_url and not url.startswith(("http://", "https://")):
            url = urljoin(base_url.rstrip("/") + "/", url.lstrip("/"))

        body_str: Optional[str] = None
        headers = dict(profile.headers)
        if isinstance(profile.body, dict):
            if "content-type" not in {k.lower(): v for k, v in headers.items()}:
                headers["Content-Type"] = "application/json"
            body_str = json.dumps(profile.body)
        elif isinstance(profile.body, str):
            body_str = profile.body

        response_status = 200
        response_headers: Dict[str, str] = {}
        response_body = ""

        # Если передан кастомный http_client (или mock)
        if http_client is not None:
            res = http_client(url=url, method=profile.method, headers=headers, body=body_str)
            response_status = getattr(res, "status_code", 200)
            response_headers = dict(getattr(res, "headers", {}))
            response_body = getattr(res, "text", "") or getattr(res, "body", "")
        else:
            try:
                import urllib.request

                req = urllib.request.Request(
                    url,
                    data=body_str.encode("utf-8") if body_str else None,
                    headers=headers,
                    method=profile.method.upper(),
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    response_status = resp.status
                    response_headers = {k: v for k, v in resp.headers.items()}
                    response_body = resp.read().decode("utf-8", errors="replace")
            except Exception as exc:
                logger.error("Preflight auth failed for %s: %s", url, exc)
                return {
                    "success": False,
                    "error": str(exc),
                    "tokens": {},
                }

        extracted_tokens: Dict[str, Any] = {}

        # Парсим тело JSON при необходимости
        json_data = None
        try:
            json_data = json.loads(response_body)
        except Exception:
            json_data = None

        for rule in profile.extract_rules:
            val = None
            if rule.source == "body_json" and json_data is not None:
                val = extract_value_by_path(json_data, rule.path)
            elif rule.source == "header":
                for hk, hv in response_headers.items():
                    if hk.lower() == rule.path.lower():
                        val = hv
                        break
            elif rule.source == "cookie":
                set_cookie = response_headers.get("set-cookie") or response_headers.get("Set-Cookie") or ""
                if rule.path:
                    m = re.search(rf"{re.escape(rule.path)}=([^;]+)", set_cookie)
                    if m:
                        val = m.group(1)
                else:
                    val = set_cookie
            elif rule.source == "body_raw":
                val = response_body

            if val is not None and rule.regex:
                m = re.search(rule.regex, str(val))
                if m:
                    val = m.group(1) if m.groups() else m.group(0)

            if val is not None:
                self.set_token(rule.target_var, val)
                extracted_tokens[rule.target_var] = val

        return {
            "success": response_status < 400,
            "status": response_status,
            "tokens": extracted_tokens,
        }

    def inject_into_zap(
        self,
        zap_adapter: Any,
        context_name: str = "pk_ctx",
        token_var: str = "auth.token",
        auth_type: str = "bearer",
        header_name: str = "Authorization",
    ) -> bool:
        """AUTH-2: Проброс динамического токена/куки в ZAP Replacer / Context."""
        val = self.get_token(token_var)
        if not val:
            logger.warning("No token found in vault for %s, skipping ZAP injection", token_var)
            return False

        try:
            if auth_type.lower() == "bearer":
                zap_adapter.add_replacer_rule(
                    "pk-vault-bearer",
                    "REQ_HEADER",
                    "Authorization",
                    f"Bearer {val}",
                    False,
                )
            elif auth_type.lower() == "cookie":
                zap_adapter.add_replacer_rule(
                    "pk-vault-cookie",
                    "REQ_HEADER",
                    "Cookie",
                    str(val),
                    False,
                )
            else:
                zap_adapter.add_replacer_rule(
                    f"pk-vault-{header_name.lower()}",
                    "REQ_HEADER",
                    header_name,
                    str(val),
                    False,
                )
            logger.info("Injected vault token %s (%s) into ZAP Replacer", token_var, auth_type)
            return True
        except Exception as exc:
            logger.error("Failed to inject vault token into ZAP: %s", exc)
            return False
