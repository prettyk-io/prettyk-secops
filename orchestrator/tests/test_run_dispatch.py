# RUN-CTL-4: Тесты capability dispatch.
from orchestrator.infra.run_dispatch import (
    ExecutionReadiness,
    RunDispatcher,
    WorkerCapability,
    WorkerRegistry,
    dispatch_run,
    execution_readiness,
    register,
)


class TestWorkerRegistration:
    def test_register_worker(self):
        reg = WorkerRegistry()
        w = reg.register("w1", {"chrome", "scanner"})
        assert w.worker_id == "w1"
        assert w.capabilities == {"chrome", "scanner"}
        assert w.status == "idle"

    def test_list_all(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        reg.register("w2", {"scanner"})
        assert {w.worker_id for w in reg.list_all()} == {"w1", "w2"}

    def test_unregister(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        assert reg.unregister("w1") is True
        assert reg.unregister("w1") is False       # уже нет
        assert reg.list_all() == []

    def test_heartbeat(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        assert reg.heartbeat("w1") is True
        assert reg.heartbeat("ghost") is False
        w = reg.get("w1")
        assert w.last_heartbeat > 0

    def test_register_updates_capabilities(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        reg.register("w1", {"chrome", "scanner"})
        w = reg.get("w1")
        assert w.capabilities == {"chrome", "scanner"}

    def test_capabilities_case_insensitive(self):
        reg = WorkerRegistry()
        reg.register("w1", {"CHROME", "Scanner"})
        w = reg.get("w1")
        assert w.capabilities == {"chrome", "scanner"}


class TestListAvailable:
    def test_worker_with_chrome_found(self):
        reg = WorkerRegistry()
        reg.register("w-chrome", {"chrome", "scanner"})
        available = reg.list_available({"chrome"})
        assert [w.worker_id for w in available] == ["w-chrome"]

    def test_worker_without_chrome_not_found(self):
        reg = WorkerRegistry()
        reg.register("w-nocli", {"scanner", "connector_ssh"})
        assert reg.list_available({"chrome"}) == []

    def test_multiple_caps_all_required(self):
        reg = WorkerRegistry()
        reg.register("w-partial", {"chrome"})
        reg.register("w-full", {"chrome", "scanner"})
        available = reg.list_available({"chrome", "scanner"})
        assert [w.worker_id for w in available] == ["w-full"]

    def test_draining_worker_excluded(self):
        reg = WorkerRegistry()
        reg.register("w-drain", {"chrome"})
        reg.set_status("w-drain", "draining")
        assert reg.list_available({"chrome"}) == []

    def test_busy_worker_excluded(self):
        reg = WorkerRegistry()
        reg.register("w-busy", {"chrome"})
        reg.set_status("w-busy", "busy")
        assert reg.list_available({"chrome"}) == []

    def test_idle_worker_found(self):
        reg = WorkerRegistry()
        reg.register("w-idle", {"chrome"})
        reg.set_status("w-idle", "idle")
        assert len(reg.list_available({"chrome"})) == 1


class TestDispatchRun:
    def test_dispatch_chrome_plus_scanner_worker_fits(self):
        reg = WorkerRegistry()
        dispatcher = RunDispatcher(registry=reg)
        reg.register("w1", {"chrome", "scanner"})
        worker_id = dispatcher.dispatch_run("run-1", {"chrome", "scanner"})
        assert worker_id == "w1"
        assert reg.get("w1").status == "busy"
        assert dispatcher.assignment_of("run-1") == "w1"

    def test_dispatch_worker_without_chrome_not_assigned(self):
        reg = WorkerRegistry()
        dispatcher = RunDispatcher(registry=reg)
        reg.register("w1", {"scanner"})           # нет chrome
        worker_id = dispatcher.dispatch_run("run-2", {"chrome", "scanner"})
        assert worker_id is None
        assert reg.get("w1").status == "idle"

    def test_dispatch_requires_chrome_worker_has_chrome(self):
        reg = WorkerRegistry()
        dispatcher = RunDispatcher(registry=reg)
        reg.register("w-chrome", {"chrome"})
        worker_id = dispatcher.dispatch_run("run-3", {"chrome"})
        assert worker_id == "w-chrome"

    def test_dispatch_no_free_worker_returns_none(self):
        reg = WorkerRegistry()
        dispatcher = RunDispatcher(registry=reg)
        reg.register("w1", {"chrome"})
        reg.set_status("w1", "busy")
        assert dispatcher.dispatch_run("run-4", {"chrome"}) is None

    def test_release_run_returns_worker_to_idle(self):
        reg = WorkerRegistry()
        dispatcher = RunDispatcher(registry=reg)
        reg.register("w1", {"chrome"})
        dispatcher.dispatch_run("run-5", {"chrome"})
        assert reg.get("w1").status == "busy"
        released = dispatcher.release_run("run-5")
        assert released == "w1"
        assert reg.get("w1").status == "idle"

    def test_draining_worker_never_gets_run(self):
        reg = WorkerRegistry()
        dispatcher = RunDispatcher(registry=reg)
        reg.register("w-drain", {"chrome"})
        reg.set_status("w-drain", "draining")
        assert dispatcher.dispatch_run("run-6", {"chrome"}) is None


class TestExecutionReadiness:
    def test_free_slots_counts_idle_workers(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        reg.register("w2", {"scanner"})
        assert reg.free_slots() == 2

    def test_free_slots_filters_capabilities(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        reg.register("w2", {"scanner"})
        assert reg.free_slots({"chrome"}) == 1

    def test_draining_and_busy_do_not_offer_slots(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        reg.register("w2", {"chrome"})
        reg.register("w3", {"chrome"})
        reg.set_status("w2", "busy")
        reg.set_status("w3", "draining")
        assert reg.free_slots({"chrome"}) == 1

    def test_readiness_ready_with_matching_free_worker(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome", "scanner"})
        r = reg.execution_readiness({"chrome", "scanner"})
        assert r.ready is True
        assert r.free_slots == 1
        assert r.total_workers == 1
        assert r.draining_workers == 0
        assert r.matched_worker_ids == ["w1"]
        assert "chrome" in r.capabilities

    def test_readiness_requires_capabilities(self):
        reg = WorkerRegistry()
        reg.register("w1", {"scanner"})  # без браузера
        r = reg.execution_readiness({"chrome"})
        assert r.ready is False
        assert r.free_slots == 0

    def test_readiness_not_ready_when_all_busy(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        reg.set_status("w1", "busy")
        r = reg.execution_readiness({"chrome"})
        assert r.ready is False
        assert r.free_slots == 0

    def test_draining_worker_excluded_and_counted(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        reg.set_status("w1", "draining")
        r = reg.execution_readiness({"chrome"})
        assert r.ready is False
        assert r.free_slots == 0
        assert r.draining_workers == 1

    def test_readiness_to_dict(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        d = reg.execution_readiness({"chrome"}).to_dict()
        assert d["ready"] is True
        assert d["free_slots"] == 1

    def test_module_level_execution_readiness_returns_readiness(self):
        # Не регистрируем worker'ов — проверяем только тип/контракт.
        assert isinstance(execution_readiness(), ExecutionReadiness)


class TestModuleLevelAPI:
    def test_module_level_dispatch(self):
        register("w-global", {"chrome"})
        result = dispatch_run("run-global", {"chrome"})
        assert result == "w-global"
