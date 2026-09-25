"""Ядро фаззинг-POC: Campaign → Evidence (не продуктовая поверхность PrettyK).

Модель как у scanner/Burp:
  message (шаблон URL или History) → location (одна дырка) → payloads (corpus строк)
  → evidence table (baseline + rows с deltas).

Context / base_url_override = allowlist хостов (same-origin), не словарь URL
и не словарь пейлоадов.

Словари:
  - corpus строк (fuzz_corpus / list[str]) — что вставляем в дырку;
  - URL-list обхода (data_file) — другая ось; фаззер её не читает как payloads.

Отправка через уже поднятый ScannerAdapter (scanner_http_request), не Desktop Fuzzer API.
Экспериментальный MethodId «ЗапуститьФаззер» / nested fuzzing_fields — адаптер к ядру,
не канон языка.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
from dataclasses import dataclass, field, replace
from itertools import islice, product
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, Literal, Sequence, Union
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

from core.errors import WiredError

WaveMode = Literal["sniper", "pitchfork", "cluster_bomb"]


REPORTS_DIR = Path(__file__).resolve().parents[2] / "reports" / "fuzz"

# Жёсткий потолок POC в ядре (даже если спека/адаптер передаст больше).
POC_MAX_REQUESTS = 25
POC_MAX_RPS = 1.0
POC_DEFAULT_MASK = "§FUZZ§"
# Live: сводка + digest + не больше M детальных anomaly (остальное — в evidence).
LIVE_ANOMALY_DETAIL_CAP = 5
# Size outlier: отношение к baseline и абсолютный порог (байты) — ffuf/Intruder-стиль.
POC_SIZE_RATIO = 3.0
POC_SIZE_ABS_DELTA = 2048
# Reflection: короткие маркеры дают FP («x» в любом HTML) — порог длины ячейки.
REFLECTION_MIN_LEN = 4

MessageSource = Literal["template", "history"]
LocationKind = Literal["query_param", "mask"]


@dataclass(frozen=True)
class ResponseMetrics:
    """Нечувствительная сводка ответа для baseline и row evidence."""

    status: int
    latency_ms: int
    body_bytes: int
    body_sha256: str

    def as_dict(self) -> Dict[str, object]:
        return {
            "status": self.status,
            "latency_ms": self.latency_ms,
            "body_bytes": self.body_bytes,
            "body_sha256": self.body_sha256,
        }


# ── B-5: живые beam-события фаззера → diary_bus ──

def _publish_beam(
    kind: str,
    *,
    run_id: str = "",
    module_id: str = "",
    target_origin: str = "",
    target_node: str = "",
    source_node: str = "",
    payload_hash: str = "",
    channeling_stage: str = "active",
    severity: str = "",
    anomaly_flag: bool = False,
    **extra: Any,
) -> None:
    """B-5: emit semantic beam event to diary NDJSON."""
    try:
        import hashlib
        from utils.diary_bus import append as diary_append

        event: Dict[str, Any] = {
            "kind": kind,
            "run_id": run_id or "",
            "beam_id": f"beam-{module_id or 'campaign'}-{hashlib.md5(run_id.encode()).hexdigest()[:8]}",
        }
        if kind == "FUZZ_BEAM_START":
            event.update({
                "source_node_id": source_node or module_id or "",
                "target_node_id": target_node or target_origin or "",
                "payload": payload_hash or "",
                "channeling_stage": "warmup",
            })
        elif kind == "PAYLOAD_MUTATION":
            event.update({
                "source_node_id": source_node or "",
                "target_node_id": target_node or "",
                "payload_hash": payload_hash or "",
                "channeling_stage": channeling_stage,
            })
        elif kind == "TARGET_HIT":
            event.update({
                "target_node_id": target_node or target_origin or "",
                "severity": severity or "info",
                "anomaly_flag": bool(anomaly_flag),
                "channeling_stage": "active",
            })
        elif kind == "BEAM_END":
            event.update({
                "target_node_id": target_node or target_origin or "",
                "channeling_stage": "dead",
                "verdict": extra.get("verdict", "observations_require_review"),
            })
        elif kind == "SECURITY_GATE":
            event.update({
                "gate_id": extra.get("gate_id", ""),
                "decision": extra.get("decision", "pass"),
                "reason": extra.get("reason", ""),
            })
        event.update(extra)
        diary_append("diary", event)
    except Exception:
        pass


@dataclass(frozen=True)
class FuzzMessage:
    """Цель кампании: явный same-origin шаблон или выбор из scanner History."""

    source: MessageSource = "template"
    method: str = "GET"
    url: str = ""
    body: str = ""
    headers: Dict[str, str] = field(default_factory=dict)
    follow_redirects: bool = True
    # History filter (source=history): method + URL contains.
    history_url_contains: str = ""
    history_method: str = "GET"


@dataclass(frozen=True)
class FuzzLocation:
    """Одна дырка на кампанию POC: query-параметр или маска в URL."""

    kind: LocationKind
    name: str


@dataclass(frozen=True)
class FuzzPolicy:
    """Политика только ядра: лимиты, same-origin уже снаружи, redact в evidence."""

    max_requests: int = POC_MAX_REQUESTS
    requests_per_second: float = POC_MAX_RPS
    alert_on_server_error: bool = True
    latency_multiplier: float = 3.0
    size_ratio: float = POC_SIZE_RATIO
    size_abs_delta: int = POC_SIZE_ABS_DELTA
    redact_payloads: bool = True

    def clamped(self) -> "FuzzPolicy":
        max_req = max(1, min(int(self.max_requests), POC_MAX_REQUESTS))
        rps = min(float(self.requests_per_second), POC_MAX_RPS)
        if rps <= 0:
            rps = POC_MAX_RPS
        mult = float(self.latency_multiplier)
        if mult < 1.5:
            mult = 1.5
        if mult > 5.0:
            mult = 5.0
        size_r = float(self.size_ratio)
        if size_r < 1.5:
            size_r = 1.5
        if size_r > 10.0:
            size_r = 10.0
        abs_delta = max(0, int(self.size_abs_delta))
        return FuzzPolicy(
            max_requests=max_req,
            requests_per_second=rps,
            alert_on_server_error=bool(self.alert_on_server_error),
            latency_multiplier=mult,
            size_ratio=size_r,
            size_abs_delta=abs_delta,
            redact_payloads=bool(self.redact_payloads),
        )


# Один удар: строка (все маски одинаково) или вектор под {MASK_1}..{MASK_n}.
PayloadVector = Union[str, tuple[str, ...]]


@dataclass
class Campaign:
    """Внутренний объект кампании (не PrettyK-контракт)."""

    message: FuzzMessage
    location: FuzzLocation
    payloads: list[PayloadVector]
    policy: FuzzPolicy = field(default_factory=FuzzPolicy)
    module_id: str = ""


@dataclass(frozen=True)
class EvidenceRow:
    """Одна строка таблицы наблюдений. Сырой payload не хранится."""

    index: int
    payload_sha256: str
    payload_length: int
    status: int | None
    latency_ms: int | None
    body_bytes: int | None
    body_sha256: str | None
    deltas: tuple[str, ...]
    request_url_sha256: str
    transport_error: str = ""

    def as_dict(self) -> Dict[str, object]:
        return {
            "i": self.index,
            "payload_sha256": self.payload_sha256,
            "payload_length": self.payload_length,
            "status": self.status,
            "latency_ms": self.latency_ms,
            "body_bytes": self.body_bytes,
            "body_sha256": self.body_sha256,
            "deltas": list(self.deltas),
            "request_url_sha256": self.request_url_sha256,
            "transport_error": self.transport_error or None,
            # Совместимость с Live-проекцией / старыми тестами.
            "case_id": None,  # заполняет runner
            "anomaly_reasons": list(self.deltas),
            "response": (
                {
                    "status": self.status,
                    "latency_ms": self.latency_ms,
                    "body_bytes": self.body_bytes,
                    "body_sha256": self.body_sha256,
                }
                if self.status is not None
                else None
            ),
            "status_changed": None,  # заполняет runner при наличии baseline
        }


@dataclass
class Evidence:
    run_id: str
    module_id: str
    message_source: MessageSource
    target_origin: str
    location: Dict[str, str]
    baseline: ResponseMetrics
    rows: list[EvidenceRow]
    verdict: str = "observations_require_review"
    evidence_path: str = ""

    @property
    def cases_total(self) -> int:
        return len(self.rows)

    @property
    def anomalies_total(self) -> int:
        return sum(1 for row in self.rows if row.deltas)

    def as_summary(self) -> Dict[str, object]:
        """JSON-сводка для reports/fuzz и Live. Без сырых payload."""
        cases = []
        for row in self.rows:
            case = row.as_dict()
            case_id = f"{self.run_id}-{row.index:03d}"
            case["case_id"] = case_id
            if self.baseline is not None and row.status is not None:
                case["status_changed"] = row.status != self.baseline.status
            else:
                case["status_changed"] = False
            cases.append(case)
        return {
            "run_id": self.run_id,
            "module_id": self.module_id,
            "message_source": self.message_source,
            "target_origin": self.target_origin,
            "location": dict(self.location),
            "query_param": (
                self.location.get("name")
                if self.location.get("kind") == "query_param"
                else None
            ),
            "baseline": self.baseline.as_dict(),
            "rows": [
                {
                    "i": c["i"],
                    "status": c["status"],
                    "latency_ms": c["latency_ms"],
                    "body_bytes": c["body_bytes"],
                    "body_sha256": c["body_sha256"],
                    "payload_sha256": c["payload_sha256"],
                    "payload_length": c["payload_length"],
                    "deltas": c["deltas"],
                    "request_url_sha256": c["request_url_sha256"],
                    "transport_error": c["transport_error"],
                }
                for c in cases
            ],
            "cases": cases,
            "cases_total": self.cases_total,
            "anomalies_total": self.anomalies_total,
            "verdict": self.verdict,
            "evidence_path": self.evidence_path,
        }


def sha256_text(value: object) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def origin_of(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise WiredError(f"Фаззер: ожидается абсолютный http(s) URL, получено {url!r}")
    return f"{parsed.scheme}://{parsed.netloc}"


def base_url_of(url: str) -> str:
    """scheme+netloc+path без query/fragment — скоуп endpoint для alert-diff фаззера."""
    parsed = urlsplit(url)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def assert_same_origin(target_url: str, base_url: str) -> None:
    """Guard: бить можно только в origin base_url_override (scope POC)."""
    if origin_of(target_url) != origin_of(base_url):
        raise WiredError(
            "Фаззер: URL шаблона вне origin base_url_override; "
            "POC не допускает выход за явный scope"
        )


def with_query_value(url: str, name: str, value: str) -> str:
    parsed = urlsplit(url)
    items = [
        (key, item)
        for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        if key != name
    ]
    items.append((name, value))
    return urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urlencode(items), parsed.fragment)
    )


_MASK_RE = re.compile(r"\{MASK(?:_\d+)?\}|__FUZZ__")
# Group 1 = номер для {MASK_n}; bare {MASK} / __FUZZ__ → group 1 is None.
_MASK_TOKEN_RE = re.compile(r"\{MASK(?:_(\d+))?\}|__FUZZ__")


def normalize_payload_vector(payload: PayloadVector | Sequence[str]) -> tuple[str, ...]:
    if isinstance(payload, str):
        return (payload,)
    return tuple(str(x) for x in payload)


def payload_evidence_meta(payload: PayloadVector | Sequence[str]) -> tuple[str, int]:
    """sha256 и длина для evidence (вектор склеиваем через TAB)."""
    joined = "\t".join(normalize_payload_vector(payload))
    return sha256_text(joined), len(joined)


def payload_reflected_in_body(
    payload: PayloadVector | Sequence[str],
    response_body: str,
    *,
    min_len: int = REFLECTION_MIN_LEN,
) -> bool:
    """MC-3: payload (или URL-decoded вариант) виден в теле ответа.

    Сырой payload в evidence не пишем — только reason ``reflection``.
    Короткие ячейки (< min_len) игнорируем, чтобы не ловить FP на «x»/«a1».
    """
    if not response_body:
        return False
    for cell in normalize_payload_vector(payload):
        text = str(cell or "")
        if len(text) < min_len:
            continue
        if text in response_body:
            return True
        decoded = unquote(text)
        if decoded != text and len(decoded) >= min_len and decoded in response_body:
            return True
    return False


def count_mask_slots(text: str) -> int:
    """Сколько слотов нужно: max({MASK_n}) или 1 для bare {MASK}/__FUZZ__/нет масок."""
    numbered: set[int] = set()
    for match in _MASK_TOKEN_RE.finditer(text or ""):
        num = match.group(1)
        if num is not None:
            numbered.add(int(num))
    if numbered:
        return max(numbered)
    return 1


def apply_mask_template(template: str, payload: PayloadVector | Sequence[str]) -> str:
    """Подставить payload в маски.

    - ``str`` — все маски одинаково (Sniper / обратная совместимость).
    - sequence — ``{MASK_1}``←[0], ``{MASK_2}``←[1], bare ``{MASK}``←[0];
      недостающий индекс берёт [0].
    """
    if not template:
        return ""
    if not _MASK_TOKEN_RE.search(template):
        return template
    vec = normalize_payload_vector(payload)
    if not vec:
        return _MASK_TOKEN_RE.sub("", template)

    def _repl(match: re.Match[str]) -> str:
        num = match.group(1)
        if num is None:
            return vec[0]
        idx = int(num) - 1
        if 0 <= idx < len(vec):
            return vec[idx]
        return vec[0]

    return _MASK_TOKEN_RE.sub(_repl, template)


def apply_location(
    url: str, location: FuzzLocation, payload: PayloadVector | Sequence[str]
) -> str:
    kind = location.kind
    name = (location.name or "").strip()
    if not name:
        raise WiredError("Фаззер: location.name пуст")
    if kind == "query_param":
        primary = normalize_payload_vector(payload)[0]
        return with_query_value(url, name, primary)
    if kind == "mask":
        if _MASK_TOKEN_RE.search(url):
            return apply_mask_template(url, payload)
        primary = normalize_payload_vector(payload)[0]
        if name in url:
            return url.replace(name, primary)
        return url
    raise WiredError(f"Фаззер: неизвестный location.kind {kind!r}")


HoleKind = Literal["query", "body", "path", "header", "cookie", "unknown"]

# corpus=auto → curated default by hole (canon-request fuzz-dictionaries B).
# Honesty (CYCLE-H1): classify_fuzz_hole today only emits query|body|path|unknown.
# header/cookie keys are reserved for future location kinds — unused in auto path.
# xss/ssti corpora are explicit-only (not chosen by auto matrix).
_HOLE_DEFAULT_CORPUS: Dict[str, str] = {
    "query": "intent_sqli_smoke",
    "body": "intent_sqli_smoke",
    "path": "intent_path_smoke",
    "header": "intent_boundary",
    "cookie": "intent_boundary",
    "unknown": "intent_boundary",
}


def default_corpus_for_hole(hole_kind: str) -> str:
    key = (hole_kind or "unknown").strip().lower() or "unknown"
    return _HOLE_DEFAULT_CORPUS.get(key, "intent_boundary")


def _classify_mask_hole(url: str, body_text: str) -> HoleKind:
    if _MASK_RE.search(body_text):
        return "body"
    parsed = urlsplit(url or "")
    if _MASK_RE.search(parsed.path or ""):
        return "path"
    if _MASK_RE.search(parsed.query or ""):
        return "query"
    match = _MASK_RE.search(url or "")
    if not match:
        return "unknown"
    qpos = (url or "").find("?")
    if qpos < 0 or match.start() < qpos:
        return "path"
    return "query"


def classify_fuzz_hole(
    url: str,
    method: str,
    body: str | None,
    location: FuzzLocation,
) -> HoleKind:
    """Pareto hole class for corpus=auto."""
    del method
    if location.kind == "query_param":
        return "query"
    if location.kind == "mask":
        return _classify_mask_hole(url, body or "")
    return "unknown"


def resolve_corpus_spec(spec: str, *, hole_kind: str) -> str:
    """``auto`` / empty → default for hole; ``auto`` in pitchfork csv replaced."""
    raw = (spec or "").strip()
    if not raw or raw.lower() == "auto":
        return default_corpus_for_hole(hole_kind)
    parts = [p.strip() for p in re.split(r"[,;]+", raw) if p.strip()]
    if not parts:
        return default_corpus_for_hole(hole_kind)
    out: list[str] = []
    for part in parts:
        if part.lower() == "auto":
            out.append(default_corpus_for_hole(hole_kind))
        else:
            out.append(part)
    return ",".join(out)


def parse_corpus_names(spec: str) -> list[str]:
    """``intent_a`` или pitchfork ``intent_a,intent_b`` → список имён корпусов."""
    parts = [p.strip() for p in str(spec or "").split(",") if p.strip()]
    if not parts:
        raise WiredError("Фаззер: corpus пуст")
    return parts


def split_payload_line(line: str, *, slots: int) -> PayloadVector:
    """Одна строка корпуса → вектор масок (TAB-separated) или broadcast str."""
    if slots <= 1:
        return line
    if "\t" in line:
        parts = [p for p in line.split("\t")]
        if len(parts) < slots:
            parts = parts + [parts[-1]] * (slots - len(parts))
        return tuple(parts[:slots])
    return line


def iter_string_corpus(
    values: object,
    *,
    limit: int,
    name: str = "corpus",
) -> Iterator[str]:
    """Поток строк из list[str] (resources / stream), с hard cap."""
    if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
        raise WiredError(
            f"Фаззер: corpus ${{{name}}} должен быть списком строк "
            f"(fuzz_corpus / payload strings), не URL-list обхода"
        )
    capped = max(1, min(int(limit), POC_MAX_REQUESTS))
    yielded = 0
    for item in values:
        if yielded >= capped:
            break
        yield item
        yielded += 1
    if yielded == 0:
        raise WiredError(f"Фаззер: corpus ${{{name}}} пуст")


def load_string_corpus(
    values: object,
    *,
    limit: int,
    name: str = "corpus",
) -> list[str]:
    """Материализовать corpus до ``limit`` (не больше POC_MAX_REQUESTS)."""
    return list(iter_string_corpus(values, limit=limit, name=name))


def iter_corpus_file(
    path: Path | str,
    *,
    limit: int = POC_MAX_REQUESTS,
    name: str | None = None,
) -> Iterator[str]:
    """Стримить lab corpus из ``.txt``: UTF-8, skip ``#``/пустые; stop на ``limit``.

    Не читает весь файл в RAM — DF-11.
    """
    file_path = Path(path)
    label = name or file_path.name
    if not file_path.is_file():
        raise WiredError(f"Фаззер: corpus-файл {label!r} не найден: {file_path}")
    capped = max(1, min(int(limit), POC_MAX_REQUESTS))
    yielded = 0
    with file_path.open("r", encoding="utf-8", errors="replace") as handle:
        for raw in handle:
            if yielded >= capped:
                break
            line = raw.rstrip("\r\n")
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            yield line
            yielded += 1
    if yielded == 0:
        raise WiredError(f"Фаззер: corpus ${{{label}}} пуст")


def load_corpus_file(
    path: Path | str,
    *,
    limit: int = POC_MAX_REQUESTS,
    name: str | None = None,
) -> list[str]:
    """Прочитать lab corpus до ``limit`` строк (стрим под капотом)."""
    return list(iter_corpus_file(path, limit=limit, name=name))


def clamp_payload_vectors(
    values: Sequence[PayloadVector | Sequence[str]],
    *,
    limit: int,
    name: str = "corpus",
) -> list[PayloadVector]:
    """Нормализовать и обрезать список ударов (str или tuple)."""
    capped = max(1, min(int(limit), POC_MAX_REQUESTS))
    out: list[PayloadVector] = []
    for item in values:
        if len(out) >= capped:
            break
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, (list, tuple)) and item and all(
            isinstance(x, str) for x in item
        ):
            out.append(tuple(item))
        else:
            raise WiredError(
                f"Фаззер: corpus ${{{name}}} элемент должен быть str или tuple[str, ...]"
            )
    if not out:
        raise WiredError(f"Фаззер: corpus ${{{name}}} пуст")
    return out


_REQUEST_LINE_RE = re.compile(
    r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+HTTP/\d",
    re.IGNORECASE,
)

# Не тащим в sender: hop-by-hop / то, что выставит транспорт scanner сам.
_SKIP_REQUEST_HEADERS = frozenset(
    {
        "host",
        "content-length",
        "transfer-encoding",
        "connection",
        "keep-alive",
        "proxy-connection",
        "te",
        "trailer",
        "upgrade",
    }
)

# Значения не пишем в evidence / Live (session-bound метаданные — только имена/флаги).
_SENSITIVE_REQUEST_HEADERS = frozenset(
    {
        "cookie",
        "authorization",
        "proxy-authorization",
    }
)

# Заголовки, достаточные для session_replay (DF-10).
_SESSION_CREDENTIAL_HEADERS = frozenset(
    {
        "cookie",
        "authorization",
        "proxy-authorization",
        "x-xsrf-token",
        "x-csrf-token",
    }
)

# Подряд 401/403 → session_lost (канон dast-fuzzing §3).
SESSION_LOST_STREAK = 3


def _set_parsed_header(out: Dict[str, str], key: str, val: str) -> None:
    low = key.lower()
    if low in _SKIP_REQUEST_HEADERS:
        return
    if low == "cookie" and "Cookie" in out:
        out["Cookie"] = f"{out['Cookie']}; {val}"
        return
    # Канон имени: как в первом вхождении (Cookie / Authorization).
    existing = next((name for name in out if name.lower() == low), None)
    if existing is not None and low != "cookie":
        out[existing] = val
        return
    out[key] = val


def parse_http_request_headers(request_header: str) -> Dict[str, str]:
    """Разобрать блок scanner ``requestHeader`` → dict заголовков для replay.

    Первая строка (request-line) пропускается. Несколько ``Cookie:`` склеиваются
    через ``; ``. Hop-by-hop заголовки отбрасываются (см. ``_SKIP_REQUEST_HEADERS``).
    """
    text = str(request_header or "")
    if not text.strip():
        return {}
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    # request-line
    start = 1 if lines and _REQUEST_LINE_RE.match(lines[0].strip()) else 0
    out: Dict[str, str] = {}
    for raw in lines[start:]:
        line = raw.strip()
        if not line:
            break
        if ":" not in line:
            continue
        name, _, value = line.partition(":")
        key = name.strip()
        if not key:
            continue
        _set_parsed_header(out, key, value.strip())
    return out


def headers_have_session(headers: Dict[str, str] | None) -> bool:
    """Есть ли в заголовках Cookie / Authorization / CSRF-токен."""
    lows = {str(k).lower() for k in (headers or {}) if k}
    return bool(lows & _SESSION_CREDENTIAL_HEADERS)


def session_bound_meta(
    headers: Dict[str, str],
    *,
    storage_meta: Dict[str, object] | None = None,
) -> Dict[str, object]:
    """Метаданные сессии для evidence: без значений Cookie/Authorization/JWT."""
    names = sorted({k for k in (headers or {}) if k})
    lows = {n.lower() for n in names}
    bound = headers_have_session(headers)
    out: Dict[str, object] = {
        "session_bound": bound,
        "has_cookie": "cookie" in lows,
        "has_authorization": "authorization" in lows or "proxy-authorization" in lows,
        "request_header_names": names,
    }
    if storage_meta:
        # S-2: только имена ключей / флаги — значения JWT не копируем.
        for key in (
            "has_storage_token",
            "storage_token_key",
            "storage_key_names",
            "storage_keys_count",
            "session_source",
        ):
            if key in storage_meta:
                out[key] = storage_meta[key]
    return out


def merge_request_headers(
    base: Dict[str, str] | None,
    override: Dict[str, str] | None,
) -> Dict[str, str]:
    """History headers + явный override (override побеждает case-insensitive)."""
    merged: Dict[str, str] = {}
    for src in (base or {}, override or {}):
        for key, value in src.items():
            if not key:
                continue
            low = key.lower()
            if low in _SKIP_REQUEST_HEADERS:
                continue
            existing = next((k for k in merged if k.lower() == low), None)
            if existing is not None:
                del merged[existing]
            merged[key] = str(value)
    return merged


def _method_url_from_request_line(header: str) -> tuple[str, str]:
    """method/url из первой строки requestHeader; пустые строки если нет request-line."""
    if not header or not header.strip():
        return "", ""
    first = header.splitlines()[0].strip()
    match = _REQUEST_LINE_RE.match(first)
    if not match:
        return "", ""
    return match.group(1).upper(), match.group(2).strip()


def parse_scanner_history_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """Вытащить method/url/headers из записи scanner core.messages().

    Поддержка:
      - поля url / requestUrl / uri (если адаптер уже нормализовал);
      - requestHeader: request-line + заголовки (Cookie, Authorization, …).
    """
    if not isinstance(message, dict):
        raise WiredError("Фаззер History: сообщение должно быть dict")

    method = str(
        message.get("method")
        or message.get("requestMethod")
        or ""
    ).strip().upper()
    url = str(
        message.get("url")
        or message.get("requestUrl")
        or message.get("uri")
        or ""
    ).strip()

    header = str(message.get("requestHeader") or message.get("request_header") or "")
    headers = parse_http_request_headers(header)
    line_method, line_url = _method_url_from_request_line(header)
    if not method and line_method:
        method = line_method
    if not url and line_url:
        url = line_url

    # Нормализованные поля поверх сырого header (если адаптер уже отдал dict).
    extra = message.get("headers") or message.get("requestHeaders")
    if isinstance(extra, dict):
        headers = merge_request_headers(headers, {str(k): str(v) for k, v in extra.items()})

    if not url:
        raise WiredError("Фаззер History: в сообщении нет URL")
    if not method:
        method = "GET"
    return {"method": method, "url": url, "headers": headers}


def _history_message_matches(
    parsed: Dict[str, Any],
    *,
    needle: str,
    want_method: str,
    base_url: str | None,
) -> bool:
    if want_method and parsed["method"] != want_method:
        return False
    if needle not in parsed["url"]:
        return False
    if not base_url:
        return True
    try:
        assert_same_origin(parsed["url"], base_url)
    except WiredError:
        return False
    return True


def pick_message_from_history(
    messages: Sequence[Any],
    *,
    url_contains: str,
    method: str = "GET",
    base_url: str | None = None,
) -> Dict[str, Any]:
    """Выбрать одно сообщение из History (method/url/headers).

    Фильтр: method (если задан) + url contains. При base_url — same-origin guard.
    Берём последнее совпадение (ближе к актуальной сессии после login).
    """
    needle = (url_contains or "").strip()
    if not needle:
        raise WiredError("Фаззер History: нужен url_contains")
    want_method = (method or "").strip().upper()
    matches: list[Dict[str, Any]] = []
    for raw in messages or []:
        if not isinstance(raw, dict):
            continue
        try:
            parsed = parse_scanner_history_message(raw)
        except WiredError:
            continue
        if _history_message_matches(
            parsed, needle=needle, want_method=want_method, base_url=base_url
        ):
            matches.append(parsed)
    if not matches:
        raise WiredError(
            f"Фаззер History: нет сообщений method={want_method or '*'!r} "
            f"url_contains={needle!r}"
        )
    return matches[-1]


def _session_headers_by_url(
    messages: Sequence[Any],
    *,
    needle: str,
    method: str,
    base_url: str,
) -> Dict[str, str]:
    picked = pick_message_from_history(
        messages,
        url_contains=needle,
        method=method or "GET",
        base_url=base_url,
    )
    headers = dict(picked.get("headers") or {})
    if not headers_have_session(headers):
        raise WiredError(
            f"Фаззер History: сообщение url_contains={needle!r} без Cookie/Authorization"
        )
    return headers


def _session_headers_same_origin(
    messages: Sequence[Any], *, base_url: str
) -> Dict[str, str]:
    if not (base_url or "").strip():
        raise WiredError("Фаззер History: нужен base_url для session fallback")
    matches: list[Dict[str, str]] = []
    for raw in messages or []:
        if not isinstance(raw, dict):
            continue
        try:
            parsed = parse_scanner_history_message(raw)
            assert_same_origin(parsed["url"], base_url)
        except WiredError:
            continue
        headers = dict(parsed.get("headers") or {})
        if headers_have_session(headers):
            matches.append(headers)
    if not matches:
        raise WiredError(
            "Фаззер History: нет same-origin сообщений с Cookie/Authorization "
            f"для origin {origin_of(base_url)!r}"
        )
    return matches[-1]


def pick_session_headers_from_history(
    messages: Sequence[Any],
    *,
    base_url: str,
    url_contains: str = "",
    method: str = "",
) -> Dict[str, str]:
    """Вытащить session-заголовки из scanner History (DF-10).

    - если ``url_contains`` задан — последнее совпадение (как ``pick_message_from_history``);
    - иначе — последнее same-origin сообщение с Cookie/Authorization/XSRF.
    """
    needle = (url_contains or "").strip()
    if needle:
        return _session_headers_by_url(
            messages, needle=needle, method=method, base_url=base_url
        )
    return _session_headers_same_origin(messages, base_url=base_url)


def _size_outlier(
    base_bytes: int,
    cur_bytes: int,
    *,
    size_ratio: float,
    size_abs_delta: int,
) -> bool:
    ratio = float(size_ratio) if size_ratio and size_ratio > 0 else POC_SIZE_RATIO
    if base_bytes > 0:
        lo = base_bytes / ratio
        hi = base_bytes * ratio
        if cur_bytes < lo or cur_bytes > hi:
            return True
    abs_delta = max(0, int(size_abs_delta))
    return bool(abs_delta > 0 and abs(cur_bytes - base_bytes) >= abs_delta)


def anomaly_reasons(
    baseline: ResponseMetrics,
    current: ResponseMetrics | None,
    transport_error: str,
    *,
    alert_on_server_error: bool,
    latency_multiplier: float,
    size_ratio: float = POC_SIZE_RATIO,
    size_abs_delta: int = POC_SIZE_ABS_DELTA,
    reflected: bool = False,
) -> list[str]:
    """Классификатор наблюдений (POC-C): Intruder/ffuf-метрики, не CVE.

    Порядок стабильный: transport → missing → status → 5xx → latency → size → reflection.
    ``scanner_alert`` добавляет runner после опроса scanner (DF-13), не здесь.
    """
    if transport_error:
        return ["transport_error"]
    if current is None:
        return ["missing_response"]
    reasons: list[str] = []
    if current.status != baseline.status:
        reasons.append("status_changed")
    if alert_on_server_error and current.status >= 500:
        reasons.append("server_error")
    if baseline.latency_ms > 0 and current.latency_ms >= (
        baseline.latency_ms * latency_multiplier
    ):
        reasons.append("latency_outlier")
    if _size_outlier(
        int(baseline.body_bytes or 0),
        int(current.body_bytes or 0),
        size_ratio=size_ratio,
        size_abs_delta=size_abs_delta,
    ):
        reasons.append("size_outlier")
    if reflected:
        reasons.append("reflection")
    return reasons


def alert_fingerprint(alert: Dict[str, Any]) -> str:
    """Стабильный ключ scanner alert для diff до/после кампании."""
    return "|".join(
        str(alert.get(key) or "")
        for key in ("pluginId", "alertRef", "url", "param", "name", "risk")
    )


def _scanner_alerts(scanner: Any, baseurl: str | None = None) -> list[Dict[str, Any]]:
    """Alerts от scanner, по возможности скоупленные по baseurl.

    BOX-GATE-NORM: полная пагинация всех alerts (25k+) — известный источник зависания
    демона (глубокий slice `start=21600`). Для alert-diff фаззера достаточен скоуп endpoint
    (baseurl без query), а не вся сессия. Fallback на ``get_alerts()`` для fake/старых адаптеров.
    """
    if baseurl:
        getter = getattr(scanner, "get_alerts_by_baseurl", None)
        if callable(getter):
            try:
                return [a for a in (getter(baseurl) or []) if isinstance(a, dict)]
            except Exception:
                pass
    getter = getattr(scanner, "get_alerts", None)
    if not callable(getter):
        return []
    try:
        return [a for a in (getter() or []) if isinstance(a, dict)]
    except Exception:
        return []


def snapshot_alert_fingerprints(
    scanner: Any, baseurl: str | None = None
) -> set[str]:
    return {alert_fingerprint(a) for a in _scanner_alerts(scanner, baseurl=baseurl)}


def compact_scanner_alert(alert: Dict[str, Any]) -> Dict[str, object]:
    """Без query/payload в URL — только path + sha256 (redact evidence)."""
    url = str(alert.get("url") or "")
    path = urlsplit(url).path if url else ""
    return {
        "name": str(alert.get("name") or alert.get("alert") or ""),
        "risk": str(alert.get("risk") or ""),
        "url_path": path,
        "url_sha256": sha256_text(url) if url else "",
        "param": str(alert.get("param") or ""),
        "pluginId": str(alert.get("pluginId") or alert.get("alertRef") or ""),
    }


def new_alerts_for_origin(
    scanner: Any,
    *,
    origin: str,
    before: set[str],
    limit: int = 50,
    baseurl: str | None = None,
) -> list[Dict[str, object]]:
    """DF-13: новые passive alerts на origin цели после ударов."""
    alerts = _scanner_alerts(scanner, baseurl=baseurl)
    origin_n = (origin or "").rstrip("/")
    out: list[Dict[str, object]] = []
    for raw in alerts:
        fp = alert_fingerprint(raw)
        if fp in before:
            continue
        url = str(raw.get("url") or "")
        if origin_n:
            if origin_n not in url and not url.startswith(origin_n):
                continue
        out.append(compact_scanner_alert(raw))
        if len(out) >= limit:
            break
    return out


def apply_scanner_alerts_to_rows(
    rows: list[EvidenceRow],
    alerts: Sequence[Dict[str, object]],
) -> list[EvidenceRow]:
    """Пометить cases причиной ``scanner_alert`` (match URL sha256; иначе last case)."""
    if not rows or not alerts:
        return rows
    url_hashes = set()
    for a in alerts:
        hashed = str(a.get("url_sha256") or "").strip()
        if hashed:
            url_hashes.add(hashed)
            continue
        raw = str(a.get("url") or "").strip()
        if raw:
            url_hashes.add(sha256_text(raw))
    updated: list[EvidenceRow] = []
    matched = False
    for row in rows:
        deltas = list(row.deltas)
        if row.request_url_sha256 in url_hashes and "scanner_alert" not in deltas:
            deltas.append("scanner_alert")
            matched = True
        updated.append(replace(row, deltas=tuple(deltas)))
    if matched:
        return updated
    # Attribution fallback: origin-level alert без точного URL → последний удар.
    last = updated[-1]
    deltas = list(last.deltas)
    if "scanner_alert" not in deltas:
        deltas.append("scanner_alert")
        updated[-1] = replace(last, deltas=tuple(deltas))
    return updated


def export_fuzz_security_artifacts(
    summary: Dict[str, object],
    *,
    reports_dir: Path | None = None,
) -> Dict[str, object]:
    """DF-14: findings pack + Allure attach digest (без spam rows)."""
    root = reports_dir if reports_dir is not None else REPORTS_DIR
    root.mkdir(parents=True, exist_ok=True)
    run_id = str(summary.get("run_id") or "fuzz-unknown")
    findings: Dict[str, object] = {
        "kind": "pk_fuzz_findings_pack",
        "run_id": run_id,
        "module_id": summary.get("module_id"),
        "target_origin": summary.get("target_origin"),
        "digest_path": summary.get("digest_path") or "",
        "evidence_path": summary.get("evidence_path") or "",
        "reason_counts": dict(summary.get("reason_counts") or {}),
        "scanner_alerts": list(summary.get("scanner_alerts") or []),
        "anomalies_total": summary.get("anomalies_total")
        or summary.get("anomalies_count")
        or 0,
        "dojo_note": (
            "Import path: attach digest/findings to engagement review; "
            "full scanner XML still via Reporter.finalize_reports / generate_report xml."
        ),
    }
    findings_path = root / f"{run_id}.findings.json"
    findings_path.write_text(
        json.dumps(findings, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    allure_attached = False
    digest_path = str(summary.get("digest_path") or "")
    if digest_path:
        try:
            import allure

            text = Path(digest_path).read_text(encoding="utf-8")
            allure.attach(
                text,
                name=f"fuzz-digest-{run_id}",
                attachment_type=allure.attachment_type.JSON,
            )
            allure_attached = True
        except Exception:
            allure_attached = False
    return {
        "findings_path": str(findings_path),
        "allure_attached": allure_attached,
        "dojo_pack": "findings_json",
    }


def count_anomaly_reasons(summary: Dict[str, object]) -> Dict[str, int]:
    """Сводка reason → count для digest / Live (proof-oriented, не dump)."""
    counts: Dict[str, int] = {}
    for case in summary.get("cases") or summary.get("rows") or []:
        if not isinstance(case, dict):
            continue
        reasons = case.get("anomaly_reasons") or case.get("deltas") or []
        for reason in reasons:
            key = str(reason)
            counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def write_evidence_json(summary: Dict[str, object], reports_dir: Path | None = None) -> str:
    root = reports_dir if reports_dir is not None else REPORTS_DIR
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{summary['run_id']}.json"
    # Защита: сырой payload не должен попасть в файл.
    text = json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True)
    path.write_text(text, encoding="utf-8")
    return str(path)


def _digest_anomaly_rows(summary: Dict[str, object]) -> list[Dict[str, object]]:
    anomalies: list[Dict[str, object]] = []
    for case in summary.get("cases") or []:
        if not isinstance(case, dict):
            continue
        reasons = case.get("anomaly_reasons") or case.get("deltas") or []
        if not reasons:
            continue
        sha = str(case.get("payload_sha256") or "")
        anomalies.append(
            {
                "case_id": case.get("case_id"),
                "reasons": list(reasons),
                "status": case.get("status"),
                "latency_ms": case.get("latency_ms"),
                "body_bytes": case.get("body_bytes"),
                "payload_sha256_prefix": sha[:12] if sha else "",
            }
        )
    return anomalies


def _digest_session_fields(summary: Dict[str, object]) -> Dict[str, object]:
    return {
        "session_bound": bool(summary.get("session_bound")),
        "has_cookie": bool(summary.get("has_cookie")),
        "has_authorization": bool(summary.get("has_authorization")),
        "request_header_names": list(summary.get("request_header_names") or []),
        "has_storage_token": bool(summary.get("has_storage_token")),
        "storage_token_key": str(summary.get("storage_token_key") or ""),
        "storage_key_names": list(summary.get("storage_key_names") or []),
        "http_sessions_sites_count": int(summary.get("http_sessions_sites_count") or 0),
        "http_sessions_count": int(summary.get("http_sessions_count") or 0),
        "http_session_names": list(summary.get("http_session_names") or []),
        "connector_probe": bool(summary.get("connector_probe")),
        "connector_probe_ok": bool(summary.get("connector_probe_ok")),
        "connector_pack": str(summary.get("connector_pack") or ""),
        "connector_sample_count": int(summary.get("connector_sample_count") or 0),
    }


def _wave_status(stopped: str, total_anomalies: int) -> str:
    if stopped == "session_lost":
        return "session_lost"
    if stopped == "matrix_capped":
        return "matrix_capped"
    if total_anomalies > 0:
        return "alert"
    return "success"


_WAVE_FIRST_META_KEYS = (
    "run_id",
    "evidence_path",
    "digest_path",
    "method",
    "target_origin",
    "cases_total",
    "message_source",
    "has_cookie",
    "has_authorization",
    "request_header_names",
    "session_bound",
    "has_storage_token",
    "storage_token_key",
    "storage_key_names",
    "storage_keys_count",
    "session_source",
)


def _copy_first_target_meta(
    wave_summary: Dict[str, object],
    target_summaries: list[Dict[str, object]],
) -> None:
    if not target_summaries:
        return
    first = target_summaries[0]
    for key in _WAVE_FIRST_META_KEYS:
        if key in first:
            wave_summary[key] = first[key]


def build_audit_digest(summary: Dict[str, object]) -> Dict[str, object]:
    """Короткий pack для ревью ИБ (POC-B). Без сырых payload и значений Cookie.

    Enterprise-паттерн: traceability прогона + anomalies с префиксом sha256,
    не полный dump evidence rows.
    """
    if not isinstance(summary, dict):
        raise WiredError("Фаззер digest: summary должен быть dict")
    baseline = summary.get("baseline") if isinstance(summary.get("baseline"), dict) else {}
    location = summary.get("location") if isinstance(summary.get("location"), dict) else {}
    policy = summary.get("policy") if isinstance(summary.get("policy"), dict) else {}
    digest: Dict[str, object] = {
        "kind": "pk_fuzz_audit_digest",
        "run_id": summary.get("run_id"),
        "module_id": summary.get("module_id"),
        "message_source": summary.get("message_source"),
        "method": summary.get("method") or "GET",
        "target_origin": summary.get("target_origin"),
        "location": dict(location),
        "policy": dict(policy),
        "baseline": {
            "status": baseline.get("status"),
            "latency_ms": baseline.get("latency_ms"),
            "body_bytes": baseline.get("body_bytes"),
            "body_sha256": baseline.get("body_sha256"),
        },
        "cases_total": summary.get("cases_total"),
        "anomalies_total": summary.get("anomalies_total"),
        "reason_counts": count_anomaly_reasons(summary),
        "scanner_alerts_total": int(summary.get("scanner_alerts_total") or 0),
        "scanner_alerts": list(summary.get("scanner_alerts") or [])[:20],
        "anomalies": _digest_anomaly_rows(summary),
        "verdict": summary.get("verdict") or "observations_require_review",
        "evidence_path": summary.get("evidence_path") or "",
        "findings_path": summary.get("findings_path") or "",
    }
    digest.update(_digest_session_fields(summary))
    return digest


def write_audit_digest(
    digest: Dict[str, object], reports_dir: Path | None = None
) -> str:
    """Записать ``reports/fuzz/<run_id>.digest.json``."""
    root = reports_dir if reports_dir is not None else REPORTS_DIR
    root.mkdir(parents=True, exist_ok=True)
    run_id = str(digest.get("run_id") or "fuzz-unknown")
    path = root / f"{run_id}.digest.json"
    path.write_text(
        json.dumps(digest, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return str(path)


def _live_summary_title(summary: Dict[str, object]) -> str:
    cases = int(summary.get("cases_total") or 0)
    anomalies = int(summary.get("anomalies_total") or 0)
    module_id = str(summary.get("module_id") or "")
    title = (
        f"Fuzz {module_id}: {cases} кейсов, отклонений {anomalies}"
        if module_id
        else f"Fuzz: {cases} кейсов, отклонений {anomalies}"
    )
    reason_counts = summary.get("reason_counts")
    if not isinstance(reason_counts, dict) or not reason_counts:
        reason_counts = count_anomaly_reasons(summary)
    if reason_counts and anomalies > 0:
        parts = [f"{name}×{count}" for name, count in list(reason_counts.items())[:4]]
        title += f" ({', '.join(parts)})"
    if summary.get("has_cookie") or summary.get("has_authorization"):
        title += " (session-bound)"
    elif summary.get("message_source") == "history":
        title += " (history)"
    if summary.get("stopped_reason") == "session_lost":
        title += " [session_lost]"
    return title


def _live_anomaly_detail_titles(
    summary: Dict[str, object], *, cap: int
) -> tuple[list[str], int]:
    titles: list[str] = []
    shown = 0
    omitted = 0
    for case in summary.get("cases") or summary.get("rows") or []:
        reasons = case.get("anomaly_reasons") or case.get("deltas") or []
        if not reasons:
            continue
        if shown >= cap:
            omitted += 1
            continue
        case_id = str(case.get("case_id") or f"i={case.get('i')}")
        digest = str(case.get("payload_sha256") or "")[:12]
        suffix = f" sha256={digest}" if digest else ""
        titles.append(f"Отклонение {case_id}: {', '.join(reasons)}{suffix}")
        shown += 1
    return titles, omitted


def live_projection_titles(
    summary: Dict[str, object],
    *,
    anomaly_detail_cap: int = LIVE_ANOMALY_DETAIL_CAP,
) -> list[str]:
    """Заголовки для Live/trace (FZ-B4 / POC-A/B/C). Без сырых payload/Cookie."""
    titles = [_live_summary_title(summary)]
    digest_path = str(summary.get("digest_path") or "")
    if digest_path:
        # Только имя файла — не полный путь с возможными секретами в каталогах.
        titles.append(f"Audit digest: {Path(digest_path).name}")
    detail, omitted = _live_anomaly_detail_titles(
        summary, cap=max(0, int(anomaly_detail_cap))
    )
    titles.extend(detail)
    if omitted > 0:
        titles.append(f"Ещё отклонений: {omitted} (см. evidence/digest)")
    return titles


def evidence_contains_raw_payload(summary: Dict[str, object], payloads: Iterable[str]) -> bool:
    """True, если хоть один сырой payload встречается в JSON-сводке.

    Короткие маркеры (<3 символов) пропускаем: ``'`` / ``\"`` дают ложные
    срабатывания на JSON-кавычках и не несут секретов.
    """
    blob = json.dumps(summary, ensure_ascii=False)
    for payload in payloads:
        if not payload or len(payload) < 3:
            continue
        if payload in blob:
            return True
    return False


class FuzzCampaignRunner:
    """Исполняет Campaign через ScannerAdapter-подобный объект (scanner_http_request)."""

    def __init__(self, scanner: Any) -> None:
        self.scanner = scanner

    def resolve_message_url(
        self, message: FuzzMessage, *, base_url: str
    ) -> tuple[str, str, Dict[str, str], bool]:
        """Вернуть (method, url, headers, follow_redirects) с same-origin guard."""
        if message.source == "template":
            url = (message.url or "").strip()
            if not url:
                raise WiredError("Фаззер: template URL пуст")
            assert_same_origin(url, base_url)
            method = (message.method or "GET").strip().upper() or "GET"
            return method, url, dict(message.headers or {}), bool(message.follow_redirects)

        if message.source == "history":
            getter = getattr(self.scanner, "get_messages", None)
            if not callable(getter):
                raise WiredError(
                    "Фаззер History: у scanner нет get_messages "
                    "(нужен ScannerAdapter или fake с History)"
                )
            messages = getter()
            picked = pick_message_from_history(
                messages,
                url_contains=message.history_url_contains or message.url,
                method=message.history_method or message.method or "GET",
                base_url=base_url,
            )
            # POC-A: History headers (Cookie/Authorization) + явный override.
            headers = merge_request_headers(
                picked.get("headers") or {},
                message.headers or {},
            )
            return (
                picked["method"],
                picked["url"],
                headers,
                bool(message.follow_redirects),
            )

        raise WiredError(f"Фаззер: неизвестный message.source {message.source!r}")

    @staticmethod
    def _materialize_payloads(
        campaign: Campaign, policy: FuzzPolicy
    ) -> list[PayloadVector]:
        # DF-11: str или tuple-вектор; не требуем плоский list[str].
        if campaign.payloads and all(isinstance(p, str) for p in campaign.payloads):
            return load_string_corpus(
                list(campaign.payloads),
                limit=policy.max_requests,
                name=campaign.module_id or "campaign",
            )
        return clamp_payload_vectors(
            campaign.payloads,
            limit=policy.max_requests,
            name=campaign.module_id or "campaign",
        )

    def _fire_one_payload_case(
        self,
        *,
        index: int,
        payload: PayloadVector,
        campaign: Campaign,
        policy: FuzzPolicy,
        target_url: str,
        body_template: str,
        method: str,
        headers: Dict[str, str],
        follow: bool,
        base_url: str,
        baseline: ResponseMetrics,
        auth_fail_streak: int,
    ) -> tuple[EvidenceRow, int, str | None]:
        case_url = apply_location(target_url, campaign.location, payload)
        case_body = apply_mask_template(body_template, payload) if body_template else None
        assert_same_origin(case_url, base_url)
        metrics, transport_error, response_body = self._send_safe(
            case_url,
            method=method,
            headers=headers,
            body=case_body,
            follow_redirects=follow,
        )
        deltas = anomaly_reasons(
            baseline,
            metrics,
            transport_error,
            alert_on_server_error=policy.alert_on_server_error,
            latency_multiplier=policy.latency_multiplier,
            size_ratio=policy.size_ratio,
            size_abs_delta=policy.size_abs_delta,
            reflected=payload_reflected_in_body(payload, response_body),
        )
        status = metrics.status if metrics else None
        streak = auth_fail_streak + 1 if status in (401, 403) else 0
        stopped_reason: str | None = None
        if streak >= SESSION_LOST_STREAK:
            if "session_lost" not in deltas:
                deltas = list(deltas) + ["session_lost"]
            stopped_reason = "session_lost"
        payload_sha, payload_len = payload_evidence_meta(payload)
        row = EvidenceRow(
            index=index,
            payload_sha256=payload_sha,
            payload_length=payload_len,
            status=status,
            latency_ms=metrics.latency_ms if metrics else None,
            body_bytes=metrics.body_bytes if metrics else None,
            body_sha256=metrics.body_sha256 if metrics else None,
            deltas=tuple(deltas),
            request_url_sha256=sha256_text(case_url),
            transport_error=transport_error,
        )
        return row, streak, stopped_reason

    def _fire_payload_cases(
        self,
        *,
        payloads: list[PayloadVector],
        campaign: Campaign,
        policy: FuzzPolicy,
        target_url: str,
        body_template: str,
        method: str,
        headers: Dict[str, str],
        follow: bool,
        base_url: str,
        baseline: ResponseMetrics,
    ) -> tuple[list[EvidenceRow], str | None]:
        rows: list[EvidenceRow] = []
        interval = 1.0 / float(policy.requests_per_second)
        auth_fail_streak = 0
        stopped_reason: str | None = None
        for index, payload in enumerate(payloads, start=1):
            started = time.monotonic()
            row, auth_fail_streak, stopped_reason = self._fire_one_payload_case(
                index=index,
                payload=payload,
                campaign=campaign,
                policy=policy,
                target_url=target_url,
                body_template=body_template,
                method=method,
                headers=headers,
                follow=follow,
                base_url=base_url,
                baseline=baseline,
                auth_fail_streak=auth_fail_streak,
            )
            rows.append(row)
            # B-5: beam telemetry per payload case
            _publish_beam(
                "PAYLOAD_MUTATION",
                run_id=target_url,  # используется для контекста
                module_id=campaign.module_id or "",
                target_origin=origin_of(target_url),
            )
            if row.deltas:
                _publish_beam(
                    "TARGET_HIT",
                    run_id=target_url,
                    module_id=campaign.module_id or "",
                    target_origin=origin_of(target_url),
                    target_node=target_url,
                    severity="high" if "server_error" in row.deltas else "low",
                    anomaly_flag=True,
                )
            if stopped_reason:
                break
            remaining = interval - (time.monotonic() - started)
            if remaining > 0 and index < len(payloads):
                time.sleep(remaining)
        return rows, stopped_reason

    @staticmethod
    def _assert_redact_clean(
        blob_obj: Dict[str, object],
        *,
        headers: Dict[str, str],
        payloads: list[PayloadVector],
        redact_payloads: bool,
        label: str,
    ) -> None:
        if redact_payloads and evidence_contains_raw_payload(blob_obj, payloads):
            raise WiredError(f"Фаззер: сырой payload попал в {label}")
        blob = json.dumps(blob_obj, ensure_ascii=False)
        for key, value in headers.items():
            if key.lower() in _SENSITIVE_REQUEST_HEADERS and value and value in blob:
                raise WiredError(
                    f"Фаззер: утечка заголовка {key!r} в {label} — redact сломан"
                )

    def run(
        self,
        campaign: Campaign,
        *,
        base_url: str,
        reports_dir: Path | None = None,
        storage_meta: Dict[str, object] | None = None,
    ) -> Dict[str, object]:
        policy = campaign.policy.clamped()
        payloads = self._materialize_payloads(campaign, policy)
        method, target_url, headers, follow = self.resolve_message_url(
            campaign.message, base_url=base_url
        )
        valid_methods = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
        if method not in valid_methods:
            raise WiredError(
                f"Фаззер: поддержаны только {sorted(valid_methods)}, получено {method!r}"
            )

        run_id = (
            f"fuzz-{campaign.module_id or 'campaign'}-{uuid.uuid4().hex[:12]}"
        )
        # B-5: beam start — публикуем до первого запроса
        _publish_beam(
            "FUZZ_BEAM_START",
            run_id=run_id,
            module_id=campaign.module_id or "",
            target_origin=origin_of(
                target_url if method else (campaign.message.template or "")
            ),
            payload_hash="",
            channeling_stage="warmup",
        )
        session_meta = session_bound_meta(headers, storage_meta=storage_meta)
        body_template = campaign.message.body or ""
        slot_n = count_mask_slots(f"{target_url} {body_template}")
        baseline_payload: PayloadVector = (
            "" if slot_n <= 1 else tuple("" for _ in range(slot_n))
        )
        baseline_body = (
            apply_mask_template(body_template, baseline_payload) if body_template else None
        )
        baseline_url = (
            apply_location(target_url, campaign.location, baseline_payload)
            if campaign.location.kind == "mask"
            else target_url
        )
        target_origin = origin_of(target_url)
        alert_scope = base_url_of(target_url)
        alerts_before = snapshot_alert_fingerprints(
            self.scanner, baseurl=alert_scope
        )
        baseline = self._send(
            baseline_url,
            method=method,
            headers=headers,
            body=baseline_body,
            follow_redirects=follow,
        )
        rows, stopped_reason = self._fire_payload_cases(
            payloads=payloads,
            campaign=campaign,
            policy=policy,
            target_url=target_url,
            body_template=body_template,
            method=method,
            headers=headers,
            follow=follow,
            base_url=base_url,
            baseline=baseline,
        )
        # DF-13: passive alerts после серии ударов → scanner_alert в deltas.
        scanner_alerts = new_alerts_for_origin(
            self.scanner,
            origin=target_origin,
            before=alerts_before,
            baseurl=alert_scope,
        )
        if scanner_alerts:
            rows = apply_scanner_alerts_to_rows(rows, scanner_alerts)

        evidence = Evidence(
            run_id=run_id,
            module_id=campaign.module_id,
            message_source=campaign.message.source,
            target_origin=target_origin,
            location={
                "kind": campaign.location.kind,
                "name": campaign.location.name,
            },
            baseline=baseline,
            rows=rows,
        )
        if stopped_reason:
            evidence.verdict = stopped_reason
        summary = evidence.as_summary()
        summary.update(session_meta)
        summary["method"] = method
        summary["stopped_reason"] = stopped_reason
        summary["scanner_alerts"] = scanner_alerts
        summary["scanner_alerts_total"] = len(scanner_alerts)
        summary["policy"] = {
            "max_requests": policy.max_requests,
            "requests_per_second": policy.requests_per_second,
            "alert_on_server_error": policy.alert_on_server_error,
            "latency_multiplier": policy.latency_multiplier,
            "size_ratio": policy.size_ratio,
            "size_abs_delta": policy.size_abs_delta,
        }
        summary["reason_counts"] = count_anomaly_reasons(summary)
        self._assert_redact_clean(
            summary,
            headers=headers,
            payloads=payloads,
            redact_payloads=policy.redact_payloads,
            label="evidence",
        )
        summary["evidence_path"] = write_evidence_json(summary, reports_dir)
        evidence.evidence_path = str(summary["evidence_path"])
        digest = build_audit_digest(summary)
        digest["evidence_path"] = summary["evidence_path"]
        self._assert_redact_clean(
            digest,
            headers=headers,
            payloads=payloads,
            redact_payloads=policy.redact_payloads,
            label="audit digest",
        )
        summary["digest_path"] = write_audit_digest(digest, reports_dir)
        digest["digest_path"] = summary["digest_path"]
        # DF-14: findings pack (+ Allure attach, если есть контекст теста).
        export_meta = export_fuzz_security_artifacts(summary, reports_dir=reports_dir)
        summary["findings_path"] = export_meta.get("findings_path") or ""
        summary["reporting"] = export_meta
        # B-5: beam end — финальный вердикт
        _publish_beam(
            "BEAM_END",
            run_id=run_id,
            module_id=campaign.module_id or "",
            target_origin=target_origin,
            verdict=stopped_reason or "observations_require_review",
        )
        return summary

    def _send(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: Dict[str, str],
        body: str | None = None,
        follow_redirects: bool,
    ) -> ResponseMetrics:
        metrics, error, _body = self._send_safe(
            url,
            method=method,
            headers=headers,
            body=body,
            follow_redirects=follow_redirects,
        )
        if metrics is None:
            raise WiredError(f"Фаззер baseline не получен: {error or 'unknown error'}")
        return metrics

    def _send_safe(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: Dict[str, str],
        body: str | None = None,
        follow_redirects: bool,
    ) -> tuple[ResponseMetrics | None, str, str]:
        """Возвращает (metrics|None, transport_error, response_body). Body только для reflection."""
        started = time.monotonic()
        try:
            response = self.scanner.scanner_http_request(
                method,
                url,
                headers=dict(headers or {}),
                body=body,
                follow_redirects=bool(follow_redirects),
            )
        except Exception as exc:
            return None, type(exc).__name__, ""
        elapsed_ms = max(0, int((time.monotonic() - started) * 1000))
        resp_body = str((response or {}).get("body") or "")
        return (
            ResponseMetrics(
                status=int((response or {}).get("status") or 0),
                latency_ms=elapsed_ms,
                body_bytes=len(resp_body.encode("utf-8")),
                body_sha256=sha256_text(resp_body),
            ),
            "",
            resp_body,
        )


class FuzzRunner:
    """Адаптер: модуль «Фаззер» + fuzzing_fields → Campaign (эксперимент, не канон)."""

    def __init__(self, wired: Any, scanner: Any, stream: Any) -> None:
        self.wired = wired
        self.scanner = scanner
        self.stream = stream
        self._campaign_runner = FuzzCampaignRunner(scanner)

    def run(self, module_id: str) -> Dict[str, object]:
        module = self._module(module_id)
        spec = getattr(module, "fuzzing_fields", None)
        if spec is None:
            raise WiredError(f"Фаззер {module_id!r}: нет fuzzing_fields")

        request = spec.request
        injection = spec.injection
        limits = spec.limits
        observation = spec.observation
        base_url = self._base_url()
        target_url = self._resolve(request.url)
        corpus_name = injection.corpus
        raw_corpus = self.stream.get_path(corpus_name)
        payloads = load_string_corpus(
            raw_corpus,
            limit=limits.max_requests,
            name=corpus_name,
        )
        # Resolve leaf vars в строках corpus (если stream умеет).
        payloads = [self._resolve(p) for p in payloads]

        campaign = Campaign(
            message=FuzzMessage(
                source="template",
                method=getattr(request, "method", None) or "GET",
                url=target_url,
                headers=dict(getattr(request, "headers", None) or {}),
                follow_redirects=bool(getattr(request, "follow_redirects", True)),
            ),
            location=FuzzLocation(
                kind="query_param",
                name=str(injection.query_param),
            ),
            payloads=payloads,
            policy=FuzzPolicy(
                max_requests=int(limits.max_requests),
                requests_per_second=float(limits.requests_per_second),
                alert_on_server_error=bool(observation.alert_on_server_error),
                latency_multiplier=float(observation.latency_multiplier),
                redact_payloads=True,
            ),
            module_id=module_id,
        )
        return self._campaign_runner.run(campaign, base_url=base_url)

    def _module(self, module_id: str) -> Any:
        wanted = (module_id or "").strip()
        if not wanted:
            raise WiredError("Фазз Запустить: нужен id модуля")
        suites = getattr(self.wired, "test_suites", None)
        for module in getattr(suites, "test_data_constructor", None) or []:
            if (
                getattr(module, "module_type", None) == "Фаззер"
                and getattr(module, "id", None) == wanted
            ):
                return module
        raise WiredError(f"Фаззер {wanted!r} не найден")

    def _base_url(self) -> str:
        scan = getattr(self.wired, "scan_base_url", None)
        value = scan() if callable(scan) else None
        if not value:
            security = getattr(self.wired, "security_configuration", None)
            value = getattr(security, "base_url_override", None) if security else None
        resolved = self._resolve(value or "")
        if not resolved:
            raise WiredError("Фаззер: нужен infrastructure.base_url_override")
        return resolved

    def _resolve(self, value: object) -> str:
        resolver = getattr(self.stream, "resolve_arg", None)
        resolved = resolver(value) if resolver else value
        return str(resolved or "").strip()


def _legacy_fuzz_location(legacy_location: Any) -> FuzzLocation | None:
    loc_name = getattr(legacy_location, "name", None) or (
        legacy_location.get("name") if isinstance(legacy_location, dict) else None
    )
    if not loc_name:
        return None
    loc_kind = getattr(legacy_location, "kind", None) or (
        legacy_location.get("kind") if isinstance(legacy_location, dict) else "query_param"
    )
    return FuzzLocation(
        kind=loc_kind or "query_param",  # type: ignore[arg-type]
        name=str(loc_name),
    )


def deduce_target_location(
    url: str,
    method: str,
    body: str | None = None,
    legacy_location: Any | None = None,
) -> FuzzLocation:
    """Определить тип и имя дырки на основе HTTP-метода, URL и тела (авто-дырка)."""
    del method
    if _MASK_RE.search(f"{url} {body or ''}"):
        return FuzzLocation(kind="mask", name="{MASK}")
    if legacy_location:
        legacy = _legacy_fuzz_location(legacy_location)
        if legacy is not None:
            return legacy
    if "?" in url:
        query_part = url.split("?", 1)[1]
        if query_part:
            first_param = query_part.split("&", 1)[0].split("=", 1)[0].strip()
            if first_param:
                return FuzzLocation(kind="query_param", name=first_param)
    return FuzzLocation(kind="query_param", name="q")


def _spec_attr(spec: Any, name: str) -> Any:
    raw = getattr(spec, name, None)
    if raw is None and isinstance(spec, dict):
        return spec.get(name)
    return raw


def resolve_wave_mode(spec: Any) -> WaveMode:
    """DF-12: ``wave_mode`` или ``algorithm`` ∈ {sniper,pitchfork,cluster_bomb}.

    ``algorithm=triples`` (Studio default) и прочее → sniper. SoT-поле не добавляем.
    """
    raw = _spec_attr(spec, "wave_mode")
    if raw is None or str(raw).strip() == "":
        algo_s = (
            str(_spec_attr(spec, "algorithm") or "")
            .strip()
            .lower()
            .replace("-", "_")
            .replace(" ", "_")
        )
        if algo_s in ("sniper", "pitchfork", "cluster_bomb", "clusterbomb"):
            raw = "cluster_bomb" if algo_s == "clusterbomb" else algo_s
        else:
            raw = "sniper"
    key = str(raw).strip().lower().replace("-", "_").replace(" ", "_")
    if key == "clusterbomb":
        key = "cluster_bomb"
    if key not in ("sniper", "pitchfork", "cluster_bomb"):
        raise WiredError(
            f"ФаззингВолна: wave_mode {raw!r} — ожидали "
            "sniper | pitchfork | cluster_bomb"
        )
    return key  # type: ignore[return-value]


def matrix_payload_plans(
    payload_lists: Sequence[Sequence[PayloadVector]],
    *,
    mode: WaveMode,
    max_requests: int,
) -> tuple[list[list[PayloadVector]], str | None]:
    """DF-12: выровнять payloads по targets для pitchfork / cluster_bomb.

    Возвращает (payloads_per_target, stopped_reason|None).
    """
    if not payload_lists:
        return [], None
    if len(payload_lists) == 1 or mode == "sniper":
        return [list(p) for p in payload_lists], None

    cap = max(1, min(int(max_requests), POC_MAX_REQUESTS))
    lists = [list(p) for p in payload_lists]
    if any(not L for L in lists):
        raise WiredError("Фаззер DF-12: пустой corpus у одной из целей матрицы")

    if mode == "pitchfork":
        n = min(len(L) for L in lists)
        n = min(n, cap)
        return [L[:n] for L in lists], None

    # cluster_bomb: декартово; cap = число комбинаций (раундов).
    full_size = 1
    for L in lists:
        full_size *= len(L)
    combos = list(islice(product(*lists), cap))
    stopped = "matrix_capped" if full_size > len(combos) else None
    per_target: list[list[PayloadVector]] = [[] for _ in lists]
    for combo in combos:
        for i, cell in enumerate(combo):
            per_target[i].append(cell)
    return per_target, stopped


class SuiteFuzzerRunner:
    """Канон: test_suites.fuzzers[] → Campaign (MethodId ФаззингВолна)."""

    INTENT_DIR = Path(__file__).resolve().parents[1] / "data" / "fuzz"

    def __init__(
        self,
        wired: Any,
        scanner: Any,
        stream: Any,
        *,
        browser: Any | None = None,
    ) -> None:
        self.wired = wired
        self.scanner = scanner
        self.stream = stream
        self.browser = browser
        self._campaign_runner = FuzzCampaignRunner(scanner)
        self._storage_meta: Dict[str, object] | None = None
        self._http_sessions_meta: Dict[str, object] | None = None

    @staticmethod
    def _normalize_targets(spec: Any) -> list[Dict[str, Any]]:
        raw_targets = getattr(spec, "targets", None) or []
        targets: list[Dict[str, Any]] = []
        for t in raw_targets:
            if hasattr(t, "model_dump"):
                targets.append(t.model_dump())
            elif isinstance(t, dict):
                targets.append(t)
            else:
                targets.append({
                    "url": getattr(t, "url", ""),
                    "method": getattr(t, "method", "GET"),
                    "corpus": getattr(t, "corpus", ""),
                })
        if targets:
            return targets
        msg = getattr(spec, "message", None)
        loc = getattr(spec, "location", None)
        corp = getattr(spec, "corpus", None)
        url = getattr(msg, "url", "") if msg else ""
        method = getattr(msg, "method", "GET") if msg else "GET"
        if url and corp:
            return [{
                "url": url,
                "method": method,
                "corpus": corp,
                "legacy_location": loc,
            }]
        return []

    @staticmethod
    def _policy_knobs(policy_spec: Any) -> FuzzPolicy:
        return FuzzPolicy(
            max_requests=int(getattr(policy_spec, "max_requests", 25)),
            requests_per_second=float(getattr(policy_spec, "requests_per_second", 1.0)),
            alert_on_server_error=bool(
                getattr(policy_spec, "alert_on_server_error", True)
            ),
            latency_multiplier=float(getattr(policy_spec, "latency_multiplier", 3.0)),
            size_ratio=float(getattr(policy_spec, "size_ratio", POC_SIZE_RATIO)),
            size_abs_delta=int(getattr(policy_spec, "size_abs_delta", POC_SIZE_ABS_DELTA)),
            redact_payloads=True,
        )

    @staticmethod
    def _aggregate_wave(
        *,
        fuzzer_id: str,
        spec: Any,
        target_summaries: list[Dict[str, object]],
        headers: Dict[str, str],
        session_replay: bool,
        wave_mode: WaveMode = "sniper",
        matrix_stopped: str | None = None,
    ) -> Dict[str, object]:
        total_requests = sum(
            int(s.get("cases_total", s.get("requests_count", 0))) for s in target_summaries
        )
        total_anomalies = sum(
            int(s.get("anomalies_count", s.get("anomalies_total", 0)))
            for s in target_summaries
        )
        stopped = matrix_stopped or next(
            (
                str(s.get("stopped_reason") or "")
                for s in target_summaries
                if s.get("stopped_reason")
            ),
            "",
        )
        wave_summary: Dict[str, object] = {
            "module_id": fuzzer_id,
            "fuzzer_id": fuzzer_id,
            "algorithm": getattr(spec, "algorithm", "triples") or "triples",
            "wave_mode": wave_mode,
            "targets_count": len(target_summaries),
            "requests_count": total_requests,
            "anomalies_count": total_anomalies,
            "status": _wave_status(stopped, total_anomalies),
            "stopped_reason": stopped or None,
            "session_bound": headers_have_session(headers) if session_replay else False,
            "target_summaries": target_summaries,
        }
        _copy_first_target_meta(wave_summary, target_summaries)
        return wave_summary

    def _wave_session_headers(
        self,
        *,
        fuzzer_id: str,
        headers: Dict[str, str],
        history_contains: str,
        history_method: str,
        base_url: str,
        session_replay: bool,
    ) -> Dict[str, str]:
        if not session_replay:
            return headers
        headers = self._apply_session_replay(
            headers,
            url_contains=history_contains,
            method=history_method,
            base_url=base_url,
        )
        if not headers_have_session(headers):
            raise WiredError(
                f"ФаззингВолна {fuzzer_id!r}: session_replay=true, но в scanner History "
                "нет Cookie/Authorization для origin цели (session_missing)"
            )
        try:
            from core.session_bridge import read_http_sessions_snapshot

            self._http_sessions_meta = read_http_sessions_snapshot(
                self.scanner, base_url=base_url
            )
        except Exception:
            self._http_sessions_meta = None
        return headers

    def _build_target_plans(
        self,
        *,
        targets: list,
        spec: Any,
        load_limit: int,
    ) -> tuple[list[Dict[str, Any]], list[list[PayloadVector]]]:
        plans: list[Dict[str, Any]] = []
        payload_lists: list[list[PayloadVector]] = []
        for target in targets:
            url = self._resolve(target.get("url") or "")
            method = str(target.get("method") or "GET").upper()
            body_template = self._resolve(target.get("body") or "")
            legacy_loc = target.get("legacy_location") or getattr(spec, "location", None)
            location = deduce_target_location(url, method, body_template, legacy_loc)
            hole = classify_fuzz_hole(url, method, body_template, location)
            corpus_name = resolve_corpus_spec(
                str(target.get("corpus") or ""), hole_kind=hole
            )
            mask_slots = count_mask_slots(f"{url} {body_template}")
            payloads = self._load_payloads(
                corpus_name, limit=load_limit, mask_slots=mask_slots
            )
            plans.append(
                {
                    "url": url,
                    "method": method,
                    "body_template": body_template,
                    "location": location,
                    "corpus": corpus_name,
                    "hole": hole,
                }
            )
            payload_lists.append(payloads)
        return plans, payload_lists

    def _attach_wave_side_meta(self, wave: Dict[str, object]) -> Dict[str, object]:
        if self._storage_meta:
            for key in (
                "has_storage_token",
                "storage_token_key",
                "storage_key_names",
                "storage_keys_count",
                "session_source",
            ):
                if key in self._storage_meta and key not in wave:
                    wave[key] = self._storage_meta[key]
        if self._http_sessions_meta:
            for key, value in self._http_sessions_meta.items():
                if key not in wave:
                    wave[key] = value
        # CONN-11 hook: opt-in Prometheus probe after wave (meta only, no secrets)
        try:
            from utils.connector_ops import probe_after_fuzz_meta

            cmeta = probe_after_fuzz_meta(self.wired)
            for key, value in cmeta.items():
                if key not in wave:
                    wave[key] = value
            digest_path = str(wave.get("digest_path") or "").strip()
            if cmeta and digest_path:
                self._patch_digest_with_connector_meta(digest_path, cmeta)
        except Exception as exc:  # noqa: BLE001 — probe never fails wave
            wave.setdefault("connector_probe_notes", [f"probe soft-fail: {exc}"])
        return wave

    @staticmethod
    def _patch_digest_with_connector_meta(
        digest_path: str, cmeta: Dict[str, object]
    ) -> None:
        try:
            dpath = Path(digest_path)
            if not dpath.is_file():
                return
            digest_obj = json.loads(dpath.read_text(encoding="utf-8"))
            if not isinstance(digest_obj, dict):
                return
            for key, value in cmeta.items():
                digest_obj[key] = value
            dpath.write_text(
                json.dumps(digest_obj, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        except Exception:  # noqa: BLE001 — digest patch never fails wave
            return

    def _maybe_feed_traffic_targets(
        self, targets: list[Dict[str, Any]], *, base_url: str
    ) -> tuple[list[Dict[str, Any]], Dict[str, object]]:
        """TRAF-A2: opt-in ``PK_TRAFFIC_INSERTION_FEED`` → mine History → targets."""
        meta: Dict[str, object] = {"traffic_feed": False, "traffic_points": 0}
        try:
            from utils.traffic_insertion_points import (
                feed_targets_from_history,
                traffic_feed_enabled,
            )
        except Exception:  # noqa: BLE001
            return targets, meta
        if not traffic_feed_enabled():
            return targets, meta
        getter = getattr(self.scanner, "get_messages", None)
        if not callable(getter):
            meta["traffic_feed"] = "no_get_messages"
            return targets, meta
        try:
            messages = getter() or []
        except Exception as exc:  # noqa: BLE001
            meta["traffic_feed"] = f"history_error:{exc}"
            return targets, meta
        needle = ""
        try:
            from urllib.parse import urlsplit

            needle = urlsplit(base_url).netloc or ""
        except Exception:  # noqa: BLE001
            needle = ""
        merged = feed_targets_from_history(
            messages,
            existing=targets,
            corpus="auto",
            limit=40,
            base_url_contains=needle,
        )
        meta["traffic_feed"] = True
        meta["traffic_points"] = max(0, len(merged) - len(targets))
        return merged, meta

    def run(self, fuzzer_id: str) -> Dict[str, object]:
        spec = self._fuzzer(fuzzer_id)
        base_url = self._base_url()
        policy_spec = getattr(spec, "policy", None) or FuzzPolicy()
        targets = self._normalize_targets(spec)
        targets, traffic_meta = self._maybe_feed_traffic_targets(
            targets, base_url=base_url
        )
        if not targets:
            raise WiredError(
                f"ФаззингВолна {fuzzer_id!r}: нет целей targets[]"
                + (
                    " (traffic feed пуст — History без query/JSON)"
                    if traffic_meta.get("traffic_feed")
                    else ""
                )
            )

        headers = dict(getattr(spec, "headers", None) or {})
        session_replay = bool(getattr(spec, "session_replay", True))
        follow_redirects = bool(getattr(spec, "follow_redirects", True))

        msg_spec = getattr(spec, "message", None)
        if not headers and msg_spec:
            headers = dict(getattr(msg_spec, "headers", None) or {})

        history_contains = self._resolve(
            getattr(msg_spec, "history_url_contains", None) or "" if msg_spec else ""
        )
        history_method = ""
        if msg_spec:
            history_method = str(
                getattr(msg_spec, "history_method", None) or ""
            ).strip().upper()

        headers = self._wave_session_headers(
            fuzzer_id=fuzzer_id,
            headers=headers,
            history_contains=history_contains,
            history_method=history_method,
            base_url=base_url,
            session_replay=session_replay,
        )

        wave_mode = resolve_wave_mode(spec)
        policy = self._policy_knobs(policy_spec)
        # Для матрицы сначала читаем корпуса до hard cap ядра, потом режем mode-логикой.
        load_limit = (
            POC_MAX_REQUESTS
            if wave_mode in ("pitchfork", "cluster_bomb") and len(targets) > 1
            else policy.max_requests
        )

        plans, payload_lists = self._build_target_plans(
            targets=targets, spec=spec, load_limit=load_limit
        )
        aligned, matrix_stopped = matrix_payload_plans(
            payload_lists,
            mode=wave_mode,
            max_requests=policy.max_requests,
        )

        target_summaries: list[Dict[str, object]] = []
        for plan, payloads in zip(plans, aligned):
            campaign = Campaign(
                message=FuzzMessage(
                    source="template",
                    method=plan["method"],
                    url=plan["url"],
                    body=plan["body_template"],
                    headers=headers,
                    follow_redirects=follow_redirects,
                    history_url_contains=history_contains,
                ),
                location=plan["location"],
                payloads=payloads,
                policy=policy,
                module_id=fuzzer_id,
            )
            summary = self._campaign_runner.run(
                campaign,
                base_url=base_url,
                storage_meta=self._storage_meta,
            )
            if matrix_stopped and not summary.get("stopped_reason"):
                summary["stopped_reason"] = matrix_stopped
            target_summaries.append(summary)

        wave = self._aggregate_wave(
            fuzzer_id=fuzzer_id,
            spec=spec,
            target_summaries=target_summaries,
            headers=headers,
            session_replay=session_replay,
            wave_mode=wave_mode,
            matrix_stopped=matrix_stopped,
        )
        for key, value in traffic_meta.items():
            wave.setdefault(key, value)
        return self._attach_wave_side_meta(wave)

    def _fuzzer(self, fuzzer_id: str) -> Any:
        wanted = (fuzzer_id or "").strip()
        if not wanted:
            raise WiredError("ФаззингВолна: нужен id fuzzer")
        suites = getattr(self.wired, "test_suites", None)
        for item in getattr(suites, "fuzzers", None) or []:
            if getattr(item, "id", None) == wanted:
                return item
        raise WiredError(f"Fuzzer {wanted!r} не найден в test_suites.fuzzers")

    def _iter_named_corpus(self, corpus_name: str, *, limit: int) -> Iterator[str]:
        """Стрим одного корпуса: intent_*.txt (pack) или resource list из stream."""
        name = (corpus_name or "").strip()
        if not name:
            raise WiredError("ФаззингВолна: corpus пуст")
        if name.startswith("intent_") or name == "juice_search_lab":
            path = self.INTENT_DIR / f"{name}.txt"
            try:
                from utils.fuzz_dict_pack import corpus_max_lines

                pack_cap = corpus_max_lines(name)
            except Exception:  # noqa: BLE001
                pack_cap = POC_MAX_REQUESTS
            capped = max(1, min(int(limit), int(pack_cap), POC_MAX_REQUESTS))
            return iter_corpus_file(path, limit=capped, name=name)
        raw = self.stream.get_path(name)
        return iter_string_corpus(raw, limit=limit, name=name)

    def _load_payloads(
        self,
        corpus_name: str,
        *,
        limit: int,
        mask_slots: int = 1,
    ) -> list[PayloadVector]:
        """DF-11: один корпус / TAB-строки / pitchfork ``a,b`` → векторы масок."""
        names = parse_corpus_names(corpus_name)
        capped = max(1, min(int(limit), POC_MAX_REQUESTS))
        slots = max(1, int(mask_slots))

        if len(names) == 1:
            rows: list[PayloadVector] = []
            for line in self._iter_named_corpus(names[0], limit=capped):
                resolved = self._resolve(line)
                rows.append(split_payload_line(resolved, slots=slots))
            if not rows:
                raise WiredError(f"Фаззер: corpus ${{{names[0]}}} пуст")
            return rows

        # Pitchfork: MASK_i ← corpus_i, длина = min(потоков), cap = capped.
        iterators = [self._iter_named_corpus(n, limit=capped) for n in names]
        zipped: list[PayloadVector] = []
        for row in zip(*iterators):
            resolved_row = tuple(self._resolve(cell) for cell in row)
            zipped.append(resolved_row)
            if len(zipped) >= capped:
                break
        if not zipped:
            raise WiredError(
                f"Фаззер: multi-corpus {names!r} пуст (pitchfork zip)"
            )
        return zipped

    def _apply_storage_replay(self, base_headers: Dict[str, str]) -> Dict[str, str]:
        """S-1: JWT из browser local/sessionStorage → Authorization (если ещё нет)."""
        if headers_have_session(base_headers) and any(
            str(k).lower() == "authorization" for k in (base_headers or {})
        ):
            return dict(base_headers)
        browser = self.browser
        if browser is None:
            return dict(base_headers)
        try:
            from core.session_bridge import (
                browser_storage_meta,
                read_browser_storage_maps,
                request_headers_from_browser_storage,
            )
        except ImportError:
            return dict(base_headers)
        local_map, session_map = read_browser_storage_maps(browser)
        self._storage_meta = browser_storage_meta(local_map, session_map)
        return request_headers_from_browser_storage(
            local_map,
            session_map,
            base_headers=base_headers,
        )

    def _apply_session_replay(
        self,
        base_headers: Dict[str, str],
        *,
        url_contains: str,
        method: str,
        base_url: str,
    ) -> Dict[str, str]:
        """History Cookie/Authorization, затем storage JWT (S-1), без пустого success."""
        headers = dict(base_headers)
        if headers_have_session(headers) and not url_contains:
            # Явные credentials в fuzzer.headers — History не обязателен.
            return self._apply_storage_replay(headers)
        getter = getattr(self.scanner, "get_messages", None)
        if callable(getter):
            try:
                picked_headers = pick_session_headers_from_history(
                    getter(),
                    base_url=base_url,
                    url_contains=url_contains,
                    method=method,
                )
                headers = merge_request_headers(picked_headers, headers)
            except WiredError:
                pass
        return self._apply_storage_replay(headers)

    def _merge_history_session_headers(
        self,
        base_headers: Dict[str, str],
        *,
        url_contains: str,
        method: str,
        base_url: str,
    ) -> Dict[str, str]:
        """Совместимость: делегирует в ``_apply_session_replay``."""
        return self._apply_session_replay(
            base_headers,
            url_contains=url_contains,
            method=method,
            base_url=base_url,
        )

    def _base_url(self) -> str:
        scan = getattr(self.wired, "scan_base_url", None)
        value = scan() if callable(scan) else None
        if not value:
            security = getattr(self.wired, "security_configuration", None)
            value = getattr(security, "base_url_override", None) if security else None
        resolved = self._resolve(value or "")
        if not resolved:
            raise WiredError(
                "ФаззингВолна: нужен infrastructure.base_url_override"
            )
        return resolved

    def _resolve(self, value: object) -> str:
        resolver = getattr(self.stream, "resolve_arg", None)
        resolved = resolver(value) if resolver else value
        return str(resolved or "").strip()


class FuzzAdapter:
    """ActionFactory-обёртка: stream привязывается Controller перед вызовом."""

    def __init__(
        self,
        wired: Any,
        scanner: Any,
        *,
        browser: Any | None = None,
    ) -> None:
        self.wired = wired
        self.scanner = scanner
        self.browser = browser
        self._stream: Any | None = None

    def bind(self, stream: Any) -> None:
        self._stream = stream

    def run(self, module_id: str) -> Dict[str, object]:
        if self._stream is None:
            raise WiredError("Фаззер: DataStream не привязан")
        return FuzzRunner(self.wired, self.scanner, self._stream).run(module_id)

    def wave(self, fuzzer_id: str) -> Dict[str, object]:
        if self._stream is None:
            raise WiredError("ФаззингВолна: DataStream не привязан")
        return SuiteFuzzerRunner(
            self.wired,
            self.scanner,
            self._stream,
            browser=self.browser,
        ).run(fuzzer_id)

    def _chain_fields_for_fuzz(self, mid: str) -> tuple[dict, list]:
        from utils.chain_runtime import resolve_chain_arg

        notes: list[str] = []
        resolved = resolve_chain_arg(
            self.wired,
            mid,
            wired_dir=getattr(self.scanner, "_wired_dir", None),
        )
        fields = dict(resolved.chain_fields or {})
        if not fields:
            raise WiredError(
                "ФаззингЦепи: "
                + ("; ".join(resolved.notes) or f"нет модуля Цепь {mid!r}")
            )
        fields["module_id"] = mid
        if resolved.har_as:
            fields.setdefault("har_as", resolved.har_as)
        fields["seed_fuzz_targets"] = True
        return fields, notes

    def _maybe_prepare_chain(self, mid: str, steps: list, notes: list[str]) -> None:
        from utils.chain_ops import ROLE_PRECONDITION, filter_steps_by_role

        pre = filter_steps_by_role(steps, ROLE_PRECONDITION)
        if not (pre and self.scanner is not None and hasattr(self.scanner, "prepare_chain_module")):
            return
        try:
            self.scanner.prepare_chain_module(mid)
            notes.append("prepare_chain ok")
        except WiredError as exc:
            notes.append(f"prepare_soft: {exc}")

    def fuzz_chain_module(self, module_id: str) -> Dict[str, object]:
        """
        MethodId ``ФаззингЦепи``: ПодготовитьЦепь (если есть pre) →
        sync attack targets в Fuzzer → ``ФаззингВолна``.
        """
        from utils.chain_ops import (
            ChainError,
            fuzz_targets_from_steps,
            materialize_chain_fields,
            resolve_chain_fuzzer_id,
            with_step_roles,
        )

        if self._stream is None:
            raise WiredError("ФаззингЦепи: DataStream не привязан")

        mid = str(module_id or "").strip()
        if not mid:
            raise WiredError("ФаззингЦепи: пустой id модуля Цепь")

        fields, notes = self._chain_fields_for_fuzz(mid)
        steps = with_step_roles(list(fields.get("steps") or []))
        self._maybe_prepare_chain(mid, steps, notes)

        try:
            built = materialize_chain_fields(
                fields, bindings=dict(fields.get("bindings") or {})
            )
        except ChainError as exc:
            raise WiredError(f"ФаззингЦепи materialize: {exc}") from exc
        notes.extend(built.get("notes") or [])

        attack_targets = list(built.get("fuzz_targets") or []) or fuzz_targets_from_steps(
            steps, attack_only=True
        )
        if not attack_targets:
            raise WiredError(
                "ФаззингЦепи: нет attack-шагов / targets "
                "(пометь role=attack или сними pre со всех)"
            )

        har_as = str(fields.get("har_as") or mid).strip() or mid
        try:
            fuzzer_id = resolve_chain_fuzzer_id(
                self.wired, har_as=har_as, module_id=mid
            )
        except ChainError as exc:
            raise WiredError(f"ФаззингЦепи: {exc}") from exc

        self._sync_fuzzer_attack_targets(fuzzer_id, attack_targets)
        notes.append(f"fuzzer={fuzzer_id} targets={len(attack_targets)}")

        wave = self.wave(fuzzer_id)
        if isinstance(wave, dict):
            wave = dict(wave)
            wave["chain_module_id"] = mid
            wave["chain_notes"] = notes
        return wave

    def _sync_fuzzer_attack_targets(
        self, fuzzer_id: str, attack_targets: list
    ) -> None:
        """Replace fuzzer targets with attack surface (corpus default intent_boundary)."""
        suites = getattr(self.wired, "test_suites", None)
        for item in getattr(suites, "fuzzers", None) or []:
            fid = getattr(item, "id", None)
            if fid is None and isinstance(item, dict):
                fid = item.get("id")
            if str(fid or "") != fuzzer_id:
                continue
            rows = [
                {
                    "url": str(t.get("url") or ""),
                    "method": str(t.get("method") or "GET").upper(),
                    "corpus": str(t.get("corpus") or "intent_boundary"),
                    "body": str(t.get("body") or ""),
                }
                for t in attack_targets
            ]
            if hasattr(item, "targets"):
                item.targets = rows
            elif isinstance(item, dict):
                item["targets"] = rows
            return
        raise WiredError(f"ФаззингЦепи: Fuzzer {fuzzer_id!r} пропал при sync")
