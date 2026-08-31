# -*- coding: utf-8 -*-
"""INT-B2 / PERS-B8: Session recovery — активная сессия краулера после рестарта."""
from __future__ import annotations

import sys
import time
from pathlib import Path
from unittest.mock import patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

from utils.integrity import (
    CrawlerSessionState,
    save_crawler_session,
    load_crawler_session,
    list_crawler_sessions,
    delete_crawler_session,
)


class TestSessionRecoveryLifecycle:
    """PERS-B8: полный цикл жизни сессии краулера — save → restart → recover → resume."""

    def test_resume_after_restart(self, tmpdir):
        """Оператор может продолжить краул после рестарта процесса."""
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            # Состояние до рестарта: краулер обошёл 5 стейтов, budget_exhausted
            before = CrawlerSessionState(
                session_id="crawl-2026-08-28-001",
                target_url="https://juice-shop.local",
                visited_urls=[
                    "https://juice-shop.local/",
                    "https://juice-shop.local/#/login",
                    "https://juice-shop.local/#/search",
                    "https://juice-shop.local/#/register",
                    "https://juice-shop.local/#/contact",
                ],
                state_count=5,
                transition_count=15,
                last_state_key="state-0005-a3f2",
                awakened_count=2,
                stop_reason="budget_exhausted",
                persona_name="anonymous",
            )
            save_crawler_session(before)

            # Рестарт процесса — загружаем с диска
            after = load_crawler_session("crawl-2026-08-28-001")
            assert after is not None
            assert after.state_count == 5
            assert after.awakened_count == 2
            assert after.persona_name == "anonymous"

            # Оператор видит состояние и может продолжить:
            #  - увеличить max_states
            #  - возобновить с последнего state_key
            assert after.stop_reason == "budget_exhausted"
            assert after.last_state_key == "state-0005-a3f2"

    def test_multiple_active_sessions(self, tmpdir):
        """Две параллельные сессии краулера переживают рестарт."""
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            save_crawler_session(CrawlerSessionState(
                session_id="juice-baseline",
                target_url="https://juice-shop.local",
                state_count=12,
                persona_name="anonymous",
            ))
            save_crawler_session(CrawlerSessionState(
                session_id="juice-admin",
                target_url="https://juice-shop.local",
                state_count=8,
                persona_name="admin",
            ))

            sessions = list_crawler_sessions()
            persona_names = {s.persona_name for s in sessions}
            assert "anonymous" in persona_names
            assert "admin" in persona_names

    def test_session_cleanup_after_completion(self, tmpdir):
        """Завершённая сессия удаляется после полного краула."""
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            save_crawler_session(CrawlerSessionState(
                session_id="completed-crawl",
                target_url="https://done.local",
                state_count=30,
                stop_reason="completed",
            ))
            assert load_crawler_session("completed-crawl") is not None

            # После завершения → удаляем
            delete_crawler_session("completed-crawl")
            assert load_crawler_session("completed-crawl") is None

    def test_session_state_can_be_updated(self, tmpdir):
        """Состояние сессии обновляется по мере продвижения краулера."""
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            # Первое сохранение — 2 стейта
            state = CrawlerSessionState(
                session_id="progressive",
                target_url="https://api.local",
                state_count=2,
                visited_urls=["/", "/login"],
            )
            save_crawler_session(state)

            # Обновление — 10 стейтов
            state.state_count = 10
            state.visited_urls = ["/", "/login", "/search", "/profile"]
            state.last_state_key = "state-0010-x9f1"
            save_crawler_session(state)

            loaded = load_crawler_session("progressive")
            assert loaded.state_count == 10
            assert len(loaded.visited_urls) == 4