# -*- coding: utf-8 -*-
"""QG-AF-10: list_findings_for_gate follows next across pages."""
from __future__ import annotations

from adapters.defectdojo_client import list_findings_for_gate


def test_list_findings_paginates_two_pages(monkeypatch):
    monkeypatch.setenv("KDT_DEFECTDOJO_URL", "http://dojo.test")
    monkeypatch.setenv("KDT_DEFECTDOJO_TOKEN", "tok")

    calls: list[dict] = []

    class FakeResp:
        def __init__(self, body, status=200):
            self.status_code = status
            self._body = body

        def json(self):
            return self._body

    def fake_get(url, headers=None, params=None, timeout=None):
        calls.append({"url": url, "params": params})
        if params is not None:
            # first page
            return FakeResp(
                {
                    "count": 2,
                    "next": "http://dojo.test/api/v2/findings/?limit=1&offset=1",
                    "results": [
                        {
                            "id": 1,
                            "severity": "High",
                            "active": True,
                            "false_p": False,
                            "duplicate": False,
                        }
                    ],
                }
            )
        # second page via absolute next (params=None)
        return FakeResp(
            {
                "count": 2,
                "next": None,
                "results": [
                    {
                        "id": 2,
                        "severity": "Medium",
                        "active": True,
                        "false_p": False,
                        "duplicate": False,
                    }
                ],
            }
        )

    monkeypatch.setattr("adapters.defectdojo_client.requests.get", fake_get)
    listed = list_findings_for_gate(test_id=7, limit=1)
    assert listed["ok"] is True
    assert listed["pages"] == 2
    assert len(listed["findings"]) == 2
    assert listed["findings"][0]["id"] == 1
    assert listed["findings"][1]["id"] == 2
    assert len(calls) == 2
    assert calls[0]["params"] is not None
    assert calls[1]["params"] is None
