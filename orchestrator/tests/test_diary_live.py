# -*- coding: utf-8 -*-
"""diary_bus NDJSON + KDT Live SSE by channel (no browser)."""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.request import urlopen

import pytest

from utils import diary_bus
from utils.live_server import start_live_server, stop_live_server


@pytest.fixture(autouse=True)
def _isolate_live(monkeypatch, tmp_path):
    stop_live_server()
    live_dir = tmp_path / "live"
    live_dir.mkdir()
    exports_dir = live_dir / "exports"
    monkeypatch.setattr("utils.paths.LIVE_DIR", live_dir)
    monkeypatch.setattr("utils.paths.DIARY_NDJSON", live_dir / "diary.ndjson")
    monkeypatch.setattr("utils.paths.LIVE_META_JSON", live_dir / "meta.json")
    monkeypatch.setattr("utils.paths.RESULTS_HOOKS_JSON", live_dir / "results_hooks.json")
    monkeypatch.setattr("utils.paths.LIVE_EXPORTS_DIR", exports_dir)
    monkeypatch.setattr("utils.diary_bus.LIVE_DIR", live_dir)
    monkeypatch.setattr("utils.diary_bus.DIARY_NDJSON", live_dir / "diary.ndjson")
    monkeypatch.setattr("utils.diary_bus.LIVE_META_JSON", live_dir / "meta.json")
    monkeypatch.setattr(
        "utils.diary_bus.RESULTS_HOOKS_JSON", live_dir / "results_hooks.json"
    )
    monkeypatch.setattr("utils.diary_bus.LIVE_EXPORTS_DIR", exports_dir)
    monkeypatch.setenv("KDT_LIVE", "1")
    monkeypatch.setenv("KDT_LIVE_PORT", "18767")
    diary_bus.clear()
    yield
    stop_live_server()
    diary_bus.clear()


def test_set_meta_preserves_disk_generate_act_across_memory_reset():
    """Controller/playground write generate_act; Live notify must not wipe it."""
    diary_bus.set_meta(
        generate_act=True,
        assessment_purpose="emergency",
        session_name="act-seed",
    )
    diary_bus._meta.clear()
    diary_bus._meta.update({"session_name": "idle", "status": "waiting"})
    diary_bus.set_meta(ci_verdict="fail_gate", ci_exit_code=2)
    meta = diary_bus.get_meta()
    assert meta.get("generate_act") is True
    assert meta.get("assessment_purpose") == "emergency"
    assert meta.get("ci_verdict") == "fail_gate"


def test_publish_writes_ndjson_with_channel():
    diary_bus.publish("STEP", "webdriver|open|http://example.com", channel="diary")
    diary_bus.publish("HIGH", "xss|/api", channel="zap")
    text = diary_bus.DIARY_NDJSON.read_text(encoding="utf-8")
    lines = [json.loads(x) for x in text.splitlines() if x.strip()]
    assert len(lines) == 2
    assert lines[0]["channel"] == "diary"
    assert lines[0]["kind"] == "STEP"
    assert lines[1]["channel"] == "zap"
    diary = diary_bus.read_file_backlog("diary")
    zap = diary_bus.read_file_backlog("zap")
    assert len(diary) == 1 and "example.com" in diary[0]["text"]
    assert len(zap) == 1 and zap[0]["text"] == "xss|/api"


def test_live_cors_preflight_allows_x_kdt_user():
    """Admin fetchDojoProgram sends X-KDT-User — preflight must allow it."""
    from urllib.request import Request

    url = start_live_server(session_name="unit-live-cors")
    req = Request(
        url + "api/dojo/program?project_id=ib-web",
        method="OPTIONS",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-kdt-user,content-type",
        },
    )
    with urlopen(req, timeout=2) as resp:
        assert resp.status == 204
        allow = (resp.headers.get("Access-Control-Allow-Headers") or "").lower()
        assert "x-kdt-user" in allow
        assert "content-type" in allow


def test_live_sse_backlog_filtered_by_channel():
    diary_bus.publish("NOTE", "hello-diary", channel="diary")
    diary_bus.publish("HIGH", "hello-zap", channel="zap")
    url = start_live_server(session_name="unit-live")
    assert url == "http://127.0.0.1:18767/"

    with urlopen(url + "api/meta", timeout=2) as meta_resp:
        assert meta_resp.headers.get("Access-Control-Allow-Origin") == "*"
        meta = json.loads(meta_resp.read().decode("utf-8"))
    assert meta["session_name"] == "unit-live"

    html = urlopen(url, timeout=2).read().decode("utf-8")
    assert "SecOps Lab Monitoring" in html
    assert "Фильтр / regExp" in html
    assert 'id="focusKindChips"' in html
    assert 'data-kind="ZAP"' in html
    assert "как Dozzle" not in html

    got = {}

    def reader(channel, key):
        with urlopen(url + f"api/diary?channel={channel}", timeout=5) as resp:
            buf = b""
            while True:
                chunk = resp.read(1)
                if not chunk:
                    break
                buf += chunk
                if b"\n\n" in buf:
                    block, _, rest = buf.partition(b"\n\n")
                    buf = rest
                    if block.startswith(b"data: "):
                        got[key] = json.loads(block[6:].decode("utf-8"))
                        break

    t1 = threading.Thread(target=reader, args=("diary", "diary"), daemon=True)
    t2 = threading.Thread(target=reader, args=("zap", "zap"), daemon=True)
    t1.start()
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)
    assert got["diary"]["text"] == "hello-diary"
    assert got["diary"]["channel"] == "diary"
    assert got["zap"]["text"] == "hello-zap"
    assert got["zap"]["channel"] == "zap"


def test_results_hooks_post_and_get():
    from urllib.error import HTTPError
    from urllib.request import Request

    url = start_live_server(session_name="hooks-live")
    assert url == "http://127.0.0.1:18767/"

    with urlopen(url + "api/results/hooks", timeout=2) as resp:
        empty = json.loads(resp.read().decode("utf-8"))
    assert empty.get("allure") is None
    assert empty.get("dojo") is None

    body = json.dumps(
        {
            "allure_report_url": "http://127.0.0.1:5050/r/1/index.html",
            "dojo_report_url": "http://127.0.0.1:8081/engagement/9",
        }
    ).encode("utf-8")
    req = Request(
        url + "api/results/hooks",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=2) as resp:
        posted = json.loads(resp.read().decode("utf-8"))
    assert posted["ok"] is True
    assert (
        posted["hooks"]["allure"]["report_url"]
        == "http://127.0.0.1:5050/r/1/index.html"
    )
    assert posted["hooks"]["dojo"]["report_url"] == "http://127.0.0.1:8081/engagement/9"

    with urlopen(url + "api/results/hooks", timeout=2) as resp:
        got = json.loads(resp.read().decode("utf-8"))
    assert got["allure"]["report_url"].endswith("/r/1/index.html")
    assert got["dojo"]["report_url"].endswith("/engagement/9")

    bad = Request(
        url + "api/results/hooks",
        data=json.dumps({"dojo_report_url": "javascript:alert(1)"}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with pytest.raises(HTTPError) as err:
        urlopen(bad, timeout=2)
    assert err.value.code == 400

    clear_req = Request(
        url + "api/results/hooks",
        data=json.dumps({"clear": True}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(clear_req, timeout=2) as resp:
        cleared = json.loads(resp.read().decode("utf-8"))
    assert cleared["ok"] is True
    assert cleared["hooks"]["allure"] is None
    assert cleared["hooks"]["dojo"] is None


def test_set_results_hook_rejects_non_http():
    with pytest.raises(ValueError, match="http"):
        diary_bus.set_results_hook("allure", "javascript:void(0)")
    with pytest.raises(ValueError, match="http"):
        diary_bus.set_results_hook("dojo", "/engagement/1")
    diary_bus.set_results_hook("allure", "https://example.test/r")
    got = diary_bus.get_results_hooks()
    assert got["allure"]["report_url"] == "https://example.test/r"


def test_set_results_hook_merges_extras_on_url_only_update():
    diary_bus.clear_results_hooks()
    diary_bus.set_results_hook(
        "dojo",
        "http://127.0.0.1:8081/engagement/1",
        stats={"high": 2},
        collapse={"cluster_count": 1, "top_findings": [{"name": "H", "risk": "low", "count": 5}]},
    )
    diary_bus.set_results_hook("dojo", "http://127.0.0.1:8081/engagement/9")
    got = diary_bus.get_results_hooks()["dojo"]
    assert got["report_url"].endswith("/engagement/9")
    assert got["stats"]["high"] == 2
    assert got["collapse"]["cluster_count"] == 1


def test_results_hooks_demo_wait_polls_without_blind_sleep():
    from tools.results_hooks_demo import wait_hooks

    ticks = {"t": 0.0, "sleeps": 0}
    sequence = [
        {"allure": None, "dojo": None},
        {"allure": None, "dojo": {"report_url": "http://127.0.0.1:8081/e/1"}},
        {
            "allure": {"report_url": "http://127.0.0.1:5050/a"},
            "dojo": {"report_url": "http://127.0.0.1:8081/e/1"},
        },
    ]
    calls = {"n": 0}

    def fetch(_base: str):
        i = min(calls["n"], len(sequence) - 1)
        calls["n"] += 1
        return sequence[i]

    def clock() -> float:
        return ticks["t"]

    def sleep(dt: float) -> None:
        ticks["sleeps"] += 1
        ticks["t"] += dt

    both = wait_hooks(
        "http://127.0.0.1:8767",
        need_allure=True,
        need_dojo=True,
        timeout_sec=5.0,
        interval_sec=0.1,
        sleep=sleep,
        clock=clock,
        fetch=fetch,
    )
    assert both["allure"]["report_url"].endswith("/a")
    assert both["dojo"]["report_url"].endswith("/e/1")
    assert ticks["sleeps"] >= 1
    assert calls["n"] >= 3


def test_ci_status_post_sets_meta_verdict():
    from urllib.request import Request

    url = start_live_server(session_name="ci-live")
    body = json.dumps(
        {
            "phase": "completed",
            "conclusion": "success",
            "exit_code": 2,
            "gate": "fail",
            "job_name": "orchestrator",
            "job_url": "https://github.com/example/zap-kdt/actions/runs/9",
        }
    ).encode("utf-8")
    req = Request(
        url + "api/ci/status",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=2) as resp:
        posted = json.loads(resp.read().decode("utf-8"))
    assert posted["ok"] is True
    assert posted["verdict"] == "fail_gate"

    with urlopen(url + "api/meta", timeout=2) as meta_resp:
        meta = json.loads(meta_resp.read().decode("utf-8"))
    assert meta["ci_verdict"] == "fail_gate"
    assert meta["ci_job_url"].endswith("/runs/9")
    assert meta["ci_job_name"] == "orchestrator"


def test_run_ended_export_and_latest():
    from urllib.error import HTTPError
    from urllib.request import Request

    diary_bus.publish("STEP", "before-export", channel="diary")
    diary_bus.publish("HIGH", "zap-line", channel="zap")
    url = start_live_server(session_name="export-live")
    assert url == "http://127.0.0.1:18767/"

    with pytest.raises(HTTPError) as missing:
        urlopen(url + "api/export/latest", timeout=2)
    assert missing.value.code == 404

    body = json.dumps(
        {
            "event": "run_ended",
            "run_id": "export-live",
            "filter_preset": "all",
        }
    ).encode("utf-8")
    req = Request(
        url + "api/run/event",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=2) as resp:
        posted = json.loads(resp.read().decode("utf-8"))
    assert posted["ok"] is True
    assert posted["events_count"] == 2
    assert posted["filter_preset"] == "all"
    assert posted["export_path"]
    assert Path(posted["export_path"]).is_file()

    with urlopen(url + "api/meta", timeout=2) as meta_resp:
        meta = json.loads(meta_resp.read().decode("utf-8"))
    assert meta["status"] == "waiting"
    assert meta["last_export_path"] == posted["export_path"]
    assert meta["last_export_run_id"] == "export-live"

    with urlopen(url + "api/export/latest", timeout=2) as exp_resp:
        assert "application/x-ndjson" in (exp_resp.headers.get("Content-Type") or "")
        ndjson = exp_resp.read().decode("utf-8")
    lines = [json.loads(x) for x in ndjson.splitlines() if x.strip()]
    assert len(lines) == 2
    assert any(e.get("text") == "before-export" for e in lines)

    # Shell HTTP still serves after run_ended.
    with urlopen(url + "api/meta", timeout=2) as again:
        assert again.status == 200


def test_soft_bind_when_port_busy(monkeypatch):
    """If port is taken, start_live_server still returns URL and publish keeps working."""
    port = 18768
    monkeypatch.setenv("KDT_LIVE_PORT", str(port))

    class _H(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    blocker = HTTPServer(("127.0.0.1", port), _H)
    t = threading.Thread(target=blocker.serve_forever, daemon=True)
    t.start()
    try:
        url = start_live_server(session_name="soft-bind")
        assert url == f"http://127.0.0.1:{port}/"
        diary_bus.publish("STEP", "still-written", channel="diary")
        backlog = diary_bus.read_file_backlog("diary")
        assert any("still-written" in e["text"] for e in backlog)
    finally:
        blocker.shutdown()
        blocker.server_close()


def test_live_disabled(monkeypatch):
    monkeypatch.setenv("KDT_LIVE", "0")
    assert start_live_server() is None


def test_log_attack_zap_channel_without_step(monkeypatch):
    """log_attack → zap LOG «ЛогАтаки | …»; log_message не попадает в zap."""
    from adapters.data_processor import DataProcessor

    diary_bus.publish("STEP", "should-stay-diary", channel="diary")
    DataProcessor.log_message("diary-only marker")
    zap_before = diary_bus.read_file_backlog("zap")
    assert not any("diary-only" in e.get("text", "") for e in zap_before)

    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    ctrl._publish_log_attack_live({"message": "Замена: payload:'${x}'"})
    zap = diary_bus.read_file_backlog("zap")
    assert any(
        e.get("kind") == "LOG" and e.get("text") == "ЛогАтаки | Замена: payload:'${x}'"
        for e in zap
    )
    diary = diary_bus.read_file_backlog("diary")
    assert not any("ЛогАтаки" in e.get("text", "") for e in diary)


def test_scan_completion_is_published_to_zap_channel():
    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {}
    ctrl._publish_zap_live("active_scan", {}, 17)

    zap = diary_bus.read_file_backlog("zap")
    assert any(
        event["kind"] == "ZAP"
        and event["text"] == "Active scan completed — found 17 vulnerabilities"
        for event in zap
    )


def test_scan_completion_is_trace_event_not_allure_attachment(monkeypatch):
    from core.controller import Controller

    events = []
    monkeypatch.setattr(
        Controller,
        "_record_zap_trace_event",
        lambda _self, text, *, kind: events.append((kind, text)),
    )
    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {}
    ctrl._publish_zap_live("ajax_spider_scan", {}, 200)

    assert events == [("scan_result", "AJAX Spider found 200 URLs")]


def test_scan_start_is_trace_event(monkeypatch):
    from core.controller import Controller

    events = []
    monkeypatch.setattr(
        Controller,
        "_record_zap_trace_event",
        lambda _self, text, *, kind: events.append((kind, text)),
    )
    ctrl = Controller.__new__(Controller)

    ctrl._publish_zap_scan_started("ajax_spider_scan")
    ctrl._publish_zap_scan_started("active_scan")
    ctrl._publish_zap_scan_started("create_context")

    assert events == [
        ("scan_started", "AJAX Spider started"),
        ("scan_started", "Active scan started"),
    ]


def test_non_scan_zap_action_does_not_create_duplicate_trace_event(monkeypatch):
    from core.controller import Controller

    events = []
    monkeypatch.setattr(
        Controller,
        "_record_zap_trace_event",
        lambda _self, text, *, kind: events.append((kind, text)),
    )
    ctrl = Controller.__new__(Controller)

    ctrl._publish_zap_live("create_context", {"context_name": "juice_ctx"}, "juice_ctx")

    assert events == []


def test_diary_step_title_human_description():
    """STEP: description шага | полный wire constructor (не call_name)."""
    from types import SimpleNamespace

    from core.controller import Controller
    from core.language_parse import parse_script
    from core.method_id import wire_to_pretty_line

    ctrl = Controller.__new__(Controller)
    step = SimpleNamespace(
        description="Закрыть карточку товара",
        constructor="webdriver|click|css|button[aria-label='Close Dialog']",
    )
    ctor = "webdriver|click|css|button[aria-label='Close Dialog']"
    title = ctrl._diary_step_title(step, ctor, "webdriver|click", ctor)
    assert title == "Закрыть карточку товара"
    diary_line = f"{title} | {ctor}"
    assert diary_line.startswith("Закрыть карточку товара | webdriver|click|css|")

    # language-лист: pretty-строка → description листа (is_language_script не должна блокировать)
    nodes = parse_script('Нажать css "button[aria-label=\'Close Dialog\']"')
    assert len(nodes) == 1
    leaf_desc = ctrl._leaf_diary_description(None, nodes[0])
    assert "Нажать css" in leaf_desc
    assert "Close Dialog" in leaf_desc

    leaf_step = SimpleNamespace(
        description=leaf_desc,
        constructor=ctor,
    )
    title2 = ctrl._diary_step_title(leaf_step, leaf_desc, "webdriver|click", ctor)
    assert "Нажать css" in title2
    assert title2 != "webdriver|click"
    assert f"{title2} | {ctor}".startswith("Нажать css")

    # wire-only шаг без description → pretty из wire
    wire_only = SimpleNamespace(description=None, constructor=ctor)
    title3 = ctrl._diary_step_title(wire_only, ctor, "webdriver|click", ctor)
    assert title3 == wire_to_pretty_line(ctor)
    assert "Нажать css" in title3

    # один RU-шаг + description родителя
    parent = SimpleNamespace(
        description="Закрыть карточку товара",
        constructor='Нажать css "button[aria-label=\'Close Dialog\']"',
    )
    leaf_desc2 = ctrl._leaf_diary_description(parent, nodes[0])
    assert leaf_desc2 == "Закрыть карточку товара"


def test_should_publish_live_step_filters_noise():
    from types import SimpleNamespace

    from core.controller import Controller

    ctrl = Controller.__new__(Controller)

    assert ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="webdriver|click|css|.x"),
        "webdriver|click",
        "Нажать css .x",
    )
    assert ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="webdriver|open|http://x"),
        "webdriver|open",
        "Открыть http://x",
    )
    assert ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="webdriver|crawl_urls|urls"),
        "webdriver|crawl_urls",
        "ОбойтиСтраницы urls",
    )
    assert not ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="webdriver|wait_for_network_idle"),
        "webdriver|wait_for_network_idle",
        "ЖдатьПростойСети",
    )
    assert not ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="core|log_message|hi"),
        "core|log_message",
        "hi",
    )
    assert not ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="data|size|items"),
        "data|size",
        "size",
    )
    assert not ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="browser|get_cookies_count"),
        "browser|get_cookies_count",
        "КоличествоCookies",
    )
    assert not ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="zap|active_scan"),
        "zap|active_scan",
        "active_scan",
    )

    milestone = SimpleNamespace(
        description="Закрыть карточку товара",
        constructor="webdriver|click|css|button[aria-label='Close Dialog']",
    )
    assert ctrl._should_publish_live_step(
        milestone,
        "webdriver|click",
        "Закрыть карточку товара",
    )
    assert not ctrl._should_publish_live_step(
        SimpleNamespace(
            description='Пусть ${x} = "a"',
            constructor='data|let|x|"a"',
        ),
        "data|let",
        'Пусть ${x} = "a"',
    )


def test_next_live_step_preview_publishes_only_visible_step():
    """NEXT is a Live rail preview, not a second diary row for the operator."""
    from types import SimpleNamespace

    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    ctrl._expand_page_refs = lambda wire, _stream: wire
    ctrl._parse_constructor = lambda _wire: (
        "webdriver",
        "open",
        {"url": "/#/catalog"},
    )
    ctrl._should_publish_live_step = lambda *_args: True
    emitted = []
    ctrl._diary = lambda kind, *parts, **kwargs: emitted.append((kind, parts, kwargs))
    stream = SimpleNamespace(
        resolve=lambda value: value,
        resolve_arg=lambda value: value,
        mask_for_log=lambda value: value,
    )
    step = SimpleNamespace(constructor="webdriver|open|/#/catalog")

    assert ctrl._publish_live_next_step(step, stream)
    assert emitted[0][0] == "NEXT"
    assert emitted[0][1][1] == "webdriver|open|/#/catalog"
    assert emitted[0][2]["live"] is True


def test_log_message_skips_step_publishes_log():
    """core|log_message не STEP; LOG уходит в diary через _diary."""
    from types import SimpleNamespace

    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {}

    assert not ctrl._should_publish_live_step(
        SimpleNamespace(description=None, constructor="core|log_message|hi"),
        "core|log_message",
        "hi",
    )
    ctrl._diary("LOG", "прогон smoke", live=True)
    diary = diary_bus.read_file_backlog("diary")
    assert not any(e.get("kind") == "STEP" for e in diary)
    assert any(e.get("kind") == "LOG" and "прогон smoke" in e.get("text", "") for e in diary)


def test_diary_live_false_skips_ndjson(monkeypatch):
    from types import SimpleNamespace

    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {}

    ctrl._diary("STEP", "internal-only", "webdriver|click|css|.x", live=False)
    assert diary_bus.read_file_backlog("diary") == []

    ctrl._diary("ERROR", "boom", live=True)
    diary = diary_bus.read_file_backlog("diary")
    assert len(diary) == 1
    assert diary[0]["kind"] == "ERROR"
    assert "boom" in diary[0]["text"]


def test_session_diary_live_false_skips_ndjson():
    from adapters.webdriver_adapter import WebDriverAdapter

    adapter = WebDriverAdapter.__new__(WebDriverAdapter)
    adapter.session_diary("STEP", "quiet step", live=False)
    assert diary_bus.read_file_backlog("diary") == []

    adapter.session_diary("ERROR", "visible error", live=True)
    diary = diary_bus.read_file_backlog("diary")
    assert len(diary) == 1 and diary[0]["kind"] == "ERROR"


def test_zap_high_alert_is_trace_event_once(monkeypatch):
    from core.controller import Controller

    events = []
    monkeypatch.setattr(
        Controller,
        "_record_zap_trace_event",
        lambda _self, text, *, kind: events.append((kind, text)),
    )

    class Zap:
        @staticmethod
        def summarize_alerts_for_live(*, risks):
            return {"items": [{"kind": "ALERT", "line": "High: SQL Injection"}]}

    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {"zap": Zap()}

    ctrl._diary_zap_alerts()
    ctrl._diary_zap_alerts()

    assert events == [("alert", "High: SQL Injection")]


def test_publish_tags_run_id_from_env(monkeypatch):
    """MON-3: дочерний процесс с KDT_RUN_ID тегирует события run_id."""
    monkeypatch.setenv("KDT_RUN_ID", "run-abc123")
    diary_bus.publish("STEP", "tagged-step", channel="diary")
    diary = diary_bus.read_file_backlog("diary")
    assert diary[-1]["run_id"] == "run-abc123"
    monkeypatch.delenv("KDT_RUN_ID", raising=False)


def test_publish_without_run_id_has_no_tag(monkeypatch):
    """MON-3: без KDT_RUN_ID события не несут run_id."""
    monkeypatch.delenv("KDT_RUN_ID", raising=False)
    diary_bus.publish("NOTE", "untagged", channel="diary")
    diary = diary_bus.read_file_backlog("diary")
    assert "run_id" not in diary[-1]


def test_publish_step_with_pretty():
    """STEP с pretty-полем: лог остаётся `execution title | wire`, каретка — PrettyK."""
    diary_bus.publish(
        "STEP",
        "WebDriver: Нажать элемент | webdriver|click|css|.ok",
        channel="diary",
        pretty='Нажать css ".ok"',
    )
    diary = diary_bus.read_file_backlog("diary")
    event = diary[-1]
    assert event["kind"] == "STEP"
    assert event["pretty"] == 'Нажать css ".ok"'
    assert "WebDriver: Нажать элемент" in event["text"]
    assert "webdriver|click" in event["text"]


def test_publish_step_without_pretty():
    """STEP без pretty — поле отсутствует, обратная совместимость."""
    diary_bus.publish("STEP", "WebDriver: Открыть страницу | webdriver|open|http://x", channel="diary")
    diary = diary_bus.read_file_backlog("diary")
    assert "pretty" not in diary[-1]


def test_export_ndjson_path_for_run_id(tmp_path, monkeypatch):
    """MON-3: поиск экспорта по run_id через sidecar."""
    exports = tmp_path / "exports"
    exports.mkdir(parents=True)
    monkeypatch.setattr(diary_bus, "LIVE_EXPORTS_DIR", exports)
    (exports / "run-xyz.ndjson").write_text("{}", encoding="utf-8")
    (exports / "run-xyz.json").write_text(
        json.dumps({"run_id": "run-xyz"}), encoding="utf-8"
    )
    path = diary_bus.export_ndjson_path_for_run_id("run-xyz")
    assert path is not None and path.name == "run-xyz.ndjson"


def test_export_ndjson_path_for_run_id_missing(tmp_path, monkeypatch):
    exports = tmp_path / "exports"
    exports.mkdir(parents=True)
    monkeypatch.setattr(diary_bus, "LIVE_EXPORTS_DIR", exports)
    assert diary_bus.export_ndjson_path_for_run_id("no-such-run") is None


def test_journal_latest_query_by_run_id():
    """MON-3: /api/journal/latest?run_id= отдаёт пустой journal, если экспорта нет."""
    from urllib.request import urlopen

    url = start_live_server(session_name="run-id-journal")
    with urlopen(url + "api/journal/latest?run_id=no-such-run", timeout=2) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    assert payload["ok"] is True
    assert payload["run_id"] == "no-such-run"
    assert payload["events_total"] == 0


def test_export_by_run_id_requires_param():
    """MON-3: /api/export без run_id → 400."""
    from urllib.error import HTTPError
    from urllib.request import urlopen

    url = start_live_server(session_name="export-run-id")
    try:
        urlopen(url + "api/export", timeout=2)
    except HTTPError as exc:
        assert exc.code == 400
    else:
        raise AssertionError("expected 400 for missing run_id")


def test_export_by_run_id_missing_404():
    """MON-3: /api/export?run_id= неизвестный → 404."""
    from urllib.error import HTTPError
    from urllib.request import urlopen

    url = start_live_server(session_name="export-run-id-404")
    try:
        urlopen(url + "api/export?run_id=no-such-run", timeout=2)
    except HTTPError as exc:
        assert exc.code == 404
    else:
        raise AssertionError("expected 404 for missing export")


def test_recording_requires_run_id():
    """MON-5: /api/recording без run_id → 400."""
    from urllib.error import HTTPError
    from urllib.request import urlopen

    url = start_live_server(session_name="recording-run-id")
    try:
        urlopen(url + "api/recording", timeout=2)
    except HTTPError as exc:
        assert exc.code == 400
    else:
        raise AssertionError("expected 400 for missing run_id")


def test_recording_missing_404():
    """MON-5: /api/recording?run_id= неизвестный → 404."""
    from urllib.error import HTTPError
    from urllib.request import urlopen

    url = start_live_server(session_name="recording-run-id-404")
    try:
        urlopen(url + "api/recording?run_id=no-such-run", timeout=2)
    except HTTPError as exc:
        assert exc.code == 404
    else:
        raise AssertionError("expected 404 for missing recording")


def test_recording_serves_with_range(tmp_path):
    """MON-5: /api/recording?run_id= отдаёт видео с Range (206)."""
    from urllib.request import Request, urlopen

    video = tmp_path / "abc123_x.mp4"
    video.write_bytes(b"0123456789")
    url = start_live_server(session_name="recording-range")

    from utils import run_recording

    orig = run_recording.VIDEO_DIR
    run_recording.VIDEO_DIR = tmp_path
    try:
        req = Request(
            url + "api/recording?run_id=abc123",
            headers={"Range": "bytes=2-5"},
        )
        with urlopen(req, timeout=2) as resp:
            assert resp.status == 206
            assert resp.read() == b"2345"
            assert resp.headers.get("Accept-Ranges") == "bytes"
    finally:
        run_recording.VIDEO_DIR = orig


def test_serve_runs_apps_and_index(tmp_path, monkeypatch):
    """ADM-API-1: /api/runs/apps и /api/runs/index отдают правильный контракт."""
    from urllib.request import urlopen
    from utils import runs_index

    p = tmp_path / "test_runs_index.ndjson"
    monkeypatch.setattr(runs_index, "runs_index_path", lambda: p)
    runs_index.append_run_index(
        {
            "run_id": "r-app-1",
            "check_id": "chk-1",
            "instance_id": "chk-1",
            "app_code": "SEC_PORTAL",
            "deploy_url": "http://sec.local:8080",
            "status": "success",
            "owner_user_id": "appsec-expert",
        }
    )

    url = start_live_server(session_name="test-runs-apps")
    with urlopen(url + "api/runs/apps", timeout=2) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    assert data["ok"] is True
    assert data["count"] >= 1
    app = next((a for a in data["apps"] if a["app_code"] == "SEC_PORTAL"), None)
    assert app is not None
    assert app["deploys"][0]["deploy_url"] == "http://sec.local:8080"
    assert app["deploys"][0]["instances"][0]["run_id"] == "r-app-1"


def test_serve_retention_api(tmp_path, monkeypatch):
    """RET-API: проверка GET /api/admin/retention/status и POST clean."""
    from urllib.request import Request, urlopen
    from utils import retention_manager

    vdir = tmp_path / "video"
    vdir.mkdir(parents=True)
    (vdir / "old.mp4").write_bytes(b"test")

    monkeypatch.setattr(retention_manager, "VIDEO_DIR", vdir)

    url = start_live_server(session_name="test-retention-api")
    with urlopen(url + "api/admin/retention/status", timeout=2) as resp:
        status_data = json.loads(resp.read().decode("utf-8"))
    assert status_data["ok"] is True
    assert "categories" in status_data

    # POST clean
    req = Request(
        url + "api/admin/retention/clean",
        data=json.dumps({"days_older_than": 0, "dry_run": False}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urlopen(req, timeout=2) as resp:
        clean_data = json.loads(resp.read().decode("utf-8"))
    assert clean_data["ok"] is True
    assert clean_data["deleted_count"] >= 1


def test_export_diary_filters_by_run_id(monkeypatch):
    """export_diary_snapshot filters events by run_id; events without run_id pass through."""
    monkeypatch.delenv("KDT_RUN_ID", raising=False)
    diary_bus.clear()
    diary_bus.publish("STEP", "shared-no-run", channel="diary")
    monkeypatch.setenv("KDT_RUN_ID", "alpha")
    diary_bus.publish("STEP", "alpha-only", channel="diary")
    monkeypatch.setenv("KDT_RUN_ID", "beta")
    diary_bus.publish("STEP", "beta-only", channel="diary")

    # Without run_id — all events back (backwards-compat)
    all_export = diary_bus.export_diary_snapshot(run_id="", filter_preset="all")
    assert all_export["events_count"] == 3

    # Filter to alpha — events without run_id AND alpha events
    alpha_export = diary_bus.export_diary_snapshot(run_id="alpha", filter_preset="all")
    assert alpha_export["events_count"] == 2
    raw = Path(alpha_export["export_path"]).read_text(encoding="utf-8")
    lines = [json.loads(x) for x in raw.splitlines() if x.strip()]
    assert any("shared-no-run" in e["text"] for e in lines)
    assert any("alpha-only" in e["text"] for e in lines)
    assert not any("beta-only" in e.get("text", "") for e in lines)

    # Filter to beta — events without run_id AND beta events
    beta_export = diary_bus.export_diary_snapshot(run_id="beta", filter_preset="all")
    raw_beta = Path(beta_export["export_path"]).read_text(encoding="utf-8")
    lines_beta = [json.loads(x) for x in raw_beta.splitlines() if x.strip()]
    assert any("shared-no-run" in e["text"] for e in lines_beta)
    assert any("beta-only" in e["text"] for e in lines_beta)
    assert not any("alpha-only" in e.get("text", "") for e in lines_beta)


def test_get_results_hooks_filters_by_run_id(monkeypatch, tmp_path: Path):
    """get_results_hooks(run_id=...) filters hook entries matching that run."""
    live = tmp_path / "live2"
    live.mkdir()
    hooks_path = live / "results_hooks.json"
    monkeypatch.setattr("utils.diary_bus.RESULTS_HOOKS_JSON", hooks_path)
    monkeypatch.setattr("utils.diary_bus.ensure_live_dir", lambda: live.mkdir(parents=True, exist_ok=True))

    hooks_path.write_text(json.dumps({
        "allure": {"report_url": "http://127.0.0.1:5050/", "run_id": "alpha", "allure_project_id": "default"},
        "dojo": {"report_url": "http://127.0.0.1:8081/", "run_id": "beta", "engagement_id": "123"},
        "zap": {"report_url": "http://127.0.0.1:8080/", "run_id": None},
    }), encoding="utf-8")

    # No filter — all hooks returned
    all_hooks = diary_bus.get_results_hooks()
    assert all_hooks["allure"] is not None
    assert all_hooks["dojo"] is not None

    # Filter to alpha — only allure matches
    alpha_hooks = diary_bus.get_results_hooks(run_id="alpha")
    assert alpha_hooks["allure"] is not None
    assert alpha_hooks["allure"]["run_id"] == "alpha"
    assert alpha_hooks["dojo"] is None  # dojo is beta, filtered out

    # Filter to beta — only dojo matches
    beta_hooks = diary_bus.get_results_hooks(run_id="beta")
    assert beta_hooks["allure"] is None
    assert beta_hooks["dojo"] is not None
    assert beta_hooks["dojo"]["run_id"] == "beta"

    # zap has no run_id — passes through any filter
    assert beta_hooks["zap"] is not None

    # Filter to unknown run — all filtered out (except hook without run_id)
    unknown_hooks = diary_bus.get_results_hooks(run_id="unknown")
    assert unknown_hooks["allure"] is None
    assert unknown_hooks["dojo"] is None
    assert unknown_hooks["zap"] is not None  # no run_id — passes


