# -*- coding: utf-8 -*-
"""
S1 DISC juice-field: send_keys|label|Email + click|label|Log in (soft).

Skip, если Juice/Grid не слушают.
"""
from __future__ import annotations

import time
import urllib.error
import urllib.request
from types import SimpleNamespace

import pytest

from utils.label_resolve import LabelResolveError, perform_label_action, resolve_label_locator
from utils.locator_heal_runtime import heal_scope


def _http_ok(url: str, timeout: float = 3.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return 200 <= int(resp.status) < 500
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return False


def _stand_ready() -> bool:
    return _http_ok("http://127.0.0.1:3000/") and _http_ok(
        "http://127.0.0.1:4444/status"
    )


def _adapter(driver):
    """Minimal webdriver-shaped shim for perform_label_action (typed locator path)."""
    from selenium.common.exceptions import ElementClickInterceptedException
    from selenium.webdriver.common.by import By

    by_map = {
        "id": By.ID,
        "name": By.NAME,
        "css": By.CSS_SELECTOR,
        "xpath": By.XPATH,
    }

    def _find(st, sv):
        by = by_map.get(str(st or "").lower())
        if by is None:
            raise LabelResolveError(f"unsupported strategy {st}")
        return driver.find_element(by, sv)

    def click(st, sv, timeout=None):
        el = _find(st, sv)
        try:
            el.click()
        except ElementClickInterceptedException:
            # Juice snackbar / Material overlay — same escape hatch as adapter click_js
            driver.execute_script("arguments[0].click();", el)

    def send_keys(st, sv, text, clear_first=True, timeout=None):
        el = _find(st, sv)
        if clear_first:
            el.clear()
        el.send_keys(str(text))
        driver.execute_script(
            "arguments[0].dispatchEvent(new Event('input',{bubbles:true}));"
            "arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",
            el,
        )

    return SimpleNamespace(
        driver=driver,
        _ensure_driver=lambda: True,
        element_timeout=10,
        click=click,
        send_keys=send_keys,
    )


@pytest.mark.skipif(not _stand_ready(), reason="Juice/Grid not up")
def test_juice_login_label_email_and_log_in():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    driver = webdriver.Remote(
        command_executor="http://127.0.0.1:4444/wd/hub",
        options=opts,
    )
    try:
        opened = False
        for url in (
            "http://juice-shop:3000/#/login",
            "http://host.docker.internal:3000/#/login",
            "http://172.17.0.1:3000/#/login",
        ):
            try:
                driver.set_page_load_timeout(20)
                driver.get(url)
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.ID, "email"))
                )
                opened = True
                break
            except Exception:
                continue
        if not opened:
            pytest.skip("Juice login DOM not reachable from Grid browser")

        with heal_scope(allowed=True):
            st, sv = resolve_label_locator(driver, "Email", soft=True)
        assert st in ("id", "name", "css")
        assert sv

        adapter = _adapter(driver)
        with heal_scope(allowed=True):
            perform_label_action(
                adapter,
                action="send_keys",
                label="Email",
                text="s1-disc@lab.test",
                soft=True,
            )
            perform_label_action(
                adapter,
                action="send_keys",
                label="Password",
                text="s1-disc-pass",
                soft=True,
            )
            time.sleep(0.6)
            perform_label_action(
                adapter,
                action="click",
                label="Log in",
                soft=True,
            )

        email_el = driver.find_element(By.ID, "email")
        assert "s1-disc@lab.test" in (email_el.get_attribute("value") or "")
    finally:
        try:
            driver.quit()
        except Exception:
            pass
