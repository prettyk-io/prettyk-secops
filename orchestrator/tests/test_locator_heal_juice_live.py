# -*- coding: utf-8 -*-
"""
HEAL-F Juice live: Grid + Juice login → broken id → heal by fingerprint.

Skip, если стенд не слушает (не валим CI/локальный batch без Docker).
"""
from __future__ import annotations

import urllib.error
import urllib.request

import pytest

from utils.locator_heal import fingerprint_from_attrs
from utils.locator_heal_runtime import (
    clear_fingerprint_store,
    heal_scope,
    remember_fingerprint,
    try_resolve_healed_locator,
)


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


@pytest.mark.skipif(not _stand_ready(), reason="Juice/Grid not up")
def test_juice_login_heal_renamed_email_id():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    clear_fingerprint_store()
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    driver = webdriver.Remote(
        command_executor="http://127.0.0.1:4444/wd/hub",
        options=opts,
    )
    try:
        # Chrome в Grid → Juice по docker DNS или host gateway
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

        el = driver.find_element(By.ID, "email")
        remember_fingerprint(
            fingerprint_from_attrs(
                locator_type="id",
                locator_value="email-BROKEN",
                tag=(el.tag_name or "").lower(),
                id="email",
                name=el.get_attribute("name") or "",
                text="",
                aria_label=el.get_attribute("aria-label") or "",
                classes=el.get_attribute("class") or "",
            )
        )
        with heal_scope(allowed=True):
            got = try_resolve_healed_locator(driver, "id", "email-BROKEN", score_cap=0.5)
        assert got is not None
        new_type, new_value, score = got
        assert new_type == "id"
        assert new_value == "email"
        assert score >= 0.5

        # Label path (cold): ># / env hint без fingerprint
        clear_fingerprint_store()
        from utils.locator_heal_runtime import heal_label_scope

        with heal_scope(allowed=True), heal_label_scope("Email"):
            # Juice login email often has aria/placeholder involving Email
            got2 = try_resolve_healed_locator(driver, "id", "no-such-email", score_cap=0.9)
        # Placeholder/aria may vary by Juice version — soft assert
        if got2 is not None:
            assert got2[0] in ("id", "css", "name")
    finally:
        try:
            driver.quit()
        except Exception:
            pass
