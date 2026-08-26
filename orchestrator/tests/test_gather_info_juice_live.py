# -*- coding: utf-8 -*-
"""
Цикл C: Juice+Grid+ZAP demon — короткий СборИнформации (skipif).
"""
from __future__ import annotations

import urllib.error
import urllib.request

import pytest

from utils.gather_info import run_gather_info


def _http_ok(url: str, timeout: float = 3.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return 200 <= int(resp.status) < 500
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return False


def _stand_ready() -> bool:
    return (
        _http_ok("http://127.0.0.1:3000/")
        and _http_ok("http://127.0.0.1:4444/status")
        and _http_ok("http://127.0.0.1:8080/JSON/core/view/version/")
    )


@pytest.mark.skipif(not _stand_ready(), reason="Juice/Grid/ZAP demon not up")
def test_juice_gather_info_one_url_burst():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    from adapters.zap_adapter import ZapAdapter

    class _WdShim:
        base_url = "http://juice-shop:3000"

        def __init__(self, driver):
            self.driver = driver

        def _normalize_url_source(self, source):
            if isinstance(source, (list, tuple)):
                return [str(x).strip() for x in source if str(x).strip()]
            return [str(source).strip()]

        def _navigate(self, url):
            self.driver.get(url)

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--proxy-server=http://127.0.0.1:8099")
    driver = webdriver.Remote(
        command_executor="http://127.0.0.1:4444/wd/hub",
        options=opts,
    )
    zap = ZapAdapter(port=8080, api_key="")
    try:
        opened = False
        login_url = None
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
                login_url = url
                break
            except Exception:
                continue
        if not opened or not login_url:
            pytest.skip("Juice login not reachable from Grid")

        wd = _WdShim(driver)
        # absolute URL — base не нужен; burst короткий
        summary = run_gather_info(
            wd,
            zap,
            [login_url],
            burst_sec=8,
            settle_sec=1,
            max_urls=1,
            pscan_timeout_sec=20,
            wall_sec=90,
        )
        assert summary["urls"] == 1
        assert summary["bursts"] == 1
        assert summary.get("wall_hit") is False
    finally:
        try:
            driver.quit()
        except Exception:
            pass
