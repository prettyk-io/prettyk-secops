# -*- coding: utf-8 -*-
"""SOR-B2: тесты Session Manager — стейт-машина, идемпотентность, изоляция."""
from __future__ import annotations

import pytest

from core.session_manager import (
    SessionEndpoints,
    SessionManager,
    SessionState,
)


# ── Создание сессии ──


class TestSessionCreation:
    def test_creates_in_creating_state(self):
        sm = SessionManager()
        s, is_new = sm.create_session("s1")
        assert is_new is True
        assert s.state == SessionState.CREATING
        assert s.id == "s1"
        assert s.generation == 1

    def test_autogenerates_id_when_empty(self):
        sm = SessionManager()
        s, is_new = sm.create_session()
        assert is_new is True
        assert s.id.startswith("session-")
        assert len(s.id) > 8

    def test_idempotent_create_returns_existing(self):
        sm = SessionManager()
        s1, is_new1 = sm.create_session("s1")
        s2, is_new2 = sm.create_session("s1")
        assert is_new1 is True
        assert is_new2 is False
        assert s1 is s2
        assert s1.state == SessionState.CREATING

    def test_max_sessions_limit(self):
        sm = SessionManager(max_sessions=2)
        sm.create_session("s1")
        sm.create_session("s2")
        with pytest.raises(RuntimeError, match="Session limit"):
            sm.create_session("s3")


# ── Стейт-машина ──


class TestStateMachine:
    def test_happy_path_creating_to_ready(self):
        sm = SessionManager()
        s, _ = sm.create_session("s1")

        sm.start_provisioning("s1")
        assert s.state == SessionState.PROVISIONING

        sm.mark_ready("s1")
        assert s.state == SessionState.READY
        assert s.provisioned_at is not None
        assert len(s.history) >= 2

    def test_release_flow(self):
        sm = SessionManager()
        sm.create_session("s1")
        sm.start_provisioning("s1")
        sm.mark_ready("s1")

        sm.start_release("s1")
        assert sm.get_session("s1").state == SessionState.RELEASING

        sm.mark_released("s1")
        assert sm.get_session("s1").state == SessionState.RELEASED
        assert sm.get_session("s1").is_terminal is True
        assert sm.get_session("s1").released_at is not None

    def test_pause_resume_cycle(self):
        sm = SessionManager()
        sm.create_session("s1")
        sm.start_provisioning("s1")
        sm.mark_ready("s1")

        sm.pause("s1")
        assert sm.get_session("s1").state == SessionState.PAUSED

        sm.resume("s1")
        assert sm.get_session("s1").state == SessionState.READY

    def test_fail_during_provisioning(self):
        sm = SessionManager()
        sm.create_session("s1")
        sm.start_provisioning("s1")

        sm.mark_failed("s1", "docker pull failed")
        s = sm.get_session("s1")
        assert s.state == SessionState.FAILED
        assert s.error == "docker pull failed"
        assert s.is_terminal is True

    def test_fail_is_noop_on_terminal(self):
        sm = SessionManager()
        s, _ = sm.create_session("s1")
        sm.start_provisioning("s1")
        sm.mark_failed("s1", "original error")

        # Повторный fail на terminal — не меняет состояние и error
        sm.mark_failed("s1", "different error")
        assert s.state == SessionState.FAILED
        assert s.error == "original error"

    def test_invalid_transition_raises(self):
        sm = SessionManager()
        sm.create_session("s1")
        # ready — недопустимый переход из creating (нужен provisioning сначала)
        with pytest.raises(ValueError, match="Invalid session transition"):
            sm.mark_ready("s1")

    def test_release_from_paused(self):
        sm = SessionManager()
        sm.create_session("s1")
        sm.start_provisioning("s1")
        sm.mark_ready("s1")
        sm.pause("s1")

        sm.start_release("s1")
        assert sm.get_session("s1").state == SessionState.RELEASING


# ── Идемпотентность и чтение ──


class TestIdempotency:
    def test_get_returns_none_for_unknown(self):
        sm = SessionManager()
        assert sm.get_session("nobody") is None

    def test_list_filters_active_only(self):
        sm = SessionManager()
        sm.create_session("s1")
        sm.mark_failed("s1")
        sm.create_session("s2")

        active = sm.list_sessions(active_only=True)
        assert len(active) == 1
        assert active[0].id == "s2"

    def test_delete_only_terminal(self):
        sm = SessionManager()
        sm.create_session("s1")
        sm.start_provisioning("s1")
        sm.mark_ready("s1")

        with pytest.raises(ValueError, match="Cannot delete active"):
            sm.delete_session("s1")

        sm.start_release("s1")
        sm.mark_released("s1")
        sm.delete_session("s1")
        assert sm.get_session("s1") is None


# ── Endpoints ──


class TestEndpoints:
    def test_endpoints_serialization(self):
        ep = SessionEndpoints(
            scanner_url="http://scanner:8080",
            target_url="http://target:3000",
        )
        d = ep.to_dict()
        assert d["scanner_url"] == "http://scanner:8080"
        assert d["target_url"] == "http://target:3000"

    def test_mark_ready_sets_endpoints(self):
        sm = SessionManager()
        sm.create_session("s1")
        sm.start_provisioning("s1")

        ep = SessionEndpoints(scanner_url="http://scanner:8080")
        sm.mark_ready("s1", endpoints=ep)

        s = sm.get_session("s1")
        assert s.state == SessionState.READY
        assert s.endpoints.scanner_url == "http://scanner:8080"


# ── Сводка / snapshot ──


class TestSnapshot:
    def test_reports_counts_by_state(self):
        sm = SessionManager()
        sm.create_session("ready-session")
        sm.start_provisioning("ready-session")
        sm.mark_ready("ready-session")

        sm.create_session("failed-session")
        sm.mark_failed("failed-session")

        sm.create_session("creating-session")

        snap = sm.snapshot()
        assert snap["total"] == 3
        assert snap["active"] == 2  # ready + creating
        assert snap["terminal"] == 1  # failed
        assert snap["by_state"]["ready"] == 1
        assert snap["by_state"]["failed"] == 1
        assert snap["by_state"]["creating"] == 1

    def test_reset_clears_all(self):
        sm = SessionManager()
        sm.create_session("s1")
        sm.create_session("s2")
        sm.reset()
        assert sm.snapshot()["total"] == 0


# ── Изоляция: сессия ≠ запуск ──


class TestSessionRunSeparation:
    def test_session_independent_from_run(self):
        """Сессия — независимая сущность, не требует RunControlPlane."""
        sm = SessionManager()
        s, _ = sm.create_session("isolated-session")
        sm.start_provisioning("isolated-session")
        sm.mark_ready("isolated-session")

        assert s.state == SessionState.READY
        assert s.is_active is True
        # Никакой привязки к run_id, worker_id — сессия самостоятельна

    def test_multiple_active_sessions(self):
        """Много активных сессий с разными состояниями."""
        sm = SessionManager()
        for i in range(5):
            sm.create_session(f"s{i}")

        sm.start_provisioning("s0")
        sm.mark_ready("s0")
        sm.pause("s0")

        sm.start_provisioning("s1")
        sm.mark_ready("s1")

        assert sm.get_session("s0").state == SessionState.PAUSED
        assert sm.get_session("s1").state == SessionState.READY
        assert sm.get_session("s2").state == SessionState.CREATING