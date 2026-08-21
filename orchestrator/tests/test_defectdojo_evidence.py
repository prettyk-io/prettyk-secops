# -*- coding: utf-8 -*-
from adapters.defectdojo_client import (
    _parse_import_payload,
    build_dojo_engagement_url,
    engagement_mode,
    trigger_defectdojo_import_detailed,
)


def test_engagement_mode_check(monkeypatch):
    monkeypatch.setenv("KDT_DEFECTDOJO_ENGAGEMENT_MODE", "check")
    assert engagement_mode() == "check"
    monkeypatch.setenv("KDT_DEFECTDOJO_ENGAGEMENT_MODE", "fixed")
    assert engagement_mode() == "fixed"


def test_parse_import_payload_ids_and_stats():
    parsed = _parse_import_payload(
        {
            "product_id": 1,
            "engagement_id": 12,
            "test_id": 44,
            "statistics": {"after": {"critical": 0, "high": 2, "medium": 1}},
        }
    )
    assert parsed["product_id"] == 1
    assert parsed["engagement_id"] == 12
    assert parsed["test_id"] == 44
    assert parsed["stats"]["high"] == 2


def test_parse_import_payload_nested_active_not_total():
    """Реальный Dojo shape: after.high = {active, total, false_p, …}."""
    parsed = _parse_import_payload(
        {
            "test_id": 7,
            "statistics": {
                "after": {
                    "critical": {
                        "active": 0,
                        "total": 0,
                        "false_p": 0,
                    },
                    "high": {
                        "active": 1,
                        "total": 5,
                        "false_p": 2,
                        "is_mitigated": 2,
                    },
                    "medium": {"active": 3, "total": 3},
                    "low": {"active": 0, "total": 10},
                    "info": {"active": 0, "total": 0},
                }
            },
        }
    )
    assert parsed["stats"]["high"] == 1
    assert parsed["stats"]["medium"] == 3
    assert parsed["stats"]["low"] == 0
    assert parsed["stats_shape"] == "active"


def test_parse_import_payload_nested_without_active_ignored():
    parsed = _parse_import_payload(
        {
            "statistics": {
                "after": {
                    "high": {"total": 9, "false_p": 9},
                }
            }
        }
    )
    assert "stats" not in parsed


def test_build_engagement_url():
    assert build_dojo_engagement_url("http://127.0.0.1:8081/", 12).endswith(
        "/engagement/12"
    )


def test_import_detailed_check_mode_posts_auto_create(monkeypatch, tmp_path):
    xml = tmp_path / "zap.xml"
    xml.write_text("<xml/>", encoding="utf-8")
    monkeypatch.setenv("KDT_DEFECTDOJO_URL", "http://dojo.test")
    monkeypatch.setenv("KDT_DEFECTDOJO_TOKEN", "tok")
    monkeypatch.setenv("KDT_DEFECTDOJO_ENGAGEMENT_MODE", "check")
    monkeypatch.setenv("KDT_META_PROJECT_ID", "ib-web")
    monkeypatch.setenv("KDT_CHECK_ID", "chk_1")

    captured = {}

    class FakeResp:
        status_code = 201
        text = '{"test_id": 9, "engagement_id": 3, "product_id": 1}'

        def json(self):
            return {"test_id": 9, "engagement_id": 3, "product_id": 1}

    def fake_post(url, headers=None, data=None, files=None, timeout=None):
        captured["url"] = url
        captured["data"] = dict(data or {})
        return FakeResp()

    monkeypatch.setattr(
        "adapters.defectdojo_client.requests.post",
        fake_post,
    )

    result = trigger_defectdojo_import_detailed(xml, check_id="chk_1")
    assert result["ok"] is True
    assert captured["data"]["auto_create_context"] == "true"
    assert captured["data"]["product_name"] == "ib-web"
    assert captured["data"]["engagement_name"] == "chk_1"
    assert result["dojo"]["engagement_id"] == 3
    assert "engagement/3" in result["dojo"]["engagement_url"]
