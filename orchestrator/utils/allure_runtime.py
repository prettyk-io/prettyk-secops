"""
Мост Allure для PK-раннера без pytest.

Проблема: `allure.step` / `allure.attach` шлют события в pluggy-хуки
(`plugin_manager.hook.start_step` / `attach_data`). Без listener'а, который
проксирует их в `AllureReporter`, шаги и аттачи не попадают в *-result.json
— в UI остаётся пустой тест с "No information about test execution".

AllureFileLogger пишет только `report_result` / `report_attached_*`;
хуки пользователя он не слушает. Этот listener — недостающее звено.
"""
from __future__ import annotations

from allure_commons import plugin_manager
from allure_commons._hooks import hookimpl
from allure_commons.logger import AllureFileLogger
from allure_commons.model2 import Parameter, Status, StatusDetails, TestStepResult
from allure_commons.reporter import AllureReporter
from allure_commons.utils import format_exception, format_traceback, now, uuid4


class KdtAllureListener:
    """Проксирует allure.step / allure.attach → AllureReporter."""

    def __init__(self, reporter: AllureReporter):
        self.reporter = reporter

    @hookimpl
    def start_step(self, uuid, title, params):
        parameters = [Parameter(name=name, value=value) for name, value in (params or {}).items()]
        step = TestStepResult(name=title, start=now(), parameters=parameters)
        self.reporter.start_step(None, uuid, step)

    @hookimpl
    def stop_step(self, uuid, exc_type, exc_val, exc_tb):
        status = Status.FAILED if exc_type else Status.PASSED
        details = None
        if exc_type is not None:
            details = StatusDetails(
                message=format_exception(exc_type, exc_val),
                trace=format_traceback(exc_tb),
            )
        self.reporter.stop_step(uuid, stop=now(), status=status, statusDetails=details)

    @hookimpl
    def attach_data(self, body, name, attachment_type, extension):
        # uuid файла аттача; parent = текущий executable (шаг или тест)
        self.reporter.attach_data(
            uuid4(),
            body,
            name=name,
            attachment_type=attachment_type,
            extension=extension,
        )

    @hookimpl
    def attach_file(self, source, name, attachment_type, extension):
        self.reporter.attach_file(
            uuid4(),
            source,
            name=name,
            attachment_type=attachment_type,
            extension=extension,
        )


def bind_allure(results_dir: str) -> tuple[AllureReporter, KdtAllureListener, AllureFileLogger]:
    """Регистрирует FileLogger + listener. Возвращает (reporter, listener, file_logger)."""
    reporter = AllureReporter()
    listener = KdtAllureListener(reporter)
    file_logger = AllureFileLogger(results_dir)
    plugin_manager.register(file_logger)
    plugin_manager.register(listener)
    return reporter, listener, file_logger


def unbind_allure(listener: KdtAllureListener, file_logger: AllureFileLogger) -> None:
    """Снимает плагины, чтобы повторные сценарии не дублировали хуки."""
    try:
        plugin_manager.unregister(plugin=listener)
    except Exception:
        pass
    try:
        plugin_manager.unregister(plugin=file_logger)
    except Exception:
        pass
