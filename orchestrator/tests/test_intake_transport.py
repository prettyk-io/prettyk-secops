# -*- coding: utf-8 -*-
"""Tests for G4 outbound intake transport (HubIntakeClient + AirgapBundler)."""
from __future__ import annotations

import json
import zipfile
from datetime import datetime, timezone

import pytest
import requests

from orchestrator.contracts.studio_run_output import (
    BoxVerdict,
    HubIntakeResponse,
    StudioProvenance,
    StudioRunOutput,
)
from orchestrator.infra.intake_transport import (
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    AirgapBundler,
    HubIntakeClient,
    IntakeRejected,
    IntakeSigner,
    IntakeSigningError,
    IntakeUnavailable,
    canonical_payload_bytes,
    verify_envelope,
)


def _build_output(scan_id: str = "a3f19c2b7e04") -> StudioRunOutput:
    return StudioRunOutput(
        scan_id=scan_id,
        run_id=scan_id,
        session_name="juice_smoke",
        project_id="exp01-baseline",
        box_verdict=BoxVerdict.pass_verdict,
        started_at=datetime.now(timezone.utc),
        provenance=StudioProvenance(
            project_id="exp01-baseline",
            wired_hash="w_hash",
            target_scope_hash="t_hash",
        ),
    )


def _accepted_json(scan_id: str) -> str:
    return HubIntakeResponse(accepted=True, scan_id=scan_id, findings_processed=3).model_dump_json()


class _FakeResponse:
    def __init__(self, status_code: int, text: str = "{}") -> None:
        self.status_code = status_code
        self.text = text


class _FakeSession:
    def __init__(self, responses: list) -> None:
        self._responses = list(responses)
        self.calls: list[dict] = []

    def post(self, url, data=None, headers=None, timeout=None):
        self.calls.append({"url": url, "headers": headers, "data": data, "timeout": timeout})
        if not self._responses:
            raise AssertionError("no more fake responses")
        response = self._responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response


class _NoSleep:
    def __init__(self) -> None:
        self.calls: list[float] = []

    def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)


def test_push_success_sends_contract_headers():
    """Успешный интейк — accepted=true, корректные заголовки контракта."""
    scan_id = "a3f19c2b7e04"
    session = _FakeSession([_FakeResponse(200, _accepted_json(scan_id))])
    client = HubIntakeClient(base_url="http://127.0.0.1:8200/api/v1/intake", session=session)

    result = client.push(_build_output(scan_id))

    assert result.accepted is True
    assert result.scan_id == scan_id
    call = session.calls[0]
    assert call["url"] == "http://127.0.0.1:8200/api/v1/intake"
    assert call["headers"]["X-PrettyK-Scan-Id"] == scan_id
    assert call["headers"]["X-PrettyK-Contract-Version"] == "1.0"
    assert call["timeout"] == 30.0


def test_push_rejected_4xx_is_fail_closed_no_retry():
    """422 → IntakeRejected, без ретраев (валидация бессмысленна)."""
    session = _FakeSession([_FakeResponse(422, '{"detail": "bad severity"}')])
    client = HubIntakeClient(session=session)

    with pytest.raises(IntakeRejected) as exc:
        client.push(_build_output())

    assert exc.value.status_code == 422
    assert len(session.calls) == 1  # no retry


def test_push_rejected_accepted_false():
    """200, но accepted=false + errors → IntakeRejected."""
    rejected = HubIntakeResponse(
        accepted=False,
        scan_id="a3f19c2b7e04",
        rejected_count=1,
        errors=[{"finding_index": 2, "field": "severity", "reason": "Value is invalid"}],
    )
    session = _FakeSession([_FakeResponse(200, rejected.model_dump_json())])
    client = HubIntakeClient(session=session)

    with pytest.raises(IntakeRejected) as exc:
        client.push(_build_output())

    assert exc.value.response is not None
    assert exc.value.response.accepted is False
    assert len(exc.value.response.errors) == 1


def test_push_5xx_retries_then_success_with_exponential_backoff():
    """5xx → retry с backoff 1s / 2s, затем успех."""
    sleep = _NoSleep()
    session = _FakeSession([
        _FakeResponse(500, "{}"),
        _FakeResponse(503, "{}"),
        _FakeResponse(200, _accepted_json("a3f19c2b7e04")),
    ])
    client = HubIntakeClient(session=session)

    result = client.push(_build_output(), sleep_fn=sleep)

    assert result.accepted is True
    assert len(session.calls) == 3
    assert sleep.calls == [1.0, 2.0]


def test_push_network_error_exhausted_fail_closed():
    """Сеть во всех попытках → IntakeUnavailable, fail-closed."""
    sleep = _NoSleep()
    session = _FakeSession([requests.ConnectionError("boom")] * 3)
    client = HubIntakeClient(session=session)

    with pytest.raises(IntakeUnavailable) as exc:
        client.push(_build_output(), sleep_fn=sleep)

    assert exc.value.attempts == 3
    assert len(session.calls) == 3
    assert sleep.calls == [1.0, 2.0]


def test_airgap_bundler_zip_contents(tmp_path):
    """Airgap-пакет: intake_payload.json + manifest.json + evidence/."""
    evidence_dir = tmp_path / "evidence"
    evidence_dir.mkdir()
    (evidence_dir / "session.har").write_text("har-data", encoding="utf-8")
    (evidence_dir / "juice_dojo.xml").write_text("<xml/>", encoding="utf-8")

    out_dir = tmp_path / "out"
    bundler = AirgapBundler(output_dir=out_dir)
    scan_id = "b5c4d3e2f109"
    package_path = bundler.build(_build_output(scan_id), evidence_dir=evidence_dir)

    assert package_path.exists()
    assert package_path.name == f"run_package_{scan_id}.zip"

    with zipfile.ZipFile(package_path) as zf:
        names = set(zf.namelist())
        assert "intake_payload.json" in names
        assert "manifest.json" in names
        assert "evidence/session.har" in names
        assert "evidence/juice_dojo.xml" in names

        # Payload round-trips back into the DTO.
        payload = json.loads(zf.read("intake_payload.json"))
        reloaded = StudioRunOutput.model_validate(payload)
        assert reloaded.scan_id == scan_id

        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["scan_id"] == scan_id
        assert manifest["contract_version"] == "1.0"
        assert len(manifest["intake_payload_sha256"]) == 64
        assert {e["name"] for e in manifest["evidence"]} == {"session.har", "juice_dojo.xml"}


def test_airgap_bundler_without_evidence(tmp_path):
    """Без evidence каталог отсутствует, но payload + manifest на месте."""
    out_dir = tmp_path / "out"
    bundler = AirgapBundler(output_dir=out_dir)
    package_path = bundler.build(_build_output())

    with zipfile.ZipFile(package_path) as zf:
        names = set(zf.namelist())
        assert "intake_payload.json" in names
        assert "manifest.json" in names
        assert not any(n.startswith("evidence/") for n in names)


# ── PRD-1: HMAC-подпись outbound transport ──


SECRET = "top-secret-intake-key"


def test_signer_envelope_signature_roundtrip():
    """Подписанный конверт верифицируется тем же секретом."""
    signer = IntakeSigner(SECRET)
    envelope = signer.build_envelope(_build_output(), ts=1_700_000_000)

    assert envelope["contract_version"] == "1.0"
    assert envelope["scan_id"] == "a3f19c2b7e04"
    assert envelope["event_type"] == "studio.run.output"
    assert envelope["ts"] == 1_700_000_000
    assert len(envelope["signature"]) == 64
    assert envelope["payload"]["scan_id"] == "a3f19c2b7e04"
    assert verify_envelope(SECRET, envelope) is True
    assert verify_envelope(SECRET, signer.envelope_bytes(_build_output(), ts=1_700_000_000)) is True


def test_verify_rejects_tampered_payload():
    """Изменение payload ломает подпись."""
    signer = IntakeSigner(SECRET)
    envelope = signer.build_envelope(_build_output(), ts=1_700_000_000)
    envelope["payload"]["session_name"] = "evil"

    assert verify_envelope(SECRET, envelope) is False


def test_verify_rejects_tampered_metadata():
    """Изменение scan_id/ts ломает подпись (anti-tamper конверта)."""
    signer = IntakeSigner(SECRET)
    envelope = signer.build_envelope(_build_output(), ts=1_700_000_000)
    envelope["ts"] = 1_700_000_001
    assert verify_envelope(SECRET, envelope) is False

    envelope = signer.build_envelope(_build_output(), ts=1_700_000_000)
    envelope["scan_id"] = "deadbeef0000"
    assert verify_envelope(SECRET, envelope) is False


def test_verify_rejects_wrong_secret():
    """Другой секрет — подпись не сходится."""
    envelope = IntakeSigner(SECRET).build_envelope(_build_output(), ts=1_700_000_000)

    assert verify_envelope("other-secret", envelope) is False


def test_verify_stale_timestamp_fails_when_max_age_set():
    """Свежесть ts проверяется только при явном max_age_s."""
    envelope = IntakeSigner(SECRET).build_envelope(_build_output(), ts=1_000)

    assert verify_envelope(SECRET, envelope, max_age_s=None) is True
    assert verify_envelope(SECRET, envelope, max_age_s=60, now=1_000_000) is False
    assert verify_envelope(SECRET, envelope, max_age_s=60, now=1_030) is True


def test_verify_rejects_malformed_envelope():
    """Битый JSON / отсутствие полей / чужая версия — fail-closed."""
    assert verify_envelope(SECRET, "not json") is False
    assert verify_envelope(SECRET, {"scan_id": "x"}) is False
    envelope = IntakeSigner(SECRET).build_envelope(_build_output(), ts=1_700_000_000)
    envelope["contract_version"] = "9.9"
    assert verify_envelope(SECRET, envelope) is False


def test_signer_from_env(monkeypatch):
    """Секрет берётся из окружения; отсутствие — ошибка конфигурации."""
    monkeypatch.delenv("PRETTYK_INTAKE_HMAC_SECRET", raising=False)
    with pytest.raises(IntakeSigningError):
        IntakeSigner.from_env()

    monkeypatch.setenv("PRETTYK_INTAKE_HMAC_SECRET", SECRET)
    signer = IntakeSigner.from_env()
    assert verify_envelope(SECRET, signer.build_envelope(_build_output(), ts=1)) is True

    with pytest.raises(IntakeSigningError):
        IntakeSigner("")


def test_signer_repr_does_not_leak_secret():
    """Секрет не утекает в repr/логи."""
    signer = IntakeSigner(SECRET, key_id="k1")

    text = repr(signer)
    assert SECRET not in text
    assert "***" in text
    assert "k1" in text


def test_push_with_signer_sends_verified_envelope():
    """push(signer=...) шлёт конверт, а не сырой payload; заголовки подписи на месте."""
    scan_id = "a3f19c2b7e04"
    session = _FakeSession([_FakeResponse(200, _accepted_json(scan_id))])
    signer = IntakeSigner(SECRET)
    client = HubIntakeClient(session=session, signer=signer)

    result = client.push(_build_output(scan_id))

    assert result.accepted is True
    call = session.calls[0]
    body = json.loads(call["data"].decode("utf-8"))
    assert "payload" in body and body["scan_id"] == scan_id
    assert call["headers"][SIGNATURE_HEADER] == body["signature"]
    assert call["headers"][TIMESTAMP_HEADER] == str(body["ts"])
    assert verify_envelope(SECRET, body) is True
    # подпись сходится с тем, что было отправлено в заголовке
    assert body["signature"] in call["headers"][SIGNATURE_HEADER]


def test_push_signed_retries_reuse_same_envelope():
    """Все ретраи несут один и тот же подписанный конверт (идемпотентная подпись)."""
    sleep = _NoSleep()
    session = _FakeSession([
        _FakeResponse(500, "{}"),
        _FakeResponse(200, _accepted_json("a3f19c2b7e04")),
    ])
    client = HubIntakeClient(session=session, signer=IntakeSigner(SECRET))

    client.push(_build_output(), sleep_fn=sleep)

    assert len(session.calls) == 2
    assert session.calls[0]["data"] == session.calls[1]["data"]


def test_airgap_bundler_signed_envelope(tmp_path):
    """Airgap со signer кладёт intake_envelope.json и фиксирует подпись в манифесте."""
    out_dir = tmp_path / "out"
    bundler = AirgapBundler(output_dir=out_dir)
    scan_id = "c1d2e3f4a5b6"
    package_path = bundler.build(_build_output(scan_id), signer=IntakeSigner(SECRET))

    with zipfile.ZipFile(package_path) as zf:
        names = set(zf.namelist())
        assert "intake_envelope.json" in names
        envelope = json.loads(zf.read("intake_envelope.json"))
        assert verify_envelope(SECRET, envelope) is True
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["signature"]["algorithm"] == "hmac-sha256"
        assert manifest["signature"]["value"] == envelope["signature"]
        assert manifest["signature"]["ts"] == envelope["ts"]


def test_airgap_bundler_unsigned_has_no_envelope(tmp_path):
    """Без signer envelope-файл не появляется (обратная совместимость)."""
    out_dir = tmp_path / "out"
    package_path = AirgapBundler(output_dir=out_dir).build(_build_output())

    with zipfile.ZipFile(package_path) as zf:
        assert "intake_envelope.json" not in set(zf.namelist())