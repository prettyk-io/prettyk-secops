# -*- coding: utf-8 -*-
"""CF-B1/B2/B3: ProductionCorpusFuzzer — полноценный фаззинг-цикл.

Получает CorpusSeed от краулера → для каждого EndpointSpec × FuzzParam × payload:
  1. HTTP-запрос (urllib — без внешних зависимостей)
  2. Детекция: status, body, timing, error-signature
  3. Dedup + FindingPipeline
  4. Прогресс: fuzzing.started → in_progress (N%) → completed
"""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from fuzzer.finding_pipeline import FindingPipeline
from fuzzer.models import (
    EndpointSpec,
    FindingRecord,
    FuzzParam,
    FuzzerProfile,
    ParamType,
    Severity,
)
from fuzzer.payload_generator import PayloadGenerator
from fuzzer.detectors import detect_all
from fuzzer.profiles import (
    DEVELOPER_SAFE,
    FULL_ACTIVE,
    INTRUSIVE_FUZZ,
    requires_destructive_flag,
)

logger = logging.getLogger("orchestrator.fuzzer")


class ProductionCorpusFuzzer:
    """CF-B1: Production-фаззер с полным циклом: HTTP → detect → dedup → pipeline."""

    _DEFAULT_TIMEOUT = 10
    _DEFAULT_MAX_PER_PARAM = 15

    def __init__(
        self,
        profile: str = DEVELOPER_SAFE,
        allow_destructive: bool = False,
        timeout: float = _DEFAULT_TIMEOUT,
        max_payloads_per_param: int = _DEFAULT_MAX_PER_PARAM,
        publish_sse: bool = True,
    ):
        if requires_destructive_flag(profile) and not allow_destructive:
            raise ValueError(
                f"Profile '{profile}' requires allow_destructive=True"
            )

        self.profile = profile
        self.allow_destructive = allow_destructive
        self.timeout = timeout
        self.max_payloads_per_param = max_payloads_per_param

        self._generator = PayloadGenerator(profile=profile, allow_destructive=allow_destructive)
        self._pipeline = FindingPipeline(publish_sse=publish_sse)

        self._total_endpoints = 0
        self._completed_endpoints = 0
        self._total_requests = 0
        self._started_at: Optional[float] = None

    # ── Публичный API ──

    def run(
        self,
        endpoints: List[EndpointSpec],
        *,
        on_progress: Optional[callable] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """CF-B3: основной цикл фаззинга.

        Args:
            endpoints: список EndpointSpec от краулера
            on_progress: callback(status: str, completed: int, total: int)
            extra_headers: дополнительные HTTP-заголовки

        Returns:
            Сводка: {total_requests, endpoints, findings, by_severity, duration}
        """
        if not endpoints:
            return self._empty_result()

        self._started_at = time.time()
        self._total_endpoints = len(endpoints)
        self._completed_endpoints = 0
        self._total_requests = 0

        self._publish_progress("fuzzing.started", 0, on_progress)

        for endpoint in endpoints:
            self._fuzz_endpoint(endpoint, extra_headers or {})
            self._completed_endpoints += 1
            self._publish_progress("fuzzing.in_progress", self._completed_endpoints, on_progress)

        self._publish_progress("fuzzing.completed", self._completed_endpoints, on_progress)

        return self._build_result()

    def run_from_crawler_result(
        self,
        crawler_result: Any,  # CrawlerRunResult
        *,
        on_progress: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """CF-B3: фаззинг из CrawlerRunResult.

        Конвертит fuzzable_endpoints → EndpointSpec[], запускает цикл.
        """
        fuzzable = crawler_result.fuzzable_endpoints()
        endpoints: List[EndpointSpec] = []
        for ep in fuzzable:
            if not ep.endpoint_url:
                continue
            spec = _awakened_to_endpoint_spec(ep)
            endpoints.append(spec)
        return self.run(endpoints, on_progress=on_progress)

    # ── Внутренний цикл ──

    def _fuzz_endpoint(self, endpoint: EndpointSpec, extra_headers: Dict[str, str]) -> None:
        """Фаззинг одного эндпоинта: param × payload → request → detect."""
        for param in endpoint.params:
            param_count = 0
            for fuzz_param, payload in self._generator.iter_payloads(
                param, max_per_param=self.max_payloads_per_param
            ):
                param_count += 1
                self._total_requests += 1

                try:
                    status, body, headers, req_info, elapsed = self._send_request(
                        endpoint, fuzz_param, payload, extra_headers
                    )

                    findings = detect_all(
                        endpoint, fuzz_param, payload,
                        body, status, headers, req_info, elapsed,
                    )

                    for finding in findings:
                        if not self._pipeline.is_duplicate(finding):
                            self._pipeline.record(finding)

                except Exception as exc:
                    logger.debug("Fuzzer request failed for %s param=%s: %s",
                                 endpoint.url, fuzz_param.name, exc)

    def _send_request(
        self,
        endpoint: EndpointSpec,
        param: FuzzParam,
        payload: str,
        extra_headers: Dict[str, str],
    ) -> Tuple[int, str, Dict[str, str], Dict[str, Any], float]:
        """HTTP-запрос с подстановкой payload. Возвращает status, body, headers, request_info, elapsed."""
        # Строим URL с подставленным payload
        url = self._inject_payload_into_url(endpoint, param, payload)

        # Body
        body_data: Optional[bytes] = None
        if endpoint.method.upper() in ("POST", "PUT", "PATCH"):
            body_data = self._build_body(endpoint, param, payload)

        # Headers
        req_headers = dict(endpoint.headers)
        req_headers.update(endpoint.auth_headers)
        req_headers.update(extra_headers)
        if endpoint.content_type and "content-type" not in {k.lower() for k in req_headers}:
            req_headers["Content-Type"] = endpoint.content_type
        if "user-agent" not in {k.lower() for k in req_headers}:
            req_headers["User-Agent"] = "PrettyK-Fuzzer/1.0"

        req_info = {
            "method": endpoint.method,
            "url": url,
            "headers": {k: v for k, v in req_headers.items() if k.lower() != "authorization"},
            "body": (body_data.decode("utf-8", errors="replace")[:2000]) if body_data else "",
        }

        req = urllib.request.Request(
            url,
            data=body_data,
            headers=req_headers,
            method=endpoint.method.upper(),
        )

        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                resp_body = resp.read().decode("utf-8", errors="replace")
                resp_headers = dict(resp.headers)
                elapsed = time.time() - t0
                return resp.status, resp_body, resp_headers, req_info, elapsed
        except urllib.error.HTTPError as e:
            elapsed = time.time() - t0
            try:
                resp_body = e.read().decode("utf-8", errors="replace")
            except Exception:
                resp_body = ""
            return e.code, resp_body, dict(e.headers), req_info, elapsed
        except Exception:
            elapsed = time.time() - t0
            return 0, "", {}, req_info, elapsed

    # ── URL injection ──

    @staticmethod
    def _inject_payload_into_url(endpoint: EndpointSpec, param: FuzzParam, payload: str) -> str:
        """Подставить payload в query или path параметр URL."""
        if param.param_type == ParamType.PATH:
            placeholder = f"/:{param.name}/"
            if placeholder in endpoint.url:
                return endpoint.url.replace(placeholder, f"/{payload}/")
            # Fallback: ищем :name в path
            if f"/:{param.name}" in endpoint.url:
                return endpoint.url.replace(f"/:{param.name}", f"/{payload}")
        return endpoint.url

    # ── Body building ──

    @staticmethod
    def _build_body(endpoint: EndpointSpec, param: FuzzParam, payload: str) -> bytes:
        """Построить тело запроса с подставленным payload."""
        content_type = endpoint.content_type.lower()

        if "json" in content_type:
            body_dict = {}
            for p in endpoint.params:
                val = payload if p.name == param.name else (p.original_value or p.example_value or "")
                body_dict[p.name] = val
            return json.dumps(body_dict).encode("utf-8")

        # Form-encoded
        parts = []
        for p in endpoint.params:
            val = payload if p.name == param.name else (p.original_value or p.example_value or "")
            parts.append(f"{urllib.parse.quote(p.name)}={urllib.parse.quote(val)}")
        return "&".join(parts).encode("utf-8")

    # ── Прогресс / результат ──

    def _publish_progress(self, status: str, completed: int, on_progress: Optional[callable]) -> None:
        if on_progress:
            try:
                on_progress(status, completed, self._total_endpoints)
            except Exception:
                pass

        try:
            from utils.diary_bus import publish

            pct = int(completed / max(self._total_endpoints, 1) * 100)
            publish(
                kind="FUZZ_PROGRESS",
                text=f"{status} ({completed}/{self._total_endpoints}, {pct}%)",
                channel="diary",
            )
        except Exception:
            pass

    def _build_result(self) -> Dict[str, Any]:
        duration = time.time() - (self._started_at or time.time())
        summary = self._pipeline.summary()
        result = {
            "status": "completed",
            "profile": self.profile,
            "total_endpoints": self._total_endpoints,
            "total_requests": self._total_requests,
            "findings": summary["total"],
            "by_severity": summary["by_severity"],
            "duration_sec": round(duration, 2),
        }
        # CF-B3: обновить глобальное состояние для live_server SSE
        try:
            from fuzzer.findings import update_fuzz_result
            update_fuzz_result(result)
        except Exception:
            pass
        return result

    def _empty_result(self) -> Dict[str, Any]:
        return {
            "status": "completed",
            "profile": self.profile,
            "total_endpoints": 0,
            "total_requests": 0,
            "findings": 0,
            "by_severity": {},
            "duration_sec": 0,
        }

    # ── Доступ к пайплайну ──

    @property
    def pipeline(self) -> FindingPipeline:
        return self._pipeline


# ── Helpers ──

def _awakened_to_endpoint_spec(ep: Any) -> EndpointSpec:
    """AwakenedEndpoint → EndpointSpec для фаззера."""
    from urllib.parse import parse_qs, urlparse

    parsed = urlparse(ep.endpoint_url)
    path = parsed.path or "/"

    params: List[FuzzParam] = []
    for k, v_list in parse_qs(parsed.query).items():
        val = v_list[0] if v_list else ""
        params.append(FuzzParam(name=k, param_type=ParamType.QUERY, original_value=val))

    if ep.request_payload:
        for k, v in ep.request_payload.items():
            body_type = ParamType.BODY
            if k.lower() in ("authorization", "cookie", "x-", "content-type"):
                body_type = ParamType.HEADER
            params.append(
                FuzzParam(
                    name=k,
                    param_type=body_type,
                    original_value=str(v) if v else "",
                )
            )

    content_type = "application/x-www-form-urlencoded"
    if ep.request_payload and any(
        isinstance(v, (dict, list)) for v in ep.request_payload.values()
    ):
        content_type = "application/json"

    return EndpointSpec(
        method=ep.method or "GET",
        url=ep.endpoint_url,
        path=path,
        content_type=content_type,
        params=params,
    )