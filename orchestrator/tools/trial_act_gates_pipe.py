# -*- coding: utf-8 -*-
"""
Wave A live proof: stub C1–C4 + generate_act matrix N1–N8.
Requires playground :8765, Live :8767. Writes evidence to --out dir.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PLAY = "http://127.0.0.1:8765"
LIVE = "http://127.0.0.1:8767"


def _http(
    method: str, url: str, body: dict | None = None, timeout: float = 30
) -> Tuple[int, Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            payload = {"error": raw}
        return e.code, payload


def _wait_idle(timeout: float = 60) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        _, st = _http("GET", f"{PLAY}/api/run/status")
        if st.get("phase") != "running":
            return
        time.sleep(0.3)
    raise RuntimeError("lab runner stuck running")


def _wait_finished(run_id: str, timeout: float = 90) -> Dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        _, st = _http("GET", f"{PLAY}/api/run/status")
        if st.get("run_id") == run_id and st.get("phase") == "finished":
            return st
        time.sleep(0.25)
    raise RuntimeError(f"run {run_id} did not finish")


def _meta() -> Dict[str, Any]:
    _, m = _http("GET", f"{LIVE}/api/meta")
    return m if isinstance(m, dict) else {}


def _hooks() -> Dict[str, Any]:
    _, h = _http("GET", f"{LIVE}/api/results/hooks")
    return h if isinstance(h, dict) else {}


def _hook_urls(h: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    a = h.get("allure") if isinstance(h.get("allure"), dict) else {}
    d = h.get("dojo") if isinstance(h.get("dojo"), dict) else {}
    return a.get("report_url"), d.get("report_url")


def _base_wired(**meta_extra: Any) -> Dict[str, Any]:
    meta = {
        "assessment_purpose": "emergency",
        "emergency_reason": "trial act-gates pipe",
        "project_id": "trial-act-gates",
        "generate_act": False,
    }
    meta.update(meta_extra)
    return {
        "meta": meta,
        "infrastructure": {
            "zap_mode": "demon",
            "browser_type": "chrome",
            "base_url_override": "http://juice-shop:3000",
            "allowed_extra_domains": "",
            "debug_mode": False,
        },
    }


def _start(wired: Dict[str, Any], stub_opts: Dict[str, Any], session: str) -> str:
    _wait_idle()
    code, started = _http(
        "POST",
        f"{PLAY}/api/run/start",
        {
            "wired": Wired,
            "session_name": session,
            "stub": True,
            "stub_opts": stub_opts,
        },
    )
    if code != 200 or not started.get("ok"):
        raise RuntimeError(f"start failed {code}: {started}")
    return str(started["run_id"])


def _package_info() -> Dict[str, Any]:
    # Live package endpoint
    code, body = _http("GET", f"{LIVE}/api/package/latest", timeout=60)
    if code != 200:
        raise RuntimeError(f"package failed {code}: {body}")
    return body if isinstance(body, dict) else {}


def _zip_act_status(path: str) -> Dict[str, Any]:
    p = Path(path)
    if not p.is_file():
        return {"error": f"missing {path}"}
    with zipfile.ZipFile(p, "r") as zf:
        names = set(zf.namelist())
        pkg = {}
        if "meta/package.json" in names:
            raw = zf.read("meta/package.json")
            pkg = json.loads(raw.decode("utf-8", errors="replace"))
    return {
        "has_act_html": "act/act.html" in names,
        "act": pkg.get("act"),
        "act_omit_reason": pkg.get("act_omit_reason"),
    }


def _line(log: List[str], msg: str) -> None:
    print(msg, flush=True)
    log.append(msg)


def main(argv: List[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="reports/trials/... dir")
    args = ap.parse_args(argv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    log: List[str] = []
    results: Dict[str, Any] = {"cases": {}}

    def record(case_id: str, ok: bool, detail: Dict[str, Any]) -> None:
        results["cases"][case_id] = {"ok": ok, **detail}
        status = "PASS" if ok else "FAIL"
        _line(log, f"[{status}] {case_id}: {json.dumps(detail, ensure_ascii=False)}")

    # --- C1 clear + pass ---
    try:
        _http(
            "POST",
            f"{LIVE}/api/results/hooks",
            {
                "allure_report_url": "http://127.0.0.1:5050/?stale=1",
                "dojo_report_url": "http://127.0.0.1:8081/engagement/999",
            },
        )
        rid = _start(
            _base_wired(generate_act=True),
            {"sleep_s": 0.2, "exit_code": 0, "gate": "pass"},
            "c1-pass",
        )
        h0 = _hooks()
        a0, d0 = _hook_urls(h0)
        cleared = not a0 and not d0
        st = _wait_finished(rid)
        # wait hooks
        a1 = d1 = None
        for _ in range(40):
            a1, d1 = _hook_urls(_hooks())
            if a1 and d1:
                break
            time.sleep(0.25)
        m = _meta()
        ok = (
            cleared
            and a1
            and d1
            and "stale" not in (a1 or "")
            and "999" not in (d1 or "")
            and m.get("ci_verdict") == "pass"
            and m.get("generate_act") is True
        )
        record(
            "C1",
            bool(ok),
            {
                "cleared": cleared,
                "allure": a1,
                "dojo": d1,
                "verdict": m.get("ci_verdict"),
                "generate_act": m.get("generate_act"),
                "exit": st.get("exit_code"),
            },
        )
    except Exception as e:
        record("C1", False, {"error": str(e)})

    # --- C2 fail_gate butta ---
    try:
        rid = _start(
            _base_wired(generate_act=True),
            {
                "sleep_s": 0.15,
                "dojo_butta_high": True,
                "apply_dojo_gate": True,
            },
            "c2-fail-gate",
        )
        _wait_finished(rid)
        m = _meta()
        a, d = _hook_urls(_hooks())
        ok = m.get("ci_verdict") == "fail_gate" and m.get("ci_exit_code") == 2 and a and d
        record(
            "C2",
            bool(ok),
            {
                "verdict": m.get("ci_verdict"),
                "exit": m.get("ci_exit_code"),
                "hooks": bool(a and d),
            },
        )
    except Exception as e:
        record("C2", False, {"error": str(e)})

    # --- C3 fail before hooks ---
    try:
        rid = _start(
            _base_wired(generate_act=True),
            {"sleep_s": 0.1, "fail_before_hooks": True},
            "c3-crash",
        )
        _wait_finished(rid)
        m = _meta()
        a, d = _hook_urls(_hooks())
        ok = m.get("ci_verdict") == "fail_run" and not a and not d
        record(
            "C3",
            bool(ok),
            {"verdict": m.get("ci_verdict"), "allure": a, "dojo": d},
        )
    except Exception as e:
        record("C3", False, {"error": str(e)})

    # --- C4 stop ---
    try:
        _wait_idle()
        code, started = _http(
            "POST",
            f"{PLAY}/api/run/start",
            {
                "wired": _base_wired(generate_act=True),
                "session_name": "c4-stop",
                "stub": True,
                "stub_opts": {"sleep_s": 8.0, "exit_code": 0},
            },
        )
        if code != 200 or not started.get("ok"):
            raise RuntimeError(f"C4 start failed code={code} body={started}")
        rid = str(started["run_id"])
        time.sleep(0.4)
        sc, stopped = _http("POST", f"{PLAY}/api/run/stop", {})
        st = _wait_finished(rid, timeout=30)
        ok = sc == 200 and int(st.get("exit_code") or 0) == 1
        record("C4", bool(ok), {"stop": stopped, "exit": st.get("exit_code")})
    except Exception as e:
        record("C4", False, {"error": str(e)})

    # --- N1 generate_act false → zip omit ---
    try:
        rid = _start(
            _base_wired(generate_act=False),
            {"sleep_s": 0.15, "exit_code": 0, "gate": "pass"},
            "n1-no-act",
        )
        _wait_finished(rid)
        for _ in range(40):
            if all(_hook_urls(_hooks())):
                break
            time.sleep(0.2)
        m = _meta()
        from utils import run_package

        info = run_package.build_run_package(run_id="n1-no-act")
        zip_st = _zip_act_status(str(info.get("path") or ""))
        ok = (
            m.get("generate_act") is not True
            and zip_st.get("has_act_html") is False
            and zip_st.get("act") == "omitted"
            and zip_st.get("act_omit_reason") == "generate_act_off"
        )
        record("N1", bool(ok), {"meta_generate_act": m.get("generate_act"), **zip_st})
    except Exception as e:
        record("N1", False, {"error": str(e)})

    # --- N2 fail_run VOID → zip omit admission ---
    try:
        rid = _start(
            _base_wired(generate_act=True),
            {"sleep_s": 0.1, "fail_before_hooks": True},
            "n2-void",
        )
        _wait_finished(rid)
        m = _meta()
        # seed hooks artificially so package can build; axis still not ready
        _http(
            "POST",
            f"{LIVE}/api/results/hooks",
            {
                "allure_report_url": "http://127.0.0.1:5050/",
                "dojo_report_url": "http://127.0.0.1:8081/engagement/1",
            },
        )
        from utils import run_package

        info = run_package.build_run_package(run_id="n2-void")
        zip_st = _zip_act_status(str(info.get("path") or ""))
        ok = (
            m.get("generate_act") is True
            and m.get("ci_verdict") == "fail_run"
            and zip_st.get("has_act_html") is False
            and zip_st.get("act_omit_reason") == "admission_axis_not_ready"
        )
        record(
            "N2",
            bool(ok),
            {
                "verdict": m.get("ci_verdict"),
                "generate_act": m.get("generate_act"),
                **zip_st,
            },
        )
    except Exception as e:
        record("N2", False, {"error": str(e)})

    # --- N3 fail_gate + generate_act → zip include ---
    try:
        rid = _start(
            _base_wired(generate_act=True),
            {
                "sleep_s": 0.15,
                "dojo_butta_high": True,
                "apply_dojo_gate": True,
            },
            "n3-fail-gate-act",
        )
        _wait_finished(rid)
        for _ in range(40):
            if all(_hook_urls(_hooks())):
                break
            time.sleep(0.2)
        m = _meta()
        from utils import run_package

        info = run_package.build_run_package(run_id="n3-fail-gate-act")
        zip_st = _zip_act_status(str(info.get("path") or ""))
        act_html_ok = False
        if zip_st.get("has_act_html"):
            with zipfile.ZipFile(info["path"], "r") as zf:
                html = zf.read("act/act.html").decode("utf-8")
                act_html_ok = "не пройден" in html or "Допуск" in html
        ok = (
            m.get("ci_verdict") == "fail_gate"
            and m.get("generate_act") is True
            and zip_st.get("has_act_html") is True
            and zip_st.get("act") == "included"
            and act_html_ok
        )
        record(
            "N3",
            bool(ok),
            {
                "verdict": m.get("ci_verdict"),
                "act_html_ok": act_html_ok,
                **zip_st,
            },
        )
    except Exception as e:
        record("N3", False, {"error": str(e)})

    # --- N4 pass_watch soft ---
    try:
        rid = _start(
            _base_wired(generate_act=True),
            {
                "sleep_s": 0.15,
                "exit_code": 0,
                "gate": "watch",
                "dojo_stats": {
                    "critical": 0,
                    "high": 0,
                    "medium": 2,
                    "low": 1,
                    "info": 0,
                },
                "apply_dojo_gate": True,
            },
            "n4-watch",
        )
        _wait_finished(rid)
        for _ in range(40):
            if all(_hook_urls(_hooks())):
                break
            time.sleep(0.2)
        m = _meta()
        from utils import run_package

        info = run_package.build_run_package(run_id="n4-watch")
        zip_st = _zip_act_status(str(info.get("path") or ""))
        verdict = str(m.get("ci_verdict") or "")
        ok = (
            verdict in {"pass", "pass_watch", "pass_edge"}
            and zip_st.get("has_act_html") is True
            and zip_st.get("act") == "included"
        )
        record("N4", bool(ok), {"verdict": verdict, **zip_st})
    except Exception as e:
        record("N4", False, {"error": str(e)})

    # --- N5 pre_release forces generate_act ---
    try:
        rid = _start(
            {
                "meta": {
                    "assessment_purpose": "pre_release",
                    "release_domain": "trial-deploy",
                    "compliance_requirements": "lab",
                    "release_manager": "rm@trial.test",
                    "generate_act": False,
                },
                "infrastructure": {
                    "zap_mode": "demon",
                    "browser_type": "chrome",
                    "base_url_override": "http://juice-shop:3000",
                    "allowed_extra_domains": "",
                },
            },
            {"sleep_s": 0.1, "exit_code": 0, "gate": "pass"},
            "n5-prerelease",
        )
        _wait_finished(rid)
        m = _meta()
        ok = m.get("generate_act") is True and m.get("assessment_purpose") == "pre_release"
        record(
            "N5",
            bool(ok),
            {
                "generate_act": m.get("generate_act"),
                "purpose": m.get("assessment_purpose"),
            },
        )
    except Exception as e:
        record("N5", False, {"error": str(e)})

    # --- N6 manual forces false ---
    try:
        rid = _start(
            {
                "meta": {
                    "assessment_purpose": "manual",
                    "generate_act": True,
                },
                "infrastructure": {
                    "webswing_session_timeout_min": 60,
                    "idle_timeout_min": 10,
                },
            },
            {"sleep_s": 0.1, "exit_code": 0, "gate": "pass"},
            "n6-manual",
        )
        _wait_finished(rid)
        m = _meta()
        ok = m.get("generate_act") is False and m.get("assessment_purpose") == "manual"
        record(
            "N6",
            bool(ok),
            {
                "generate_act": m.get("generate_act"),
                "purpose": m.get("assessment_purpose"),
            },
        )
    except Exception as e:
        record("N6", False, {"error": str(e)})

    # --- N7 package unlock vs act (FE rules mirrored in BE helper) ---
    try:
        from utils.run_package import is_admission_axis_ready

        def _hooks_ready(a: str, d: str) -> bool:
            return bool(a and d)

        def _act_enabled(meta: Dict[str, Any], a: str, d: str) -> bool:
            return (
                meta.get("generate_act") is True
                and is_admission_axis_ready(meta)
                and _hooks_ready(a, d)
            )

        a, d = "http://127.0.0.1:5050/", "http://127.0.0.1:8081/engagement/1"
        meta_bad = {
            "generate_act": True,
            "ci_verdict": "fail_run",
            "ci_exit_code": 1,
            "ci_risk_hints": {"admission_void": True},
        }
        meta_good = {"generate_act": True, "ci_verdict": "fail_gate", "ci_exit_code": 2}
        pkg_ok = _hooks_ready(a, d)
        act_fail_run = _act_enabled(meta_bad, a, d)
        act_fail_gate = _act_enabled(meta_good, a, d)
        ok = pkg_ok and (not act_fail_run) and act_fail_gate
        record(
            "N7",
            bool(ok),
            {
                "package_unlock_on_hooks": pkg_ok,
                "act_on_fail_run": act_fail_run,
                "act_on_fail_gate": act_fail_gate,
            },
        )
    except Exception as e:
        record("N7", False, {"error": str(e)})

    # --- N8 demo seed ---
    try:
        import subprocess

        env = dict(**__import__("os").environ)
        env["PYTHONIOENCODING"] = "utf-8"
        r = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).resolve().parent / "results_hooks_demo.py"),
                "both",
                "--seed-act",
            ],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            env=env,
        )
        m = _meta()
        a, d = _hook_urls(_hooks())
        from utils.run_package import is_admission_axis_ready

        axis = is_admission_axis_ready(m)
        # demo may exit≠0 on Windows console print; meta/hooks are SoT
        ok = m.get("generate_act") is True and bool(a and d) and axis
        record(
            "N8",
            bool(ok),
            {
                "demo_rc": r.returncode,
                "generate_act": m.get("generate_act"),
                "verdict": m.get("ci_verdict"),
                "hooks": bool(a and d),
                "axis": axis,
            },
        )
    except Exception as e:
        record("N8", False, {"error": str(e)})

    failed = [k for k, v in results["cases"].items() if not v.get("ok")]
    results["summary"] = {
        "total": len(results["cases"]),
        "passed": len(results["cases"]) - len(failed),
        "failed": failed,
    }
    (out / "live-api-proof.txt").write_text("\n".join(log) + "\n", encoding="utf-8")
    (out / "matrix.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    _line(log, f"SUMMARY {results['summary']}")
    (out / "evidence.log").write_text("\n".join(log) + "\n", encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
