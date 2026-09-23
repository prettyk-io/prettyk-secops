# HEALTH-3: execution readiness — health-контракт пула worker'ов.
#
# check_execution_readiness(required_caps, registry=...) возвращает Callable[[], bool]
# для ServiceHealth.register_check. Проверяем через инъекцию ЛОКАЛЬНОГО реестра —
# без загрязнения глобального singleton worker pool.
from orchestrator.infra.health import check_execution_readiness
from orchestrator.infra.run_dispatch import WorkerRegistry


class TestExecutionReadinessHealthCheck:
    def test_check_true_when_free_matching_worker(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        assert check_execution_readiness({"chrome"}, registry=reg)() is True

    def test_check_false_without_matching_capability(self):
        reg = WorkerRegistry()
        reg.register("w1", {"scanner"})  # нет браузера
        assert check_execution_readiness({"chrome"}, registry=reg)() is False

    def test_check_false_when_draining(self):
        reg = WorkerRegistry()
        reg.register("w1", {"chrome"})
        reg.set_status("w1", "draining")
        assert check_execution_readiness({"chrome"}, registry=reg)() is False

    def test_check_false_on_empty_pool(self):
        assert check_execution_readiness({"chrome"}, registry=WorkerRegistry())() is False
