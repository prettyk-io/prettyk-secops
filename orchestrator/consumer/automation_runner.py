# -*- coding: utf-8 -*-
"""AutomationRunner — Playwright-only scenario runner (no ZAP, no Dojo, no Allure).

ADM-0 Contract Proof: same Wired/DSL scenario, two consumers.
  - AutomationConsumer: pure browser automation (this module)
  - SecurityConsumer: existing Controller (ZAP + Dojo + Allure)
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure orchestrator/ is importable
_here = Path(__file__).resolve().parent
_root = _here.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from actions.actions import (  # noqa: E402
    action_click,
    action_click_text,
    action_click_role,
    action_fill,
    action_fill_label,
    action_navigate,
    action_press_key,
    action_reload,
    action_submit,
    action_wait_selector,
    action_wait_timeout,
    action_wait_url,
    action_auth_http_basic,
)
from actions.probes import (  # noqa: E402
    probe_screenshot,
    probe_title,
    probe_url,
)
from browser.playwright_runtime import PlaywrightBrowserRuntime  # noqa: E402
from models.wired import Wired  # noqa: E402

logger = logging.getLogger("automation-consumer")

# ---------------------------------------------------------------------------
# DSL → Playwright action mapping
# ---------------------------------------------------------------------------

def _dispatch_step(
    page: Any,
    constructor: str,
    results_dir: Path,
    step_index: int,
) -> Dict[str, Any]:
    """Parse a DSL constructor string and execute the corresponding Playwright action."""
    ctor = constructor.strip()

    # Открыть <url>
    if ctor.lower().startswith("открыть"):
        url = ctor.split(None, 1)[1].strip().strip('"').strip("'")
        return action_navigate(page, url)

    # Нажать css <locator>  /  Нажать text <text>  /  Нажать role <role> "<name>"
    if ctor.lower().startswith("нажать"):
        parts = ctor.split(None, 2)
        if len(parts) >= 3:
            sub = parts[1].lower()
            val = parts[2].strip().strip('"').strip("'")
            if sub == "css":
                return action_click(page, val)
            elif sub == "text":
                return action_click_text(page, val)
            elif sub == "role":
                # "Нажать role button Submit" → role=button, name=Submit
                role_parts = val.split(None, 1)
                role = role_parts[0]
                name = role_parts[1].strip('"').strip("'") if len(role_parts) > 1 else ""
                return action_click_role(page, role, name=name)
        # bare "Нажать <css>"
        if len(parts) >= 2:
            val = parts[1].strip().strip('"').strip("'")
            return action_click(page, val)
        return {"ok": False, "error": f"invalid click step: {ctor}"}

    # Ввести <locator_type> <locator> <value>
    if ctor.lower().startswith("ввести"):
        parts = ctor.split(None, 3)
        if len(parts) >= 4:
            sub = parts[1].lower()
            loc = parts[2].strip().strip('"').strip("'")
            val = parts[3].strip().strip('"').strip("'")
            if sub in ("css", "selector"):
                return action_fill(page, loc, val)
            elif sub in ("label", "текст"):
                return action_fill_label(page, loc, val)
            else:
                return action_fill(page, loc, val)
        if len(parts) >= 3:
            loc = parts[1].strip().strip('"').strip("'")
            val = parts[2].strip().strip('"').strip("'")
            return action_fill(page, loc, val)
        return {"ok": False, "error": f"invalid fill step: {ctor}"}

    # Пауза <seconds>
    if ctor.lower().startswith("пауза"):
        parts = ctor.split(None, 2)
        try:
            secs = int(parts[1]) if len(parts) >= 2 else 1
        except (ValueError, IndexError):
            secs = 1
        return action_wait_timeout(page, secs * 1000)

    # Ждать <selector>
    if ctor.lower().startswith("ждать"):
        value = " ".join(ctor.split(None, 1)[1:]).strip().strip('"').strip("'")
        return action_wait_selector(page, value)

    # Обновить / Перезагрузить
    if ctor.lower() in ("обновить", "перезагрузить"):
        return action_reload(page)

    # Нажать клавишу <key>
    if ctor.lower().startswith("нажать клавишу"):
        key = ctor.split(None, 2)[-1].strip()
        return action_press_key(page, key)

    # Скриншот
    if ctor.lower() == "скриншот":
        result = probe_screenshot(page)
        if result["ok"]:
            fname = f"step_{step_index:02d}.png"
            fpath = results_dir / fname
            with open(fpath, "wb") as fh:
                fh.write(result["data"])
            result["screenshot_path"] = str(fpath)
        return result

    # fallback — treat as literal Playwright locator click
    logger.debug("unrecognised constructor, trying as CSS click: %s", ctor)
    return action_click(page, ctor)


# ---------------------------------------------------------------------------
# AutomationConsumer
# ---------------------------------------------------------------------------

class AutomationRunResult:
    """Result envelope for an Automation run — consumer-agnostic contract."""

    def __init__(self):
        self.ok: bool = True
        self.scenario_name: str = ""
        self.started_at: str = ""
        self.finished_at: str = ""
        self.total_steps: int = 0
        self.passed_steps: int = 0
        self.failed_steps: int = 0
        self.steps: List[Dict[str, Any]] = []
        self.screenshots: List[str] = []
        self.logs: List[str] = []
        self.error: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "consumer": "automation",
            "ok": self.ok,
            "scenario_name": self.scenario_name,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "total_steps": self.total_steps,
            "passed_steps": self.passed_steps,
            "failed_steps": self.failed_steps,
            "steps": self.steps,
            "screenshots": self.screenshots,
            "logs": self.logs,
            "error": self.error,
        }


class AutomationRunner:
    """Runs Wired scenarios through Playwright browser only — no ZAP/Dojo/Allure."""

    def __init__(
        self,
        wired_path: str,
        results_dir: Optional[str] = None,
        headless: bool = True,
    ):
        self._wired_path = Path(wired_path).resolve()
        self._headless = headless

        if results_dir:
            self._results_dir = Path(results_dir)
        else:
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            self._results_dir = self._wired_path.parent / "runs" / f"automation_{ts}"
        self._results_dir.mkdir(parents=True, exist_ok=True)

        self._runtime: Optional[PlaywrightBrowserRuntime] = None
        self._page: Any = None

    def run(self) -> List[AutomationRunResult]:
        """Execute all scenarios and return a list of result envelopes."""
        if not self._wired_path.exists():
            raise FileNotFoundError(str(self._wired_path))

        wired_data = json.loads(self._wired_path.read_text(encoding="utf-8"))

        # Accept both flat and legacy wired formats
        if "meta" in wired_data and "test_suites" in wired_data:
            wired = Wired.model_validate(wired_data)
        elif "regulation" in wired_data:
            wired = Wired.model_validate(wired_data)
        else:
            wired = Wired.model_validate(wired_data)

        scenarios = []
        if wired.test_suites:
            scenarios = wired.test_suites.scenarios

        if not scenarios:
            logger.warning("No scenarios found in wired file")
            return []

        self._runtime = PlaywrightBrowserRuntime()
        self._page = self._runtime.launch(headless=self._headless)

        results: List[AutomationRunResult] = []
        for scenario in scenarios:
            result = self._run_scenario(scenario)
            results.append(result)

        self._runtime.close()
        return results

    def _run_scenario(self, scenario: Any) -> AutomationRunResult:
        result = AutomationRunResult()
        result.scenario_name = getattr(scenario, "scenario_name", "unnamed")
        result.started_at = datetime.now(timezone.utc).isoformat()
        result.total_steps = len(scenario.steps)

        logger.info(
            "AutomationConsumer: scenario=%s, steps=%d",
            result.scenario_name,
            result.total_steps,
        )

        for idx, step in enumerate(scenario.steps):
            constructor = getattr(step, "constructor", "").strip()
            description = getattr(step, "description", "") or constructor

            step_start = time.monotonic()
            try:
                action_result = _dispatch_step(
                    self._page,
                    constructor,
                    self._results_dir,
                    idx,
                )
            except Exception as exc:
                logger.exception("step %d crashed", idx)
                action_result = {"ok": False, "error": str(exc)}

            elapsed_ms = int((time.monotonic() - step_start) * 1000)

            step_record = {
                "index": idx,
                "constructor": constructor,
                "description": description,
                "ok": action_result.get("ok", False),
                "elapsed_ms": elapsed_ms,
                "error": action_result.get("error", ""),
                "screenshot_path": action_result.get("screenshot_path", ""),
            }

            if step_record["ok"]:
                result.passed_steps += 1
            else:
                result.failed_steps += 1
                result.ok = False
                if action_result.get("screenshot_path"):
                    result.screenshots.append(action_result["screenshot_path"])
                # Take a failure screenshot
                ss = probe_screenshot(self._page)
                if ss["ok"]:
                    fname = f"fail_step_{idx:02d}.png"
                    fpath = self._results_dir / fname
                    with open(fpath, "wb") as fh:
                        fh.write(ss["data"])
                    step_record["failure_screenshot"] = str(fpath)
                    result.screenshots.append(str(fpath))

            result.steps.append(step_record)
            result.logs.append(
                f"[{'PASS' if step_record['ok'] else 'FAIL'}] "
                f"step {idx}: {description} ({elapsed_ms}ms)"
            )
            if step_record.get("error"):
                result.logs.append(f"  ERROR: {step_record['error']}")

            # Stop on first failure unless continue_on_failure
            if not step_record["ok"] and not getattr(step, "continue_on_failure", False):
                result.error = f"Step {idx} failed: {step_record['error']}"
                break

        result.finished_at = datetime.now(timezone.utc).isoformat()

        # Final screenshot
        final_ss = probe_screenshot(self._page)
        if final_ss["ok"]:
            fpath = self._results_dir / "final.png"
            with open(fpath, "wb") as fh:
                fh.write(final_ss["data"])
            result.screenshots.append(str(fpath))

        # Write result envelope
        env_path = self._results_dir / f"{result.scenario_name}_result.json"
        env_path.write_text(
            json.dumps(result.to_dict(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        logger.info(
            "AutomationConsumer: %s — %d/%d passed",
            result.scenario_name,
            result.passed_steps,
            result.total_steps,
        )

        return result