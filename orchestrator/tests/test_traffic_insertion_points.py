# -*- coding: utf-8 -*-
from utils.traffic_insertion_points import (
    TRAFFIC_FEED_ENV,
    extract_observed_insertion_points,
    feed_targets_from_history,
    insertion_points_to_fuzz_targets,
    traffic_feed_enabled,
)


def test_extract_query_and_json_dedupe_skip_utm():
    messages = [
        {
            "requestHeader": (
                "GET http://juice:3000/rest/products/search?q=apple&utm_source=x HTTP/1.1\r\n"
                "Host: juice:3000\r\n\r\n"
            ),
            "responseHeader": "HTTP/1.1 200 OK\r\n\r\n",
        },
        {
            "method": "GET",
            "url": "http://juice:3000/rest/products/search?q=pear",
            "statusCode": 200,
        },
        {
            "method": "POST",
            "url": "http://juice:3000/rest/user/login",
            "requestBody": '{"email":"a@b.c","password":"secret"}',
            "statusCode": 200,
        },
        {
            "method": "GET",
            "url": "http://juice:3000/assets/app.js?v=1",
            "statusCode": 200,
        },
    ]
    points = extract_observed_insertion_points(messages)
    kinds = {(p.location_kind, p.name) for p in points}
    assert ("query_param", "q") in kinds
    assert ("json_body", "email") in kinds
    assert ("json_body", "password") not in kinds
    assert ("query_param", "utm_source") not in kinds
    assert ("query_param", "v") not in kinds
    # dedupe q
    assert sum(1 for p in points if p.name == "q") == 1


def test_status_filter_and_empty_history():
    assert extract_observed_insertion_points([]) == []
    bad = [
        {
            "method": "GET",
            "url": "http://juice:3000/rest/products/search?q=x",
            "statusCode": 500,
        }
    ]
    assert extract_observed_insertion_points(bad) == []


def test_to_targets_and_feed_merge():
    messages = [
        {
            "method": "GET",
            "url": "http://juice:3000/rest/products/search?q=a",
            "statusCode": 200,
        }
    ]
    points = extract_observed_insertion_points(messages)
    targets = insertion_points_to_fuzz_targets(points, corpus="auto")
    assert len(targets) == 1
    assert targets[0]["legacy_location"]["name"] == "q"
    assert "q=" in targets[0]["url"]

    merged = feed_targets_from_history(
        messages,
        existing=[{"url": "http://juice:3000/rest/products/search?q=manual", "method": "GET", "corpus": "intent_boundary"}],
        limit=10,
    )
    assert len(merged) >= 1
    assert merged[0]["corpus"] == "intent_boundary"


def test_traffic_feed_env():
    assert traffic_feed_enabled({TRAFFIC_FEED_ENV: "1"}) is True
    assert traffic_feed_enabled({TRAFFIC_FEED_ENV: "0"}) is False


def test_suite_runner_feed_opt_in(monkeypatch):
    from core.fuzzing import SuiteFuzzerRunner
    from utils import traffic_insertion_points as tip

    messages = [
        {
            "method": "GET",
            "url": "http://juice:3000/rest/products/search?q=a",
            "statusCode": 200,
        }
    ]

    class scanner:
        def get_messages(self):
            return messages

    monkeypatch.setenv(TRAFFIC_FEED_ENV, "1")
    runner = SuiteFuzzerRunner(
        wired=type("M", (), {"scan_base_url": lambda: "http://juice:3000"})(),
        scanner=scanner(),
        stream=type("S", (), {"resolve_arg": lambda self, v: v})(),
    )
    merged, meta = runner._maybe_feed_traffic_targets(
        [], base_url="http://juice:3000"
    )
    assert meta["traffic_feed"] is True
    assert meta["traffic_points"] >= 1
    assert merged and merged[0]["legacy_location"]["name"] == "q"

    monkeypatch.delenv(TRAFFIC_FEED_ENV, raising=False)
    merged2, meta2 = runner._maybe_feed_traffic_targets(
        [], base_url="http://juice:3000"
    )
    assert meta2["traffic_feed"] is False
    assert merged2 == []
    assert tip.traffic_feed_enabled() is False
