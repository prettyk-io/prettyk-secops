# -*- coding: utf-8 -*-
"""Export «Модуль работы с данными» → DataStream."""
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.data_adapter import DataAdapter
from core.action_factory import ActionFactory
from core.controller import Controller
from core.data_stream import DataStream
from core.errors import WiredError
from core.language_engine import LanguageEngine
from models.wired import TestDataConstructorModule as DataModule


def _ctrl_with_modules(modules, *, base_url="http://juice-shop:3000"):
    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.page_resolver = None
    ctrl._wired_problems = []
    ctrl.last_zap_report = None
    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    ctrl.adapters = {"data": data}
    factory = ActionFactory()
    factory.register("data", "let", data.let)
    # core.to_string для wire-export
    from adapters import data_processor

    factory.register("core", "to_string", data_processor.DataProcessor.to_string)
    ctrl.action_factory = factory

    def parse(raw):
        parts = raw.split("|")
        component, action, args = parts[0], parts[1], parts[2:]
        import inspect

        method = factory.get_method(component, action)
        names = [
            n
            for n, p in inspect.signature(method).parameters.items()
            if n != "self"
        ]
        return component, action, {n: a for n, a in zip(names, args)}

    ctrl._parse_constructor = parse
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_wired_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None
    ctrl.wired = SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=modules, imports=[]),
        security_configuration=SimpleNamespace(base_url_override=base_url),
    )
    return ctrl, stream


def test_export_data_module_pretty():
    mod = DataModule(
        id="seed",
        module_type="Модуль работы с данными",
        data_storage_fields={"editor": 'Пусть ${seed} = "hello"'},
    )
    ctrl, stream = _ctrl_with_modules([mod])
    ctrl._export_data_modules(stream)
    assert stream.get("seed") == "hello"


def test_export_skips_fuzz_module():
    mod = DataModule(
        id="masks",
        module_type="Фаззер",
        fuzzing_fields={
            "request": {"url": "http://juice-shop:3000/rest/products/search"},
            "injection": {"query_param": "q", "corpus": "fuzz_payloads"},
        },
    )
    ctrl, stream = _ctrl_with_modules([mod])
    ctrl._export_data_modules(stream)
    assert "masks" not in stream


def test_export_collision():
    mod = DataModule(
        id="seed",
        module_type="Модуль работы с данными",
        data_storage_fields={"editor": "Пусть ${seed} = 1"},
    )
    ctrl, stream = _ctrl_with_modules([mod])
    stream.set("seed", "already")
    with pytest.raises(WiredError, match="Коллизия"):
        ctrl._export_data_modules(stream)


def test_export_requires_id_binding():
    mod = DataModule(
        id="seed",
        module_type="Модуль работы с данными",
        data_storage_fields={"editor": "Пусть ${other} = 1"},
    )
    ctrl, stream = _ctrl_with_modules([mod])
    with pytest.raises(WiredError, match="нет"):
        ctrl._export_data_modules(stream)


def test_export_additional_urls_joins_base():
    mod = DataModule(
        id="data_module",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "source_type": "Генерация из источника",
            "process_id": "additional_urls",
            "editor": "/#/login\n# comment\n/#/register\n",
        },
    )
    ctrl, stream = _ctrl_with_modules([mod])
    ctrl._export_data_modules(stream)
    assert stream.get("data_module") == [
        "http://juice-shop:3000/#/login",
        "http://juice-shop:3000/#/register",
    ]


def test_export_additional_urls_keeps_absolute():
    mod = DataModule(
        id="urls",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "source_type": "Генерация из источника",
            "process_id": "additional_urls",
            "editor": "https://example.com/a\n/#/b",
        },
    )
    ctrl, stream = _ctrl_with_modules([mod], base_url="http://juice-shop:3000")
    ctrl._export_data_modules(stream)
    assert stream.get("urls") == [
        "https://example.com/a",
        "http://juice-shop:3000/#/b",
    ]


def test_export_additional_urls_needs_base_for_relative():
    mod = DataModule(
        id="urls",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "source_type": "Генерация из источника",
            "process_id": "additional_urls",
            "editor": "/#/login",
        },
    )
    ctrl, stream = _ctrl_with_modules([mod], base_url="")
    with pytest.raises(WiredError, match="base_url_override"):
        ctrl._export_data_modules(stream)


def test_export_unknown_process_id():
    mod = DataModule(
        id="x",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "source_type": "Генерация из источника",
            "process_id": "nope",
            "editor": "a",
        },
    )
    ctrl, stream = _ctrl_with_modules([mod])
    with pytest.raises(WiredError, match="process_id"):
        ctrl._export_data_modules(stream)


def test_export_additional_urls_collision():
    mod = DataModule(
        id="data_module",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "source_type": "Генерация из источника",
            "process_id": "additional_urls",
            "editor": "/#/login",
        },
    )
    ctrl, stream = _ctrl_with_modules([mod])
    stream.set("data_module", ["already"])
    with pytest.raises(WiredError, match="Коллизия"):
        ctrl._export_data_modules(stream)


def test_g65_line_list_without_process_id():
    """G-65: полотно path/URL без process_id → тот же list[str]."""
    mod = DataModule(
        id="data_module",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "editor": "/#/login\n# skip\n/#/basket\n",
        },
    )
    ctrl, stream = _ctrl_with_modules([mod])
    ctrl._export_data_modules(stream)
    assert stream.get("data_module") == [
        "http://juice-shop:3000/#/login",
        "http://juice-shop:3000/#/basket",
    ]
    assert "data_module" in ctrl._url_list_keys


def test_g65_does_not_steal_pretty_let():
    mod = DataModule(
        id="seed",
        module_type="Модуль работы с данными",
        data_storage_fields={"editor": 'Пусть ${seed} = "hello"'},
    )
    ctrl, stream = _ctrl_with_modules([mod])
    ctrl._export_data_modules(stream)
    assert stream.get("seed") == "hello"
    assert "seed" not in getattr(ctrl, "_url_list_keys", set())


def test_properties_module_secret_hash_and_flat_keys():
    """#key=value → Секрет; key=value → let; объект $auth_data."""
    mod = DataModule(
        id="auth_data",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "editor": (
                "username=admin\n"
                "#password_value=kdt_password\n"
                "#security_answer=kdt\n"
            )
        },
    )
    ctrl, stream = _ctrl_with_modules([mod])
    ctrl._export_data_modules(stream)
    assert stream.get("username") == "admin"
    assert stream.get("password_value") == "kdt_password"
    assert stream.is_secret("password_value") is True
    assert stream.is_secret("username") is False
    assert stream.get("auth_data") == {
        "username": "admin",
        "password_value": "kdt_password",
        "security_answer": "kdt",
    }
    assert stream.get_path("auth_data.password_value") == "kdt_password"


def test_properties_then_pretty_override_username():
    """auth_data properties → juice_seed переопределяет $username."""
    auth = DataModule(
        id="auth_data",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "editor": "username=admin\n#password_value=secret\n"
        },
    )
    seed = DataModule(
        id="juice_seed",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "editor": (
                'Пусть $username = "rand@test"\n'
                "Пусть $juice_seed = true\n"
            )
        },
    )
    ctrl, stream = _ctrl_with_modules([auth, seed])
    ctrl._export_data_modules(stream)
    assert stream.get("username") == "rand@test"
    assert stream.get("password_value") == "secret"
    assert stream.is_secret("password_value") is True
    assert stream.get("juice_seed") is True
