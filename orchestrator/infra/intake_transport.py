# -*- coding: utf-8 -*-
"""G4: Outbound intake transport — доставка StudioRunOutput в PrettyK Hub.

Реализует контрактный hand-off (PK-C-009, docs/contracts/studio-to-hub-intake.md §4)
двумя взаимозаменяемыми путями:

  1. HTTP Push  — `POST {hub_base}/api/v1/intake` с retry (backoff 1s / 2s / 4s),
     timeout 30s, идемпотентно по ``scan_id`` (Hub дедуплицирует).
  2. Airgap     — `run_package_<scan_id>.zip` с ``intake_payload.json``,
     ``manifest.json`` и каталогом ``evidence/`` для офлайн-передачи.

Инвариант fail-closed: если доставка не удалась (сеть/5xx исчерпали попытки,
либо Hub отверг payload как невалидный) и airgap-бандл не был создан, прогон
должен переводиться в ``INTAKE_FAILED`` — допуск не выдаётся.

Секреты не покидают контур: payload формируется только из полей DTO,
никакие токены/пароли не сериализуются.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, List, Optional

import requests

from orchestrator.contracts.studio_run_output import (
    CONTRACT_VERSION,
    HubIntakeResponse,
    StudioRunOutput,
)

logger = logging.getLogger(__name__)

DEFAULT_HUB_INTAKE_URL = "http://localhost:8200/api/v1/intake"
DEFAULT_TIMEOUT_S = 30.0
DEFAULT_ATTEMPTS = 3
# Экспоненциальный backoff для попыток 2..N (spec §4.1: 1s -> 2s -> 4s).
BACKOFF_SEQUENCE: tuple[float, ...] = (1.0, 2.0, 4.0)

# HTTP status code считается успехом интейка.
_OK_STATUSES = (200, 201)

# ── PRD-1: HMAC-подпись outbound transport (G4 follow-up) ──
#
# Envelope-конверт подписанного события Contract A:
#   {contract_version, scan_id, event_type, signature, ts, payload}
# Hub верифицирует `signature` до разбора payload (fail-closed).
HMAC_ALGORITHM = "hmac-sha256"
DEFAULT_EVENT_TYPE = "studio.run.output"
ENV_HMAC_SECRET = "PRETTYK_INTAKE_HMAC_SECRET"
SIGNATURE_HEADER = "X-PrettyK-Signature"
TIMESTAMP_HEADER = "X-PrettyK-Timestamp"
ENVELOPE_REQUIRED_FIELDS = (
    "contract_version",
    "scan_id",
    "event_type",
    "signature",
    "ts",
    "payload",
)


class IntakeSigningError(RuntimeError):
    """Ошибка конфигурации/верификации подписи (секрет отсутствует, формат битый)."""


def _secret_bytes(secret: Any) -> bytes:
    if isinstance(secret, bytes):
        return secret
    return str(secret).encode("utf-8")


def canonical_payload_bytes(payload: Any) -> bytes:
    """Канонический JSON для подписи: sorted keys, без пробелов, UTF-8.

    Одна и та же функция обязана использоваться и подписантом (Коробка),
    и верификатором (Hub) — иначе подпись не сойдётся.
    """
    return json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _signature_message(scan_id: str, event_type: str, ts: int, payload: Any) -> bytes:
    """Подписываемое сообщение: метаданные конверта + hash payload'а.

    Включение ``ts``/``scan_id``/``event_type`` в MAC не даёт переклеить
    метаданные конверта без пересчёта подписи (anti-tamper).
    """
    payload_hash = hashlib.sha256(canonical_payload_bytes(payload)).hexdigest()
    return f"{ts}\n{scan_id}\n{event_type}\n{payload_hash}".encode("utf-8")


class IntakeSigner:
    """HMAC-SHA256 подписант outbound intake-конверта (PRD-1).

    Секрет передаётся явно либо берётся из окружения (``ENV_HMAC_SECRET``).
    Секрет никогда не логируется и не попадает в ``repr``.
    """

    algorithm = HMAC_ALGORITHM

    def __init__(self, secret: Any, key_id: Optional[str] = None) -> None:
        if not secret:
            raise IntakeSigningError("HMAC secret is empty")
        self._secret = _secret_bytes(secret)
        self.key_id = key_id

    def __repr__(self) -> str:  # секрет не должен утекать в логи/трейсбэки
        return f"IntakeSigner(algorithm={self.algorithm!r}, key_id={self.key_id!r}, secret=***)"

    @classmethod
    def from_env(
        cls,
        env_var: str = ENV_HMAC_SECRET,
        key_id: Optional[str] = None,
    ) -> "IntakeSigner":
        secret = os.environ.get(env_var)
        if not secret:
            raise IntakeSigningError(f"{env_var} is not set")
        return cls(secret, key_id=key_id)

    def sign(
        self,
        output: StudioRunOutput,
        event_type: str = DEFAULT_EVENT_TYPE,
        ts: Optional[int] = None,
        scan_id: Optional[str] = None,
    ) -> str:
        """Hex-подпись payload'а (без сборки конверта)."""
        payload = output.model_dump(mode="json")
        _ts = int(ts if ts is not None else time.time())
        _scan_id = scan_id or output.scan_id
        message = _signature_message(_scan_id, event_type, _ts, payload)
        return hmac.new(self._secret, message, hashlib.sha256).hexdigest()

    def build_envelope(
        self,
        output: StudioRunOutput,
        event_type: str = DEFAULT_EVENT_TYPE,
        ts: Optional[int] = None,
    ) -> dict:
        """Собрать подписанный конверт ``{..., signature, ts, payload}``."""
        payload = output.model_dump(mode="json")
        _ts = int(ts if ts is not None else time.time())
        signature = hmac.new(
            self._secret,
            _signature_message(output.scan_id, event_type, _ts, payload),
            hashlib.sha256,
        ).hexdigest()
        envelope = {
            "contract_version": CONTRACT_VERSION,
            "scan_id": output.scan_id,
            "event_type": event_type,
            "signature": signature,
            "ts": _ts,
            "payload": payload,
        }
        if self.key_id:
            envelope["key_id"] = self.key_id
        return envelope

    def envelope_bytes(
        self,
        output: StudioRunOutput,
        event_type: str = DEFAULT_EVENT_TYPE,
        ts: Optional[int] = None,
    ) -> bytes:
        return canonical_payload_bytes(self.build_envelope(output, event_type=event_type, ts=ts))


def verify_envelope(
    secret: Any,
    envelope: Any,
    max_age_s: Optional[float] = None,
    now: Optional[float] = None,
) -> bool:
    """Проверить подпись конверта (Hub-сторона). Fail-closed → bool.

    Проверяет: наличие обязательных полей, совпадение ``contract_version``,
    HMAC-SHA256 подпись (constant-time) и, опционально, свежесть ``ts``.
    """
    if isinstance(envelope, (bytes, bytearray)):
        try:
            envelope = envelope.decode("utf-8")
        except UnicodeDecodeError:
            return False
    if isinstance(envelope, str):
        try:
            envelope = json.loads(envelope)
        except json.JSONDecodeError:
            return False
    if not isinstance(envelope, dict):
        return False
    if any(field not in envelope for field in ENVELOPE_REQUIRED_FIELDS):
        return False
    if envelope.get("contract_version") != CONTRACT_VERSION:
        return False

    try:
        ts = int(envelope["ts"])
    except (TypeError, ValueError):
        return False

    if max_age_s is not None:
        _now = now if now is not None else time.time()
        if abs(_now - ts) > max_age_s:
            return False

    try:
        message = _signature_message(
            str(envelope["scan_id"]),
            str(envelope["event_type"]),
            ts,
            envelope["payload"],
        )
    except (TypeError, ValueError):
        return False

    expected = hmac.new(_secret_bytes(secret), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, str(envelope.get("signature", "")))


class IntakeDeliveryError(RuntimeError):
    """Базовый класс ошибок доставки в Hub."""


class IntakeRejected(IntakeDeliveryError):
    """Hub отверг payload (4xx / accepted=false). Fail-closed, retry не поможет."""

    def __init__(self, scan_id: str, response: Optional[HubIntakeResponse], status_code: int) -> None:
        self.scan_id = scan_id
        self.response = response
        self.status_code = status_code
        reason = f"scan {scan_id} rejected by Hub (HTTP {status_code})"
        if response is not None and response.errors:
            reason += f": {len(response.errors)} error(s)"
        super().__init__(reason)


class IntakeUnavailable(IntakeDeliveryError):
    """Hub недоступен (сеть/5xx) после исчерпания попыток. Fail-closed."""

    def __init__(self, scan_id: str, attempts: int, last_error: BaseException) -> None:
        self.scan_id = scan_id
        self.attempts = attempts
        self.last_error = last_error
        super().__init__(f"scan {scan_id}: unable to deliver after {attempts} attempts: {last_error}")


class HubIntakeClient:
    """HTTP Push транспорт Contract A (Коробка -> Hub intake).

    Успех — только если Hub подтвердил ``accepted=true``. Любая другая развязка
    (4xx, accepted=false, сеть/5xx после ретраев) — исключение, fail-closed.
    """

    def __init__(
        self,
        base_url: str = DEFAULT_HUB_INTAKE_URL,
        timeout: float = DEFAULT_TIMEOUT_S,
        attempts: int = DEFAULT_ATTEMPTS,
        backoff_sequence: tuple[float, ...] = BACKOFF_SEQUENCE,
        session: Any = None,
        signer: Optional[IntakeSigner] = None,
        event_type: str = DEFAULT_EVENT_TYPE,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.attempts = attempts
        self.backoff_sequence = backoff_sequence
        self._session = session
        self.signer = signer
        self.event_type = event_type

    @property
    def session(self) -> Any:
        if self._session is None:
            self._session = requests.Session()
        return self._session

    def _backoff_for(self, attempt: int) -> float:
        """Backoff перед попыткой attempt (1-based). Возвращает 0 для первой."""
        if attempt <= 1:
            return 0.0
        idx = min(attempt - 2, len(self.backoff_sequence) - 1)
        return self.backoff_sequence[idx]

    def push(
        self,
        output: StudioRunOutput,
        sleep_fn: Callable[[float], None] = time.sleep,
    ) -> HubIntakeResponse:
        """Отправить StudioRunOutput в Hub intake.

        Returns:
            HubIntakeResponse с accepted=true.

        Raises:
            IntakeRejected: 4xx или accepted=false (валидация/домен, не ретраится).
            IntakeUnavailable: сеть/5xx после исчерпания attempts.
        """
        payload = output.model_dump(mode="json")
        headers = {
            "X-PrettyK-Contract-Version": CONTRACT_VERSION,
            "X-PrettyK-Scan-Id": output.scan_id,
        }
        if self.signer is not None:
            # PRD-1: подписанный конверт вместо «сырого» payload'а.
            # ts/подпись считаются один раз — все ретраи несут один и тот же
            # конверт (идемпотентность подписи при повторной доставке).
            envelope = self.signer.build_envelope(output, event_type=self.event_type)
            body = canonical_payload_bytes(envelope)
            headers[SIGNATURE_HEADER] = envelope["signature"]
            headers[TIMESTAMP_HEADER] = str(envelope["ts"])
            if self.signer.key_id:
                headers["X-PrettyK-Key-Id"] = self.signer.key_id
        else:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        last_error: Optional[BaseException] = None
        for attempt in range(1, self.attempts + 1):
            backoff = self._backoff_for(attempt)
            if backoff > 0:
                sleep_fn(backoff)

            try:
                resp = self.session.post(
                    self.base_url,
                    data=body,
                    headers=headers,
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:  # сеть/таймаут
                last_error = exc
                logger.warning("intake push attempt %d/%d failed: %s", attempt, self.attempts, exc)
                continue

            # Успешный статус: разбор и проверка accepted.
            if resp.status_code in _OK_STATUSES:
                try:
                    parsed = HubIntakeResponse.model_validate_json(resp.text)
                except Exception as exc:  # невалидный ответ Hub — трактуем как transient
                    last_error = exc
                    logger.warning("intake response parse failed on attempt %d: %s", attempt, exc)
                    continue
                if parsed.accepted:
                    return parsed
                raise IntakeRejected(output.scan_id, parsed, resp.status_code)

            # 4xx — payload не принимается, retry бессмыслен.
            if 400 <= resp.status_code < 500:
                raise IntakeRejected(output.scan_id, None, resp.status_code)

            # 5xx — transient.
            last_error = RuntimeError(f"Hub returned HTTP {resp.status_code}")
            logger.warning("intake push attempt %d/%d got HTTP %s", attempt, self.attempts, resp.status_code)

        raise IntakeUnavailable(output.scan_id, self.attempts, last_error or RuntimeError("no attempt"))


class AirgapBundler:
    """Сборка `run_package_<scan_id>.zip` для офлайн-передачи (spec §4.2)."""

    def __init__(self, output_dir: Path) -> None:
        self._output = Path(output_dir)
        self._output.mkdir(parents=True, exist_ok=True)

    def build(
        self,
        output: StudioRunOutput,
        evidence_dir: Optional[Path] = None,
        signer: Optional[IntakeSigner] = None,
        event_type: str = DEFAULT_EVENT_TYPE,
    ) -> Path:
        """Сформировать airgap-пакет.

        Состав архива:
          - intake_payload.json — полный валидный StudioRunOutput.
          - manifest.json        — метаданные пакета (scan_id, sha256 payload, evidence).
          - intake_envelope.json — подписанный конверт (только при наличии ``signer``).
          - evidence/            — приложенные артефакты (HAR, XML, логи, акт), если переданы.

        Returns:
            Path до созданного .zip.
        """
        scan_id = output.scan_id
        payload_json = output.model_dump_json(indent=2)

        manifest = {
            "scan_id": scan_id,
            "contract_version": CONTRACT_VERSION,
            "package": f"run_package_{scan_id}.zip",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "intake_payload_sha256": hashlib.sha256(payload_json.encode("utf-8")).hexdigest(),
            "evidence": [],
        }

        envelope_json: Optional[str] = None
        if signer is not None:
            envelope = signer.build_envelope(output, event_type=event_type)
            envelope_json = canonical_payload_bytes(envelope).decode("utf-8")
            manifest["signature"] = {
                "algorithm": signer.algorithm,
                "event_type": event_type,
                "ts": envelope["ts"],
                "value": envelope["signature"],
            }
            if signer.key_id:
                manifest["signature"]["key_id"] = signer.key_id

        evidence_files: List[Path] = []
        if evidence_dir is not None and evidence_dir.is_dir():
            evidence_files = [p for p in evidence_dir.iterdir() if p.is_file()]
            for p in sorted(evidence_files):
                manifest["evidence"].append(
                    {"name": p.name, "sha256": _sha256_file(p), "size_bytes": p.stat().st_size}
                )

        package_path = self._output / f"run_package_{scan_id}.zip"
        with zipfile.ZipFile(package_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("intake_payload.json", payload_json)
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            if envelope_json is not None:
                zf.writestr("intake_envelope.json", envelope_json)
            for p in evidence_files:
                zf.write(p, arcname=f"evidence/{p.name}")

        logger.info("airgap bundle created: %s (%d evidence files)", package_path, len(evidence_files))
        return package_path


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()