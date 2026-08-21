# -*- coding: utf-8 -*-
"""
DEAD (G-44): не публичный CLI и не вход оркестратора.

Канон запуска: ``orchestrator/main.py`` (``--wired``, ``--validate-only``).
Этот модуль не подключён к ``main.py``; флаги ``--zap-host`` / ``--zap-port`` /
``--headless`` здесь — исторический черновик, не контракт.
Не расширять и не оборачивать main через этот parser.
"""
import argparse


def parse_args():
    parser = argparse.ArgumentParser(description="Orchestrator (dead stub; use main.py)")
    parser.add_argument("--wired", required=True, help="Путь к JSON-манифесту")
    parser.add_argument("--zap-host", default="127.0.0.1", help="ZAP host")
    parser.add_argument("--zap-port", type=int, default=8080, help="ZAP port (API + proxy)")
    parser.add_argument("--headless", action="store_true", help="Запуск браузера в headless-режиме")
    return parser.parse_args()
