#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DEAD (G-44): устаревшая pytest-обвязка манифеста.

Не промышленная точка запуска. Канон: ``orchestrator/main.py --wired …``.
Не развивать как runner / не звать из CI вместо main.
"""
import json
import sys
import allure
import pytest
from models.wired import Wired
from core.controller import Controller

def load_wired(wired_path):
    with open(wired_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    from core.wired_secretref import prepare_wired_data

    data, secret_seeds = prepare_wired_data(data)
    load_Wired.last_secret_seeds = secret_seeds  # type: ignore[attr-defined]
    return Wired.model_validate(data)

@allure.epic("Security Tests")
@allure.feature("Scanner + Selenium")
def test_wired(wired_path):
    wired = load_wired(wired_path)

    seeds = getattr(load_Wired, "last_secret_seeds", []) or []
    controller = Controller(Wired, secret_seeds=seeds)
    try:
        with allure.suite(Wired.meta.assessment_purpose or "Default Suite"):
            controller.run()

        # После выполнения — прикрепляем алерты сканера к отчёту
        if controller.adapters.get("zap"):
            alerts = controller.adapters["zap"].get_alerts()
            if alerts:
                allure.attach(
                    json.dumps(alerts, indent=2, ensure_ascii=False),
                    name="Scanner Alerts",
                    attachment_type=allure.attachment_type.JSON
                )
            else:
                allure.attach("No alerts found", name="Scanner Alerts", attachment_type=allure.attachment_type.TEXT)
    finally:
        # Второй вход в фреймворк течёт сессиями так же, как main.py, — гасим их здесь тоже.
        controller.shutdown()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python wired_runner.py <Wired.json>")
        sys.exit(1)
    test_wired(sys.argv[1])
