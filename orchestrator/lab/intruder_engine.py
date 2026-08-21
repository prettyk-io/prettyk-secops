# -*- coding: utf-8 -*-
"""LAB-INTRUDER-PRO: Бэкенд-движок атак Burp Killer / Станция активного тестирования.

Полноценный асинхронный/многопоточный раннер для режимов:
- sniper: один список пейлоадов, последовательная подстановка в каждую позицию §...§
- battering_ram: один список пейлоадов, одновременная подстановка во все позиции
- pitchfork: N списков пейлоадов параллельно для N позиций
- cluster_bomb: декартово произведение N списков пейлоадов

Поддержка Grep Match, Grep Extract, кодировок (url, base64, hex),
потокового вывода SSE / polling буфера и отмены задачи.
"""
from __future__ import annotations

import base64
import hashlib
import itertools
import json
import re
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterator, List, Mapping, Optional, Sequence, Tuple, Union

from corpus.fuzzer import (
    GrepExtractRule,
    GrepMatchRule,
    evaluate_grep_extract,
    evaluate_grep_match,
)

MARKER_CHAR = "§"


@dataclass
class IntruderTarget:
    raw_http: str
    target_url: str = ""
    use_https: bool = False


@dataclass
class IntruderAttackConfig:
    attack_id: str
    raw_http: str
    attack_mode: str = "sniper"  # sniper | battering_ram | pitchfork | cluster_bomb
    payload_sets: List[List[str]] = field(default_factory=list)
    grep_match_rules: List[GrepMatchRule] = field(default_factory=list)
    grep_extract_rules: List[GrepExtractRule] = field(default_factory=list)
    encoders: List[str] = field(default_factory=list)  # url | base64 | hex | md5
    prefix: str = ""
    suffix: str = ""
    concurrency: int = 5
    delay_ms: int = 0
    timeout_sec: float = 8.0
    auto_url_override: str = ""


@dataclass
class IntruderResultItem:
    id: int
    payloads: List[str]
    position_names: List[str]
    url: str
    method: str
    status: int
    length: int
    elapsed_ms: int
    grep_matches: Dict[str, bool] = field(default_factory=dict)
    grep_extracts: Dict[str, List[str]] = field(default_factory=dict)
    request_raw: str = ""
    response_raw: str = ""
    response_headers: Dict[str, str] = field(default_factory=dict)
    error: Optional[str] = None


def apply_encoders(payload: str, encoders: Sequence[str]) -> str:
    """Применяет цепочку кодировщиков к пейлоаду."""
    res = payload
    for enc in encoders:
        enc = enc.lower().strip()
        if enc in ("url", "urlencode"):
            res = urllib.parse.quote(res)
        elif enc in ("base64", "b64"):
            res = base64.b64encode(res.encode("utf-8")).decode("ascii")
        elif enc == "hex":
            res = res.encode("utf-8").hex()
        elif enc in ("md5", "md5sum"):
            res = hashlib.md5(res.encode("utf-8")).hexdigest()
    return res


def apply_processing(
    payload: str,
    *,
    prefix: str = "",
    suffix: str = "",
    encoders: Sequence[str] = (),
) -> str:
    """Payload Processing: prefix → encoders → suffix (Burp-style)."""
    res = payload
    if prefix:
        res = prefix + res
    res = apply_encoders(res, encoders)
    if suffix:
        res = res + suffix
    return res


def extract_markers(raw_text: str) -> Tuple[str, List[Tuple[int, int, str]]]:
    """Находит все маркеры §value§ в тексте.

    Возвращает (шаблон с маркерами, список позиций с дефолтными значениями).
    """
    pattern = re.compile(r"§([^§]*)§")
    matches = list(pattern.finditer(raw_text))
    extracted = []
    for m in matches:
        extracted.append((m.start(), m.end(), m.group(1)))
    return raw_text, extracted


def replace_markers(raw_text: str, replacements: Sequence[str]) -> str:
    """Заменяет маркеры §...§ на переданные значения."""
    parts = []
    last_idx = 0
    pattern = re.compile(r"§([^§]*)§")
    matches = list(pattern.finditer(raw_text))
    for i, m in enumerate(matches):
        parts.append(raw_text[last_idx : m.start()])
        val = replacements[i] if i < len(replacements) else m.group(1)
        parts.append(val)
        last_idx = m.end()
    parts.append(raw_text[last_idx:])
    return "".join(parts)


# ── Payload Generators (Burp Intruder-style) ─────────────────────────


@dataclass
class RuntimeNumbersSpec:
    """Runtime Numbers: числовой диапазон с шагом."""

    start: int = 0
    stop: int = 10
    step: int = 1
    base: int = 10  # 2 | 8 | 10 | 16
    fmt: str = "{value}"  # формат: {value}, {index}, {index0}


@dataclass
class BruteForcerSpec:
    """Brute Forcer: генерация комбинаций символов заданной длины."""

    charset: str = "0123456789"
    min_len: int = 1
    max_len: int = 3
    prefix: str = ""
    suffix: str = ""


def generate_runtime_numbers(spec: RuntimeNumbersSpec, limit: int = 10000) -> List[str]:
    """Генерирует числа от start до stop с шагом step, формат по base/fmt."""
    if spec.step == 0:
        return []
    out: List[str] = []
    idx = 0

    def _fmt(value: int, index: int, index0: int) -> str:
        return (
            spec.fmt.replace("{value}", str(value))
            .replace("{index}", str(index))
            .replace("{index0}", str(index0))
        )

    if spec.step > 0:
        value = spec.start
        while value <= spec.stop and len(out) < limit:
            out.append(_fmt(value, idx + 1, idx))
            value += spec.step
            idx += 1
    else:
        value = spec.start
        while value >= spec.stop and len(out) < limit:
            out.append(_fmt(value, idx + 1, idx))
            value += spec.step
            idx += 1
    return out


def generate_brute_force(spec: BruteForcerSpec, limit: int = 100000) -> List[str]:
    """Генерирует комбинации charset длины min_len..max_len с prefix/suffix."""
    out: List[str] = []
    for length in range(max(1, spec.min_len), max(1, spec.max_len) + 1):
        for combo in itertools.product(spec.charset, repeat=length):
            out.append(spec.prefix + "".join(combo) + spec.suffix)
            if len(out) >= limit:
                return out
    return out


def generate_payload_set(
    kind: str,
    spec: Optional[Mapping[str, Any]] = None,
    *,
    items: Optional[Sequence[str]] = None,
    limit: int = 100000,
) -> List[str]:
    """Генерирует словарь по типу.

    ``kind``:
      - ``simple`` — статический список (``items``);
      - ``numbers`` — Runtime Numbers (``spec`` → RuntimeNumbersSpec);
      - ``bruteforce`` — Brute Forcer (``spec`` → BruteForcerSpec).
    """
    kind = (kind or "simple").lower().strip()
    if kind in ("simple", "list", "static"):
        return list(items or [])
    if kind in ("numbers", "runtime_numbers", "number_range"):
        if spec is None:
            return []
        return generate_runtime_numbers(
            RuntimeNumbersSpec(
                start=int(spec.get("start", 0)),
                stop=int(spec.get("stop", 10)),
                step=int(spec.get("step", 1)),
                base=int(spec.get("base", 10)),
                fmt=str(spec.get("fmt", "{value}")),
            ),
            limit=limit,
        )
    if kind in ("bruteforce", "brute_force", "bruteforcer"):
        if spec is None:
            return []
        return generate_brute_force(
            BruteForcerSpec(
                charset=str(spec.get("charset", "0123456789")),
                min_len=int(spec.get("min_len", 1)),
                max_len=int(spec.get("max_len", 3)),
                prefix=str(spec.get("prefix", "")),
                suffix=str(spec.get("suffix", "")),
            ),
            limit=limit,
        )
    return []


def resolve_payload_sets(
    payload_sets: Sequence[Any],
    *,
    encoders: Sequence[str] = (),
    prefix: str = "",
    suffix: str = "",
    limit: int = 100000,
) -> List[List[str]]:
    """Превращает декларативные payload-наборы в списки строк с обработкой.

    Принимает как плоские списки строк (legacy), так и словари-спеки
    ``{kind, spec, items}``. Применяет prefix/encoders/suffix к каждому значению.
    """
    out: List[List[str]] = []
    for pset in payload_sets:
        if isinstance(pset, Mapping):
            kind = str(pset.get("kind") or "simple")
            items = pset.get("items")
            spec = pset.get("spec")
            resolved = generate_payload_set(kind, spec, items=items, limit=limit)
        elif isinstance(pset, (list, tuple)):
            resolved = [str(p) for p in pset if p is not None]
        else:
            resolved = []
        processed = [apply_processing(p, prefix=prefix, suffix=suffix, encoders=encoders) for p in resolved]
        out.append(processed)
    return out


def parse_raw_http_request(raw_http: str, target_url_fallback: str = "") -> Tuple[str, str, Dict[str, str], str]:
    """Разбирает сырой HTTP-запрос (метод, URL/путь, заголовки, тело)."""
    raw = raw_http.replace("\r\n", "\n")
    if "\n\n" in raw:
        head_part, body_part = raw.split("\n\n", 1)
    else:
        head_part, body_part = raw, ""

    lines = head_part.strip().split("\n")
    if not lines or not lines[0].strip():
        return "GET", target_url_fallback or "http://localhost/", {}, body_part

    first_line = lines[0].strip().split()
    method = first_line[0].upper() if len(first_line) >= 1 else "GET"
    path_or_url = first_line[1] if len(first_line) >= 2 else "/"

    headers: Dict[str, str] = {}
    host = ""
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            k_clean = k.strip()
            v_clean = v.strip()
            headers[k_clean] = v_clean
            if k_clean.lower() == "host":
                host = v_clean

    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        full_url = path_or_url
    elif target_url_fallback:
        base = target_url_fallback.rstrip("/")
        if path_or_url.startswith("/"):
            # combine host from fallback with path
            parsed = urllib.parse.urlsplit(base)
            full_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path_or_url, "", ""))
        else:
            full_url = f"{base}/{path_or_url}"
    elif host:
        scheme = "https" if ":443" in host else "http"
        clean_path = path_or_url if path_or_url.startswith("/") else f"/{path_or_url}"
        full_url = f"{scheme}://{host}{clean_path}"
    else:
        clean_path = path_or_url if path_or_url.startswith("/") else f"/{path_or_url}"
        full_url = f"http://localhost{clean_path}"

    return method, full_url, headers, body_part


def build_attack_generator(
    raw_http: str,
    attack_mode: str,
    payload_sets: Sequence[Any],
    encoders: Sequence[str] = (),
    prefix: str = "",
    suffix: str = "",
) -> Iterator[Tuple[int, List[str], str]]:
    """Генерирует последовательность мутированных сырых HTTP запросов.

    Yields: (item_id, list_of_applied_payloads, mutated_raw_http)

    ``payload_sets`` — либо плоские списки строк, либо декларативные спеки
    (``{kind, spec, items}``) для Runtime Numbers / Brute Forcer.
    """
    _, markers = extract_markers(raw_http)
    num_markers = len(markers)
    if num_markers == 0:
        yield 1, [], raw_http
        return

    # Подготовка словарей с энкодерами / префиксами / суффиксами
    encoded_sets = resolve_payload_sets(
        payload_sets, encoders=encoders, prefix=prefix, suffix=suffix
    )

    if not encoded_sets or all(len(s) == 0 for s in encoded_sets):
        default_vals = [m[2] for m in markers]
        yield 1, default_vals, raw_http.replace("§", "")
        return

    item_id = 1
    mode = attack_mode.lower().strip()

    if mode == "battering_ram":
        p_pool = encoded_sets[0]
        for p in p_pool:
            replacements = [p] * num_markers
            mutated = replace_markers(raw_http, replacements)
            yield item_id, [p], mutated
            item_id += 1

    elif mode == "pitchfork":
        # Итерация параллельно по каждому набору
        sets_for_markers = []
        for i in range(num_markers):
            if i < len(encoded_sets) and len(encoded_sets[i]) > 0:
                sets_for_markers.append(encoded_sets[i])
            else:
                sets_for_markers.append([markers[i][2]])
        for combo in zip(*sets_for_markers):
            mutated = replace_markers(raw_http, combo)
            yield item_id, list(combo), mutated
            item_id += 1

    elif mode == "cluster_bomb":
        # Декартово произведение
        sets_for_markers = []
        for i in range(num_markers):
            if i < len(encoded_sets) and len(encoded_sets[i]) > 0:
                sets_for_markers.append(encoded_sets[i])
            else:
                sets_for_markers.append([markers[i][2]])
        for combo in itertools.product(*sets_for_markers):
            mutated = replace_markers(raw_http, combo)
            yield item_id, list(combo), mutated
            item_id += 1

    else:
        # Default: Sniper (по очереди в каждую позицию)
        p_pool = encoded_sets[0] if encoded_sets and len(encoded_sets[0]) > 0 else [""]
        for marker_idx in range(num_markers):
            for p in p_pool:
                replacements = []
                for i in range(num_markers):
                    if i == marker_idx:
                        replacements.append(p)
                    else:
                        replacements.append(markers[i][2])
                mutated = replace_markers(raw_http, replacements)
                yield item_id, [p], mutated
                item_id += 1


class IntruderAttackSession:
    """Сессия выполнения атаки Intruder с потокобезопасным буфером."""

    def __init__(self, config: IntruderAttackConfig) -> None:
        self.config = config
        self.attack_id = config.attack_id
        self.is_running = False
        self.is_cancelled = False
        self.total_requests = 0
        self.completed_requests = 0
        self.results: List[IntruderResultItem] = []
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        with self._lock:
            if self.is_running:
                return
            self.is_running = True
            self.is_cancelled = False
            self.results = []
            self.completed_requests = 0
            self._thread = threading.Thread(target=self._run_attack, daemon=True, name=f"intruder-{self.attack_id}")
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            self.is_cancelled = True
            self.is_running = False

    def get_progress(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "attack_id": self.attack_id,
                "is_running": self.is_running,
                "is_cancelled": self.is_cancelled,
                "completed": self.completed_requests,
                "total": self.total_requests,
                "results_count": len(self.results),
            }

    def get_results_slice(self, offset: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            items = self.results[offset : offset + limit]
            return [
                {
                    "id": item.id,
                    "payloads": item.payloads,
                    "position_names": item.position_names,
                    "url": item.url,
                    "method": item.method,
                    "status": item.status,
                    "length": item.length,
                    "elapsed_ms": item.elapsed_ms,
                    "grep_matches": item.grep_matches,
                    "grep_extracts": item.grep_extracts,
                    "error": item.error,
                }
                for item in items
            ]

    def get_result_detail(self, item_id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            for r in self.results:
                if r.id == item_id:
                    return {
                        "id": r.id,
                        "payloads": r.payloads,
                        "url": r.url,
                        "method": r.method,
                        "status": r.status,
                        "length": r.length,
                        "elapsed_ms": r.elapsed_ms,
                        "grep_matches": r.grep_matches,
                        "grep_extracts": r.grep_extracts,
                        "request_raw": r.request_raw,
                        "response_raw": r.response_raw,
                        "response_headers": r.response_headers,
                        "error": r.error,
                    }
            return None

    def _execute_single(self, item_id: int, payloads: List[str], mutated_http: str) -> IntruderResultItem:
        method, url, headers, body = parse_raw_http_request(
            mutated_http, target_url_fallback=self.config.auto_url_override
        )
        req_data = body.encode("utf-8") if body else None
        req = urllib.request.Request(url, data=req_data, headers=headers, method=method)

        t0 = time.perf_counter()
        status_code = 0
        resp_body_str = ""
        resp_headers_dict: Dict[str, str] = {}
        err_msg: Optional[str] = None

        try:
            with urllib.request.urlopen(req, timeout=self.config.timeout_sec) as resp:
                status_code = resp.status
                resp_bytes = resp.read()
                resp_body_str = resp_bytes.decode("utf-8", errors="replace")
                for k, v in resp.getheaders():
                    resp_headers_dict[k] = v
        except urllib.error.HTTPError as e:
            status_code = e.code
            try:
                resp_bytes = e.read()
                resp_body_str = resp_bytes.decode("utf-8", errors="replace")
            except Exception:
                resp_body_str = ""
            for k, v in getattr(e, "headers", {}).items():
                resp_headers_dict[k] = v
        except Exception as e:
            status_code = 0
            err_msg = str(e)

        elapsed = int((time.perf_counter() - t0) * 1000)

        # Grep Match / Extract
        grep_m = evaluate_grep_match(resp_body_str, self.config.grep_match_rules)
        grep_e = evaluate_grep_extract(resp_body_str, self.config.grep_extract_rules)

        raw_resp = f"HTTP/1.1 {status_code}\n"
        for k, v in resp_headers_dict.items():
            raw_resp += f"{k}: {v}\n"
        raw_resp += f"\n{resp_body_str}"

        return IntruderResultItem(
            id=item_id,
            payloads=payloads,
            position_names=[f"pos_{i+1}" for i in range(len(payloads))],
            url=url,
            method=method,
            status=status_code,
            length=len(resp_body_str),
            elapsed_ms=elapsed,
            grep_matches=grep_m,
            grep_extracts=grep_e,
            request_raw=mutated_http,
            response_raw=raw_resp,
            response_headers=resp_headers_dict,
            error=err_msg,
        )

    def _run_attack(self) -> None:
        jobs = list(
            build_attack_generator(
                self.config.raw_http,
                self.config.attack_mode,
                self.config.payload_sets,
                encoders=self.config.encoders,
                prefix=self.config.prefix,
                suffix=self.config.suffix,
            )
        )
        self.total_requests = len(jobs)
        concurrency = max(1, int(self.config.concurrency))

        # Потокобезопасная запись: результаты упорядочиваются по item_id.
        by_id: Dict[int, IntruderResultItem] = {}
        next_to_flush = 1

        def _flush_ready() -> None:
            nonlocal next_to_flush
            while next_to_flush in by_id:
                with self._lock:
                    self.results.append(by_id.pop(next_to_flush))
                    self.completed_requests += 1
                next_to_flush += 1

        def _worker(job: Tuple[int, List[str], str]) -> Optional[IntruderResultItem]:
            item_id, payloads, mutated_http = job
            if self.is_cancelled:
                return None
            if self.config.delay_ms > 0:
                time.sleep(self.config.delay_ms / 1000.0)
            return self._execute_single(item_id, payloads, mutated_http)

        if concurrency == 1 or len(jobs) <= 1:
            for job in jobs:
                if self.is_cancelled:
                    break
                res = _worker(job)
                if res is not None:
                    with self._lock:
                        self.results.append(res)
                        self.completed_requests += 1
        else:
            with ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix="intruder") as pool:
                future_map = {pool.submit(_worker, job): job for job in jobs}
                for fut in future_map:
                    if self.is_cancelled:
                        break
                    res = fut.result()
                    if res is not None:
                        with self._lock:
                            by_id[res.id] = res
                        _flush_ready()

        with self._lock:
            self.is_running = False


# Global Registry активных сессий атак
_ATTACK_SESSIONS: Dict[str, IntruderAttackSession] = {}
_SESSIONS_LOCK = threading.Lock()


def get_or_create_attack_session(config: IntruderAttackConfig) -> IntruderAttackSession:
    with _SESSIONS_LOCK:
        sess = IntruderAttackSession(config)
        _ATTACK_SESSIONS[config.attack_id] = sess
        return sess


def get_attack_session(attack_id: str) -> Optional[IntruderAttackSession]:
    with _SESSIONS_LOCK:
        return _ATTACK_SESSIONS.get(attack_id)
