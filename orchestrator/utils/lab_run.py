# -*- coding: utf-8 -*-
"""Lab single-flight runner: Editor → playground → subprocess main.py."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.wired_validate import validate_wired_file
from utils.paths import REPO_ROOT, RUNS_DIR, ensure_runs_dir

# WIRE-RUNCTL: управляемый жизненный цикл запуска поверх single-flight subprocess.
from core.run_control_plane import RunControlPlane, FailureClass, RunState

_lock = threading.Lock()
_active_proc: Optional[subprocess.Popen] = None
_STATUS_NAME = "current.json"


def _status_path() -> Path:
    return ensure_runs_dir() / _STATUS_NAME


def _python_exe() -> str:
    if os.name == "nt":
        candidate = REPO_ROOT / ".venv" / "Scripts" / "python.exe"
    else:
        candidate = REPO_ROOT / ".venv" / "bin" / "python"
    if candidate.is_file():
        return str(candidate)
    return sys.executable


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    except SystemError:
        return False
    return True


def _read_status() -> Dict[str, Any]:
    path = _status_path()
    if not path.is_file():
        return {"phase": "idle", "run_id": None, "pid": None, "exit_code": None}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"phase": "idle", "run_id": None, "pid": None, "exit_code": None}
    if not isinstance(raw, dict):
        return {"phase": "idle", "run_id": None, "pid": None, "exit_code": None}
    return raw


def _write_status(payload: Dict[str, Any]) -> None:
    path = _status_path()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _sync_finished_if_dead(status: Dict[str, Any]) -> Dict[str, Any]:
    """If status says running but PID is gone, mark finished (best-effort)."""
    phase = str(status.get("phase") or "idle")
    pid = status.get("pid")
    if phase != "running" or not isinstance(pid, int):
        return status
    global _active_proc
    if _active_proc is not None and _active_proc.pid == pid:
        code = _active_proc.poll()
        if code is None:
            return status
        status = {
            **status,
            "phase": "finished",
            "exit_code": int(code),
            "finished_at": time.time(),
        }
        _write_status(status)
        _active_proc = None
        return status
    if _pid_alive(pid):
        return status
    status = {
        **status,
        "phase": "finished",
        "exit_code": status.get("exit_code"),
        "finished_at": time.time(),
    }
    _write_status(status)
    return status


def get_run_status() -> Dict[str, Any]:
    with _lock:
        status = _sync_finished_if_dead(_read_status())
    return {
        "ok": True,
        "phase": status.get("phase") or "idle",
        "run_id": status.get("run_id"),
        "pid": status.get("pid"),
        "exit_code": status.get("exit_code"),
        "session_name": status.get("session_name"),
        "wired_path": status.get("wired_path"),
        "log_path": status.get("log_path"),
        "started_at": status.get("started_at"),
        "finished_at": status.get("finished_at"),
        "error": status.get("error"),
    }


def _import_search_roots() -> list[Path]:
    """Где искать relative imports[].path до копирования в run_dir."""
    return [
        REPO_ROOT,
        REPO_ROOT / "orchestrator",
        REPO_ROOT / "orchestrator" / "wired" / "lab",
    ]


def _chain_bindings_for_fields(
    wired: dict,
    fields: Dict[str, Any],
    chain_bindings: Optional[Dict[str, str]],
) -> Dict[str, str]:
    # value_pack_module (properties) < studio bindings < Launch chain_bindings
    bind: Dict[str, str] = {}
    try:
        from utils.chain_ops import bindings_from_value_pack_module

        vpmid = str(fields.get("value_pack_module") or "").strip()
        if vpmid:
            pack, _pack_notes = bindings_from_value_pack_module(wired, vpmid)
            bind.update(pack)
    except Exception:
        pass
    stored = fields.get("bindings")
    if isinstance(stored, dict):
        for k, v in stored.items():
            bind[str(k)] = str(v)
    if chain_bindings:
        for k, v in chain_bindings.items():
            bind[str(k)] = str(v)
    return bind


def _ensure_har_import(imports: List[Any], *, har_as: str, path: str) -> None:
    if any(
        isinstance(it, dict)
        and str(it.get("as") or "") == har_as
        and str(it.get("kind") or "") == "har_file"
        for it in imports
    ):
        return
    imports.append({"path": path, "kind": "har_file", "as": har_as})


def _materialize_one_chain_module(
    wired: dict,
    mod: Dict[str, Any],
    imports: List[Any],
    out: Dict[str, str],
    chain_bindings: Optional[Dict[str, str]],
    materialize_chain_fields: Any,
    ChainError: Any,
) -> None:
    fields = mod.get("chain_fields")
    if not isinstance(fields, dict):
        return
    template = str(fields.get("template_har") or "").strip()
    source = str(fields.get("source_har") or "").strip()
    if not template and not source:
        return
    bind = _chain_bindings_for_fields(wired, fields, chain_bindings)
    try:
        built = materialize_chain_fields(fields, bindings=bind, wired=wired)
    except ChainError:
        return
    har_as = str(built.get("har_as") or "chain")
    out[har_as] = str(built.get("har_text") or "")
    path = str(built.get("har_path") or f"resources/{har_as}.har")
    _ensure_har_import(imports, har_as=har_as, path=path)


def materialize_chain_modules(
    wired: dict,
    resource_contents: Optional[Dict[str, str]],
    chain_bindings: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """
    IMP-CHAIN: module_type=Цепь → concrete .har into resource_contents + imports[].

    Mutates wired imports when missing har_file for har_as.
    """
    out: Dict[str, str] = dict(resource_contents or {})
    suites = wired.get("test_suites")
    if not isinstance(suites, dict):
        return out
    modules = suites.get("test_data_constructor")
    if not isinstance(modules, list):
        return out
    imports = suites.get("imports")
    if not isinstance(imports, list):
        imports = []
        suites["imports"] = imports
    try:
        from utils.chain_ops import ChainError, materialize_chain_fields
    except Exception:
        return out
    for mod in modules:
        if not isinstance(mod, dict) or mod.get("module_type") != "Цепь":
            continue
        _materialize_one_chain_module(
            wired,
            mod,
            imports,
            out,
            chain_bindings,
            materialize_chain_fields,
            ChainError,
        )
    return out


def _safe_run_dest(run_dir: Path, rel: str) -> Path:
    dest = (run_dir / rel).resolve()
    try:
        dest.relative_to(run_dir.resolve())
    except ValueError as exc:
        raise ValueError(f"path выходит за run_dir: {rel}") from exc
    return dest


def write_resource_contents(
    wired: dict,
    run_dir: Path,
    resource_contents: Optional[Dict[str, str]],
) -> None:
    """
    Editor draft → run_dir/resources/{as}.(txt|har) before path resolve.

    Keys = imports[].as (or stem). Values = file text (HAR JSON as utf-8).
    """
    if not resource_contents:
        return
    suites = wired.get("test_suites")
    if not isinstance(suites, dict):
        return
    imports = suites.get("imports")
    if not isinstance(imports, list):
        return
    for item in imports:
        if not isinstance(item, dict):
            continue
        as_name = str(item.get("as") or "").strip()
        raw_path = str(item.get("path") or "").strip().replace("\\", "/")
        if not as_name and raw_path:
            as_name = Path(raw_path).stem
        if not as_name or as_name not in resource_contents:
            continue
        rel = raw_path if raw_path else f"resources/{as_name}.txt"
        if Path(rel).is_absolute():
            continue
        dest = _safe_run_dest(run_dir, rel)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(resource_contents[as_name], encoding="utf-8")


def _materialize_one_import(run_dir: Path, raw: str) -> Optional[str]:
    """Copy one relative import into run_dir. Return missing path or None."""
    p = Path(raw)
    if p.is_absolute():
        return None if p.is_file() else raw
    dest = _safe_run_dest(run_dir, raw)
    if dest.is_file():
        return None
    for root in _import_search_roots():
        cand = (root / raw).resolve()
        if cand.is_file():
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(cand.read_bytes())
            return None
    return raw


def materialize_suite_imports(wired: dict, run_dir: Path) -> None:
    """
    Скопировать relative test_suites.imports[].path в run_dir.

    Temp-манифест живёт в reports/runs/<id>/; path вида resources/r_2.txt
    иначе не находится (resolve относительно каталога манифеста).
    """
    suites = wired.get("test_suites")
    if not isinstance(suites, dict):
        return
    imports = suites.get("imports")
    if not isinstance(imports, list) or not imports:
        return

    missing: list[str] = []
    for item in imports:
        if not isinstance(item, dict):
            continue
        raw = str(item.get("path") or "").strip().replace("\\", "/")
        if not raw:
            continue
        miss = _materialize_one_import(run_dir, raw)
        if miss:
            missing.append(miss)

    if missing:
        raise ValueError(
            "imports: файл не найден для lab-run (ожидался resource_contents, "
            "рядом с wired или в lab/resources): " + ", ".join(missing)
        )


def _clear_live_report_hooks() -> None:
    """New lab-run: drop stale Allure/Dojo glow + summary mirrors before spawn."""
    try:
        from utils.diary_bus import clear_results_hooks

        clear_results_hooks()
    except Exception:
        pass
    try:
        from utils.live_mirrors import clear_live_results_mirrors

        clear_live_results_mirrors()
    except Exception:
        pass


def _seed_act_flags_from_wired(wired: Dict[str, Any]) -> None:
    """
    Live meta.generate_act (+ purpose) до stub/controller — ворота акта/zip.
    Зеркало allOf: manual→false, pre_release→true, иначе явный true.
    """
    try:
        from utils.diary_bus import set_meta

        set_meta(**_act_flags_from_wired(wired))
    except Exception:
        pass


def _stub_cmd(stub_opts: Optional[Dict[str, Any]], session_name: str | None) -> list[str]:
    """argv for tools.lab_run_stub."""
    opts = stub_opts if isinstance(stub_opts, dict) else {}
    sleep_s = opts.get("sleep_s", opts.get("sleep", 0.05))
    try:
        sleep_s = float(sleep_s)
    except (TypeError, ValueError):
        sleep_s = 0.05
    exit_code = opts.get("exit_code", 0)
    try:
        exit_code = int(exit_code)
    except (TypeError, ValueError):
        exit_code = 0
    gate = str(opts.get("gate") or "pass")
    conclusion = str(opts.get("conclusion") or "")
    allure_url = str(opts.get("allure_url") or "http://127.0.0.1:5050/")
    dojo_url = str(opts.get("dojo_url") or "http://127.0.0.1:8081/engagement/1")
    job_name = str(
        opts.get("job_name")
        or (session_name or "").strip()
        or "lab-stub"
    )
    cmd = [
        _python_exe(),
        "-m",
        "tools.lab_run_stub",
        "--sleep",
        str(sleep_s),
        "--exit-code",
        str(exit_code),
        "--gate",
        gate,
        "--allure-url",
        allure_url,
        "--dojo-url",
        dojo_url,
        "--job-name",
        job_name,
    ]
    if conclusion:
        cmd.extend(["--conclusion", conclusion])
    if opts.get("skip_hooks") is True:
        cmd.append("--skip-hooks")
    if opts.get("fail_before_hooks") is True:
        cmd.append("--fail-before-hooks")
    if opts.get("apply_dojo_gate") is True:
        cmd.append("--apply-dojo-gate")
    if opts.get("dojo_butta_high") is True:
        cmd.append("--dojo-butta-high")
    dojo_stats = opts.get("dojo_stats")
    if isinstance(dojo_stats, dict) and dojo_stats:
        cmd.extend(["--dojo-stats-json", json.dumps(dojo_stats, ensure_ascii=False)])
    desc = opts.get("job_description")
    if isinstance(desc, str) and desc.strip():
        cmd.extend(["--job-description", desc.strip()])
    # Act gates: stub process overwrites meta.json — re-seed flags in child.
    if "generate_act" in opts:
        cmd.append("--generate-act" if opts.get("generate_act") is True else "--no-generate-act")
    purpose = opts.get("assessment_purpose")
    if isinstance(purpose, str) and purpose.strip():
        cmd.extend(["--assessment-purpose", purpose.strip()])
    return cmd


def _act_flags_from_wired(wired: Dict[str, Any]) -> Dict[str, Any]:
    meta = wired.get("meta") if isinstance(wired.get("meta"), dict) else {}
    purpose = str(meta.get("assessment_purpose") or "").strip()
    if purpose == "manual":
        generate_act = False
    elif purpose == "pre_release":
        generate_act = True
    else:
        generate_act = meta.get("generate_act") is True
    out: Dict[str, Any] = {"generate_act": generate_act}
    if purpose:
        out["assessment_purpose"] = purpose
    return out


def _prepare_run_wired(
    wired: dict,
    *,
    run_dir: Path,
    stub: bool,
    resource_contents: Optional[Dict[str, str]] = None,
    chain_bindings: Optional[Dict[str, str]] = None,
) -> Path:
    wired_path = run_dir / "wired.json"
    _clear_live_report_hooks()
    _seed_act_flags_from_wired(wired)
    if not stub:
        merged = materialize_chain_modules(
            wired, resource_contents, chain_bindings=chain_bindings
        )
        write_resource_contents(wired, run_dir, merged)
        materialize_suite_imports(wired, run_dir)
    wired_path.write_text(
        json.dumps(wired, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if not stub:
        issues, _validated = validate_wired_file(wired_path)
        if issues:
            raise ValueError("; ".join(issues[:12]))
    return wired_path


def _run_command(
    *,
    wired: dict,
    wired_path: Path,
    session_name: str | None,
    stub: bool,
    stub_opts: Optional[Dict[str, Any]],
) -> list[str]:
    if stub:
        merged_opts = dict(stub_opts) if isinstance(stub_opts, dict) else {}
        for key, val in _act_flags_from_wired(wired).items():
            merged_opts.setdefault(key, val)
        return _stub_cmd(merged_opts, session_name)
    main_py = REPO_ROOT / "orchestrator" / "main.py"
    if not main_py.is_file():
        raise RuntimeError(f"main.py not found: {main_py}")
    return [_python_exe(), str(main_py), "--wired", str(wired_path)]


# Lab FE opt-in only — never arbitrary process env from clients.
_LAB_ENV_ALLOWLIST = frozenset({"PK_TRAFFIC_INSERTION_FEED"})


def _merge_lab_env_overrides(
    env: Dict[str, str],
    overrides: Optional[Dict[str, str]],
) -> Dict[str, str]:
    if not isinstance(overrides, dict):
        return env
    for key, raw in overrides.items():
        name = str(key).strip()
        if name not in _LAB_ENV_ALLOWLIST:
            continue
        val = str(raw).strip()
        if val:
            env[name] = val
        else:
            env.pop(name, None)
    return env


_DOJO_KEYS = frozenset({"PK_DEFECTDOJO_URL", "PK_DEFECTDOJO_TOKEN", "PK_DEFECTDOJO_ENGAGEMENT", "PK_DEFECTDOJO_ENGAGEMENT_MODE", "PK_DOJO_PRODUCT_NAME", "PK_DEFECTDOJO_PRODUCT_TYPE", "PK_DEFECTDOJO_SCAN_TYPE"})


def _seed_dojo_env(env: Dict[str, str]) -> None:
    """Dojo-переменные из .env.example имеют приоритет над системными."""
    try:
        path = REPO_ROOT / "services" / "defectdojo" / ".env.example"
        if not path.is_file():
            return
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            k, _, v = stripped.partition("=")
            k = k.strip()
            if k not in _DOJO_KEYS:
                continue
            env[k] = v.strip().strip("'\"").strip()
    except OSError:
        pass


def _lab_env(
    *,
    session_name: str | None,
    run_id: str | None = None,
    owner_user_id: str | None = None,
    check_id: str | None = None,
    env_overrides: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    env = os.environ.copy()
    # Dojo env: subprocess inherits from os.environ; seed from .env.example if missing.
    _seed_dojo_env(env)
    env["PK_LIVE"] = "1"
    if session_name and session_name.strip():
        env["PK_SESSION_NAME"] = session_name.strip()
    rid = (run_id or "").strip()
    if rid:
        env["PK_RUN_ID"] = rid
    cid = (check_id or "").strip()
    if cid:
        env["PK_CHECK_ID"] = cid
    owner = (owner_user_id or "").strip()
    if not owner:
        try:
            from utils.live_pers_acl import resolve_run_owner_user_id

            owner = resolve_run_owner_user_id() or ""
        except Exception:
            owner = ""
    if owner:
        env["PK_OWNER_USER"] = owner
    return _merge_lab_env_overrides(env, env_overrides)


def _watch_lab_process(proc, log_fh, run_id: str) -> None:
    def _watch() -> None:
        global _active_proc
        code = proc.wait()
        try:
            log_fh.close()
        except Exception:
            pass
        with _lock:
            cur = _read_status()
            if cur.get("run_id") != run_id:
                return
            _write_status(
                {
                    **cur,
                    "phase": "finished",
                    "exit_code": int(code),
                    "finished_at": time.time(),
                }
            )
            if _active_proc is proc:
                _active_proc = None
            # WIRE-RUNCTL: обновить RunControlPlane по завершении subprocess.
            try:
                _finish_plane_run(run_id, int(code))
            except Exception:
                pass
            # PERS-B1: запись в БД при завершении
            try:
                _persist_run_finish(run_id=run_id, exit_code=int(code))
            except Exception:
                pass

    threading.Thread(target=_watch, name=f"lab-run-{run_id}", daemon=True).start()


def start_run(
    wired: Any,
    *,
    session_name: str | None = None,
    stub: bool = False,
    stub_opts: Optional[Dict[str, Any]] = None,
    resource_contents: Optional[Dict[str, str]] = None,
    chain_bindings: Optional[Dict[str, str]] = None,
    owner_user_id: str | None = None,
    check_id: str | None = None,
    env: Optional[Dict[str, str]] = None,
    run_id: str | None = None,
) -> Dict[str, Any]:
    """
    Validate + spawn main.py (single-flight).
    stub=True → tools.lab_run_stub (быстрые Allure/Dojo hooks без Juice).
    resource_contents: Editor drafts keyed by imports[].as → files under run_dir.
    chain_bindings: IMP-CHAIN slot_id → fresh value at play.
    owner_user_id: PERS lab → PK_OWNER_USER + diary meta (Editor caller).
    env: allowlisted lab overrides (e.g. PK_TRAFFIC_INSERTION_FEED) — not SoT.
    run_id: явный id запуска (WIRE-RUNCTL); если None → uuid4.
    Returns ok payload or raises ValueError / RuntimeError.
    """
    if not isinstance(wired, dict):
        raise ValueError("wired must be a JSON object")
    if resource_contents is not None and not isinstance(resource_contents, dict):
        raise ValueError("resource_contents must be an object")
    if chain_bindings is not None and not isinstance(chain_bindings, dict):
        raise ValueError("chain_bindings must be an object")
    if env is not None and not isinstance(env, dict):
        raise ValueError("env must be an object")

    # ── WIRE-RUNCTL: lifecycle через RunControlPlane ──
    plane = _get_run_plane()
    _plane_submitted = run_id is not None  # submit_run() уже создал запись
    if not _plane_submitted:
        # Прямой вызов start_run() без submit_run(): создать run в плоскости,
        # но dedup не активируем (caller хочет новый run явно).
        params = _runctl_params(
            wired, session_name=session_name, stub=stub, check_id=check_id
        )
        run, _is_new = plane.create_run(params)
        run_id = run.id

    # Перевести run → RUNNING (атомарный переход через плоскость)
    plane.start_tracking_run(run_id)

    with _lock:
        status = _sync_finished_if_dead(_read_status())
        if str(status.get("phase") or "") == "running":
            raise RuntimeError(
                f"run already in progress (run_id={status.get('run_id')}, pid={status.get('pid')})"
            )
        run_dir = ensure_runs_dir() / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        log_path = run_dir / "runner.log"
        rc = (
            {str(k): str(v) for k, v in resource_contents.items()}
            if isinstance(resource_contents, dict)
            else None
        )
        cb = (
            {str(k): str(v) for k, v in chain_bindings.items()}
            if isinstance(chain_bindings, dict)
            else None
        )
        wired_path = _prepare_run_wired(
            wired,
            run_dir=run_dir,
            stub=stub,
            resource_contents=rc,
            chain_bindings=cb,
        )
        cmd = _run_command(
            wired=wired,
            wired_path=wired_path,
            session_name=session_name,
            stub=stub,
            stub_opts=stub_opts,
        )
        env = _lab_env(
            session_name=session_name,
            run_id=run_id,
            owner_user_id=owner_user_id,
            check_id=check_id,
            env_overrides=(
                {str(k): str(v) for k, v in env.items()}
                if isinstance(env, dict)
                else None
            ),
        )
        try:
            from utils.diary_bus import set_meta
            from utils.live_pers_acl import resolve_run_owner_user_id

            owner = resolve_run_owner_user_id(owner_user_id)
            meta_kwargs = {"run_id": run_id}
            if owner:
                meta_kwargs["owner_user_id"] = owner
            cid = (check_id or "").strip()
            if cid:
                meta_kwargs["check_id"] = cid
            set_meta(**meta_kwargs)

            # MH-4: space-запись в runs_index при start_run
            _maybe_write_run_space(
                wired=wired,
                run_id=run_id,
                check_id=cid or None,
                owner=owner,
            )
        except Exception:
            owner = None
        log_fh = open(log_path, "w", encoding="utf-8")  # noqa: SIM115 — kept for Popen lifetime
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(REPO_ROOT / "orchestrator"),
                env=env,
                stdout=log_fh,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
            )
        except Exception:
            log_fh.close()
            raise

        global _active_proc
        _active_proc = proc
        _write_status(
            {
                "phase": "running",
                "run_id": run_id,
                "pid": proc.pid,
                "exit_code": None,
                "session_name": (session_name or "").strip() or None,
                "wired_path": str(wired_path),
                "log_path": str(log_path),
                "started_at": time.time(),
                "finished_at": None,
                "error": None,
                "stub": bool(stub),
            }
        )
        # PERS-B1: запись в БД при старте
        try:
            _persist_run_start(
                run_id=run_id,
                wired=wired,
                check_id=check_id,
                session_name=session_name,
                wired_path=str(wired_path),
                log_path=str(log_path),
                owner_user_id=owner,
            )
        except Exception:
            pass
        _watch_lab_process(proc, log_fh, run_id)
        return {
            "ok": True,
            "run_id": run_id,
            "pid": proc.pid,
            "wired_path": str(wired_path),
            "log_path": str(log_path),
            "phase": "running",
            "stub": bool(stub),
        }


def _kill_pid_tree(pid: int) -> None:
    """Best-effort stop of main.py (+ Windows child tree)."""
    if pid <= 0:
        return
    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                check=False,
                capture_output=True,
                text=True,
                timeout=15,
            )
            return
        except (OSError, subprocess.TimeoutExpired):
            pass
    try:
        os.kill(pid, getattr(__import__("signal"), "SIGTERM", 15))
    except OSError:
        pass


def stop_run() -> Dict[str, Any]:
    """
    Остановить текущий lab-run (single-flight).
    Кидает RuntimeError, если прогона нет.
    """
    global _active_proc
    with _lock:
        status = _sync_finished_if_dead(_read_status())
        if str(status.get("phase") or "") != "running":
            raise RuntimeError("no run in progress")
        run_id = status.get("run_id")
        pid = status.get("pid") if isinstance(status.get("pid"), int) else None
        proc = _active_proc

    if proc is not None and proc.poll() is None:
        try:
            proc.terminate()
        except OSError:
            pass
        try:
            proc.wait(timeout=3)
        except Exception:
            if isinstance(pid, int):
                _kill_pid_tree(pid)
            else:
                try:
                    proc.kill()
                except OSError:
                    pass
    elif isinstance(pid, int):
        _kill_pid_tree(pid)

    with _lock:
        cur = _read_status()
        if cur.get("run_id") == run_id:
            _write_status(
                {
                    **cur,
                    "phase": "finished",
                    "exit_code": 1,
                    "finished_at": time.time(),
                    "error": "stopped",
                }
            )
        if _active_proc is proc:
            _active_proc = None

    try:
        from utils.live_server import notify_ci_status

        notify_ci_status(
            phase="completed",
            conclusion="cancelled",
            exit_code=1,
            gate="error",
            job_name=str(run_id or "lab-run"),
            job_description="Остановлено из Editor",
        )
    except Exception:
        pass

    return {
        "ok": True,
        "run_id": run_id,
        "phase": "finished",
        "exit_code": 1,
        "stopped": True,
    }


def reset_run_state_for_tests() -> None:
    """Test helper: drop in-process handle (does not kill external PIDs)."""
    global _active_proc
    with _lock:
        _active_proc = None
        if RUNS_DIR.exists():
            path = _status_path()
            if path.is_file():
                path.unlink(missing_ok=True)


def _maybe_write_run_space(
    *,
    wired: Dict[str, Any],
    run_id: str,
    check_id: str | None,
    owner: str | None,
) -> None:
    """MH-4: запись space в runs_index при start_run.

    instance_id = check_id (стабильный ключ проверки).
    app_code = wired.meta.project_id.
    deploy_url = wired.infrastructure.base_url_override.
    first_run_ts — ставится только если app_code ещё не было.
    last_run_ts = now (unix timestamp).
    """
    try:
        meta = wired.get("meta") if isinstance(wired, dict) else None
        infra = wired.get("infrastructure") if isinstance(wired, dict) else None
        app_code = (
            str(meta.get("project_id") or "").strip() or None
            if isinstance(meta, dict)
            else None
        )
        deploy_url = (
            str(infra.get("base_url_override") or "").strip() or None
            if isinstance(infra, dict)
            else None
        )
        instance_id = check_id  # check_id — стабильный ключ инстанса

        now_ts = time.time()

        # first_run_ts: был ли ранее этот app_code?
        first_run_ts: Optional[float] = None
        try:
            from utils.runs_index import list_run_index

            if app_code:
                seen = any(
                    rec.get("app_code") == app_code for rec in list_run_index()
                )
                if not seen:
                    first_run_ts = now_ts
            else:
                first_run_ts = now_ts
        except Exception:
            first_run_ts = now_ts

        from utils.runs_index import upsert_run_index

        upsert_run_index(
            {
                "run_id": run_id,
                "check_id": check_id,
                "instance_id": instance_id,
                "app_code": app_code,
                "deploy_url": deploy_url,
                "status": "running",
                "owner_user_id": owner,
                "source": "start_run",
                "first_run_ts": first_run_ts,
                "last_run_ts": now_ts,
            }
        )
    except Exception:
        pass  # non-blocking: run стартует даже без index


# ─────────────────────────────────────────────────────────────────────────────
# WIRE-RUNCTL: RunControlPlane wiring (in-memory, поверх single-flight subprocess)
# ─────────────────────────────────────────────────────────────────────────────
#
# lab_run остаётся single-flight (один активный subprocess), но теперь каждый
# запуск — управляемая сущность с жизненным циклом и защитой от дублей.
# RunControlPlane не вводит очереди/SQL/Cosmo — чистый in-memory слой.

_run_plane: Optional[RunControlPlane] = None
_run_plane_lock = threading.Lock()


def _get_run_plane() -> RunControlPlane:
    """Ленивый синглтон RunControlPlane.

    max_retries=1 — авто-повтор subprocess ОТКЛЮЧЁН (не перезапускаем прогон
    молча): любой fail — терминальный. Жизненный цикл и dedup — от ядра.
    """
    global _run_plane
    with _run_plane_lock:
        if _run_plane is None:
            _run_plane = RunControlPlane(max_concurrent=1, max_retries=1)
            _run_plane.register_worker("lab-single-flight", frozenset({"browser", "scanner"}))
        return _run_plane


def reset_run_plane_for_tests() -> None:
    """Test helper: сбросить in-memory RunControlPlane."""
    global _run_plane
    with _run_plane_lock:
        _run_plane = None


def _finish_plane_run(run_id: str, exit_code: int) -> None:
    """Обновить RunControlPlane по завершении subprocess (watch-поток)."""
    plane = _get_run_plane()
    run = plane.get_run(run_id)
    if run is None or run.is_terminal:
        return
    if exit_code == 0:
        plane.succeed_run(run_id)
    else:
        plane.fail_run(run_id, FailureClass.INFRA, f"exit_code={exit_code}")


def _runctl_params(
    wired: Any,
    *,
    session_name: str | None,
    stub: bool,
    check_id: str | None,
) -> dict:
    """Канонические параметры запуска для dedup_key (порядок-независимый)."""
    return {
        "wired": wired,
        "session_name": (session_name or "").strip(),
        "stub": bool(stub),
        "check_id": (check_id or "").strip(),
    }


def submit_run(
    wired: Any,
    *,
    session_name: str | None = None,
    stub: bool = False,
    stub_opts: Optional[Dict[str, Any]] = None,
    resource_contents: Optional[Dict[str, str]] = None,
    chain_bindings: Optional[Dict[str, str]] = None,
    owner_user_id: str | None = None,
    check_id: str | None = None,
    env: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """WIRE-RUNCTL: управляемый запуск с dedup и жизненным циклом.

    Обёртка над start_run:
      1. dedup по каноническим параметрам → повторный идентичный запрос
         возвращает ТОТ ЖЕ run_id (без второго subprocess);
      2. run проходит lifecycle queued→running→succeeded/failed;
      3. при провале валидации → fail(VALIDATION), subprocess не спавнится.
    """
    plane = _get_run_plane()
    params = _runctl_params(
        wired,
        session_name=session_name,
        stub=stub,
        check_id=check_id,
    )

    run, is_new = plane.create_run(params)
    if not is_new:
        # RUN-CTL-2: повторный идентичный запуск → тот же run_id.
        return {
            "ok": True,
            "run_id": run.id,
            "dedup": True,
            "reused": True,
            "state": run.state.value,
        }

    try:
        result = start_run(
            wired,
            session_name=session_name,
            stub=stub,
            stub_opts=stub_opts,
            resource_contents=resource_contents,
            chain_bindings=chain_bindings,
            owner_user_id=owner_user_id,
            check_id=check_id,
            env=env,
            run_id=run.id,
        )
    except Exception as exc:
        # Валидация/подготовка упала до spawn — мгновенный fail, без повтора.
        plane.fail_run(run.id, FailureClass.VALIDATION, f"{type(exc).__name__}: {exc}")
        raise

    # Прокинуть lifecycle в результат
    result["control_plane"] = {
        "run_id": run.id,
        "state": run.state.value,
        "attempt": run.attempt,
    }
    return result


def get_run_control_plane_status(run_id: str) -> Dict[str, Any]:
    """Lifecycle-статус запуска в RunControlPlane (для диагностики/монитора)."""
    plane = _get_run_plane()
    run = plane.get_run(run_id)
    if run is None:
        return {"ok": False, "error": "run not found"}
    return {
        "ok": True,
        "run_id": run.id,
        "state": run.state.value,
        "attempt": run.attempt,
        "worker_id": run.worker_id,
        "failure_class": run.failure_class.value if run.failure_class else None,
        "error": run.error,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
    }


# ═══════════════════════════════════════════════════════════════════════
# CF-B3: FuzzRun — фаза фаззинга после краулера
# ═══════════════════════════════════════════════════════════════════════

def run_fuzz_phase(
    crawler_result: Any,  # CrawlerRunResult
    *,
    profile: str = "developer-safe",
    allow_destructive: bool = False,
    max_payloads_per_param: int = 15,
    publish_sse: bool = True,
) -> Dict[str, Any]:
    """CF-B3: запустить фазу фаззинга после завершения краулера.

    Не блокирует основной поток — запускается в background-потоке.
    Прогресс публикуется через diary_bus (FUZZ_PROGRESS + FINDING).
    """
    from fuzzer.corpus_fuzzer import ProductionCorpusFuzzer

    fuzzable = crawler_result.fuzzable_endpoints() if hasattr(crawler_result, 'fuzzable_endpoints') else []
    if not fuzzable:
        return {"status": "skipped", "reason": "no fuzzable endpoints"}

    fuzzer = ProductionCorpusFuzzer(
        profile=profile,
        allow_destructive=allow_destructive,
        max_payloads_per_param=max_payloads_per_param,
        publish_sse=publish_sse,
    )

    result = fuzzer.run_from_crawler_result(crawler_result)

    return {
        **result,
        "profile": profile,
        "endpoints_fuzzed": len(fuzzable),
    }


def run_fuzz_phase_background(
    crawler_result: Any,
    *,
    profile: str = "developer-safe",
    allow_destructive: bool = False,
) -> threading.Thread:
    """CF-B3: запустить фаззинг в background-потоке (не блокирует main)."""
    t = threading.Thread(
        target=run_fuzz_phase,
        args=(crawler_result,),
        kwargs={
            "profile": profile,
            "allow_destructive": allow_destructive,
        },
        name=f"fuzz-{profile}",
        daemon=True,
    )
    t.start()
    return t


# ── PERS-B1: Persistence helpers (non-blocking, best-effort) ──

def _persist_run_start(
    *,
    run_id: str,
    wired: dict,
    check_id: str | None = None,
    session_name: str | None = None,
    wired_path: str = "",
    log_path: str = "",
    owner_user_id: str | None = None,
) -> None:
    try:
        from api.runs_api import write_run_start

        infra = wired.get("infrastructure") if isinstance(wired, dict) else {}
        target_url = ""
        if isinstance(infra, dict):
            target_url = str(infra.get("base_url_override") or "").strip()
        meta = wired.get("meta") if isinstance(wired, dict) else {}
        profile = ""
        if isinstance(meta, dict):
            profile = str(meta.get("assessment_purpose") or "").strip()

        write_run_start(
            run_id=run_id,
            check_id=check_id,
            session_name=session_name,
            target_url=target_url or None,
            profile=profile or None,
            wired_path=wired_path or None,
            log_path=log_path or None,
            owner_user_id=owner_user_id,
        )
    except Exception:
        pass  # non-blocking


def _persist_run_finish(*, run_id: str, exit_code: int) -> None:
    try:
        from api.runs_api import write_run_finish
        write_run_finish(run_id=run_id, exit_code=exit_code)
    except Exception:
        pass  # non-blocking
