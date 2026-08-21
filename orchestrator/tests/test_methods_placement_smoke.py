# -*- coding: utf-8 -*-
"""
Машинный смоук placement: все MethodId / ворота / типовые language-комбо.

Не поднимает браузер/ZAP — только resolve + validate_constructor + parse_script.
Списки — живые из method_id.py (не копипаста из docs).
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.constructor_validate import (
    validate_action_constructor,
    validate_constructor,
    validate_language_script,
)
from core.language_parse import parse_script
from core.language_words import KNOWN_STUB_ACTIONS
from core.method_id import (
    facade_catalog,
    facade_names,
    method_id_aliases,
    method_id_catalog,
    method_tier,
    resolve_call,
)


def _is_stub_target(target: WireTarget) -> bool:
    return f"{target[0]}.{target[1]}" in KNOWN_STUB_ACTIONS

WireTarget = Tuple[str, str]


def _catalog() -> Dict[str, Any]:
    from core.constructor_validate import get_catalog

    return get_catalog()


def _stub_for_param(name: str) -> str:
    n = (name or "").lower()
    if "url" in n:
        return "https://example.com"
    if n in ("selector_type", "source_type", "target_type"):
        return "css"
    if n in ("selector_value", "source_value", "target_value"):
        return ".x"
    if "timeout" in n or "seconds" in n or "minutes" in n:
        return "1"
    if n in ("index", "row_index", "col_index", "x_offset", "y_offset"):
        return "0"
    if "text" in n or "message" in n or "name" in n or "title" in n:
        return "x"
    if n in ("expected", "actual", "condition", "value", "key"):
        return "x"
    if "header" in n or "json" in n or "body" in n or "data" in n:
        return "{}"
    if "path" in n or "file" in n:
        return "out.png"
    if "method" in n:
        return "GET"
    return "x"


def _stub_wire(component: str, action: str, catalog: Dict[str, Any]) -> str:
    from core.constructor_validate import catalog_components

    comp = catalog_components(catalog).get(component) or {}
    acts = (comp.get("actions") or {}).get(action)
    if acts is None:
        pytest.fail(f"нет в каталоге адаптеров: {component}|{action}")
    params = [p for p in (acts.get("params") or []) if p.get("kind") == "positional"]
    required = [p for p in params if p.get("required")]
    stubs = [_stub_for_param(p.get("name") or f"a{i}") for i, p in enumerate(required)]
    return "|".join([component, action, *stubs])


def _pretty_with_stubs(method_id: str, target: WireTarget, catalog: Dict[str, Any]) -> str:
    """MethodId + столько pretty-токенов, сколько обязательных args у wire."""
    wire = _stub_wire(target[0], target[1], catalog)
    parts = wire.split("|")
    args = parts[2:]
    if not args:
        return method_id
    return method_id + " " + " ".join(args)


def _iter_root_cases(catalog: Dict[str, Any]) -> List[Tuple[str, str]]:
    """(pretty_line, expected_wire_prefix component|action)"""
    cases: List[Tuple[str, str]] = []
    for name, target in sorted(method_id_catalog().items()):
        if _is_stub_target(target):
            continue
        pretty = _pretty_with_stubs(name, target, catalog)
        prefix = f"{target[0]}|{target[1]}"
        cases.append((pretty, prefix))
    for alias, canonical in sorted(method_id_aliases().items()):
        target = method_id_catalog()[canonical]
        if _is_stub_target(target):
            continue
        pretty = _pretty_with_stubs(alias, target, catalog)
        cases.append((pretty, f"{target[0]}|{target[1]}"))
    return cases


def _iter_facade_cases(catalog: Dict[str, Any]) -> List[Tuple[str, str]]:
    from core.method_id import facade_method_aliases

    cases: List[Tuple[str, str]] = []
    for facade in facade_names():
        bucket = facade_catalog(facade)
        for mid, target in sorted(bucket.items()):
            if _is_stub_target(target):
                continue  # NIY stubs вычеркнуты из keywords.json / AC
            base = _pretty_with_stubs(mid, target, catalog)
            cases.append((f"{facade} {base}", f"{target[0]}|{target[1]}"))
        alias_map = {**method_id_aliases(), **facade_method_aliases()}
        for alias, canonical in sorted(alias_map.items()):
            if canonical not in bucket:
                continue
            target = bucket[canonical]
            if _is_stub_target(target):
                continue
            base = _pretty_with_stubs(alias, target, catalog)
            cases.append((f"{facade} {base}", f"{target[0]}|{target[1]}"))
    return cases

# ---------------------------------------------------------------------------
# MethodId / ворота
# ---------------------------------------------------------------------------


def test_smoke_every_root_method_id_resolves_and_validates():
    catalog = _catalog()
    failures: List[str] = []
    for pretty, prefix in _iter_root_cases(catalog):
        wire = resolve_call(pretty)
        if wire is None:
            failures.append(f"resolve None: {pretty!r}")
            continue
        if not wire.startswith(prefix):
            failures.append(f"wire {wire!r} не с {prefix!r} ← {pretty!r}")
            continue
        comp, action = prefix.split("|", 1)
        if _is_stub_target((comp, action)):
            continue  # NIY: не в keywords.json / AC
        diags = validate_constructor(wire, catalog=catalog)
        errors = [d for d in diags if d.get("severity") == "error"]
        if errors:
            failures.append(f"validate {pretty!r} → {wire!r}: {errors[0]['message']}")
            continue
        adiags = validate_action_constructor(pretty, catalog=catalog)
        aerr = [d for d in adiags if d.get("severity") == "error"]
        if aerr:
            failures.append(f"action_validate {pretty!r}: {aerr[0]['message']}")
    assert not failures, "root MethodId failures:\n" + "\n".join(failures[:40])


def test_smoke_every_facade_method_resolves_and_validates():
    catalog = _catalog()
    failures: List[str] = []
    for pretty, prefix in _iter_facade_cases(catalog):
        wire = resolve_call(pretty)
        if wire is None:
            failures.append(f"resolve None: {pretty!r}")
            continue
        if not wire.startswith(prefix):
            failures.append(f"wire {wire!r} не с {prefix!r} ← {pretty!r}")
            continue
        comp, action = prefix.split("|", 1)
        if _is_stub_target((comp, action)):
            continue  # NIY: не в keywords.json / AC
        diags = validate_constructor(wire, catalog=catalog)
        errors = [d for d in diags if d.get("severity") == "error"]
        if errors:
            failures.append(f"validate {pretty!r} → {wire!r}: {errors[0]['message']}")
    assert not failures, "facade failures:\n" + "\n".join(failures[:40])


# Действия каталога, у которых осознанно нет русского имени.
# Меняется только вместе с решением: любой новый безымянный метод валит тест.
_NAMELESS_BY_DESIGN: Dict[str, frozenset] = {
    # Дубли webdriver-ассертов: те же смыслы уже названы Проверить* на webdriver.
    "inspector": frozenset(
        {
            "assert_contains",
            "assert_equals",
            "assert_false",
            "assert_not_contains",
            "assert_not_equals",
            "assert_true",
        }
    ),
    # get_element_by_index — сырой WebElement не отдаём в язык; session_diary — служебное.
    "webdriver": frozenset({"get_element_by_index", "session_diary"}),
    # Считает High-алерты для quality gate, шагом не вызывается.
    "zap": frozenset({
        "summarize_high_alerts",
        "summarize_alerts_for_live",
        "domains_csv_to_include_regexes",
        "_alert_filter_level",
        # G-36 helpers — зовутся из apply_manifest_auth / BrowserAuth, не keyword.
        "set_http_authentication",
        "set_auth_verification_autodetect",
        "set_session_management_autodetect",
        "stop_client_spider",
    }),
}


def test_every_catalog_action_has_russian_name():
    """Каталог wire vs MethodId: имя не должно теряться молча."""
    catalog = _catalog()
    covered: Dict[str, set] = {}
    for component, action in method_id_catalog().values():
        covered.setdefault(component, set()).add(action)
    for facade in facade_names():
        for component, action in facade_catalog(facade).values():
            covered.setdefault(component, set()).add(action)

    unexpected: List[str] = []
    healed: List[str] = []
    surface = dict(catalog.get("components") or {})
    legacy = dict(catalog.get("legacy_components") or {})
    for component, body in {**surface, **legacy}.items():
        # data|… и core|… — слой данных: пишется через Пусть …, а не MethodId.
        if component in ("data", "core"):
            continue
        known = _NAMELESS_BY_DESIGN.get(component, frozenset())
        actions = set(body.get("actions") or {})
        missing = actions - covered.get(component, set())
        unexpected.extend(f"{component}|{a}" for a in sorted(missing - known))
        healed.extend(f"{component}|{a}" for a in sorted(known & covered.get(component, set())))

    assert not unexpected, (
        "Действия без русского имени (дай MethodId или внеси в _NAMELESS_BY_DESIGN):\n"
        + "\n".join(unexpected)
    )
    assert not healed, (
        "Имя появилось — убери из _NAMELESS_BY_DESIGN:\n" + "\n".join(healed)
    )


def test_data_layer_reachable_without_method_id():
    """core|log_* именуются, генераторы core — известная дыра (нет ни MethodId, ни RHS)."""
    assert resolve_call('Лог "x"') == "core|log_message|x"
    assert resolve_call("СлучайныйEmail") is None


def test_smoke_ui_tier_matches_placement_doc_intent():
    """Избранные ui — не пустые; util/assert не пустые."""
    ui = [n for n in method_id_catalog() if method_tier(n) == "ui"]
    assert_ = [n for n in method_id_catalog() if method_tier(n) == "assert"]
    util = [n for n in method_id_catalog() if method_tier(n) == "util"]
    assert "Нажать" in ui and "Сканер" in ui and "HttpGet" in ui
    assert "ФаззингВолна" in ui  # сценарный fuzz — первая стрелка AC, не util-хвост
    assert "НажатьJS" in ui and "Навести" in ui and "Лог" in ui
    assert "ПриложитьСкриншот" in ui and "ПриложитьФайл" in util
    assert "ЛогСообщение" not in ui  # alias, не корень AC
    assert "Логировать" not in ui  # alias, не корень AC
    assert "НажатьПоТексту" in ui and "ТекстыЭлементов" in ui
    assert "ТекстыЭлементовСТекстом" not in ui
    assert "ТекстыЭлементовСТекстом" in util
    assert "ПолучитьАлерты" not in ui
    assert "ОтчётZAP" not in method_id_catalog()  # снят; канон — ZAP Отчёт
    assert "ЭлементПоИндексу" not in method_id_catalog()
    assert "НажатьДважды" not in ui
    assert "ПроверитьURL" in assert_
    assert "МеткаВДневнике" in util
    assert "СканерГлубокий" not in ui  # util / за ZAP


# ---------------------------------------------------------------------------
# Language конструкции и комбинации
# ---------------------------------------------------------------------------

_LANGUAGE_SCRIPTS: List[str] = [
    # data
    'Пусть ${n} = 1',
    'Секрет ${p} = "x"',
    'Пусть ${names} = Список ["a", "b"]\nДобавить "c" в ${names}',
    'Пусть ${user} = Объект { email: "a@b.c" }',
    'Пусть ${rules} = Словарь { k: "v" }',
    'Пусть ${len} = Размер ${names}',
    'Пусть ${base} = "https://ex.com"\nПусть ${url} = Склеить ${base} "/x"\nПусть ${ok} = Содержит ${url} "ex"\nПусть ${id} = "1"\nПусть ${msg} = "n=${id}"',
    'Пусть ${s} = "hello"\nПусть ${p} = Подстрока ${s} 0 2\nПусть ${r} = Заменить ${s} "ll" "LL"\nПусть ${parts} = Разделить ${s} "e"\nПусть ${t} = Обрезать "  x  "',
    "Пусть ${n} = 1\nПусть ${next_n} = ${n} + 1\nЕсли ${next_n} + 1 == 3 { Пауза 1 }",
    'Пусть ${d} = "id=42"\nПусть ${ok} = СовпадаетРег ${d} "\\d+"\nПусть ${c} = ЗаменитьРег ${d} "\\D+" ""\nЕсли ${d} рег "^id=" { Пауза 1 }',
    'Пусть ${s} = "id=42"\nПусть ${code} = ИзвлечьРег ${s} "(\\d+)"\nПусть ${nums} = ИзвлечьРегВсе ${s} "\\d+"\nПусть ${hi} = Верхний "ok"\nЕсли ${s} начинается "id" { Пауза 1 }\nЕсли ${s} заканчивается "42" { Пауза 1 }',
    'НажатьПоТексту css .item Login',
    'ТекстыЭлементов css .item',
    'Драйвер ТекстыЭлементовСТекстом css .item Login',
    'ФильтрЭлементовПоТексту css .item Login',
    # if
    'Если ${n} 1 { Пауза 1 } Иначе { Пауза 1 }',
    'Если ${n} == 1 То { Лог ok } ИначеЕсли ${n} 2 { Лог two } Иначе { Лог else }',
    # loops
    "Цикл 2 {\n  Пауза 1\n}",
    "Цикл 3 {\n  Если ${_i} == 1 { Прервать }\n  Пауза 1\n}",
    "Цикл 3 {\n  Если ${_i} == 0 { Продолжить }\n  Пауза 1\n}",
    'Пусть ${items} = Список ["a"]\nДляКаждого ${item} В ${items} {\n  Лог ${item}\n}',
    'Пусть ${rules} = Словарь { a: "1" }\nДляКаждого ${k}, ${v} В ${rules} {\n  Лог ${k}\n}',
    "Пусть ${i} = 0\nПока ${i} < 1 {\n  Лог ${i}\n}",
    # try forms
    "? Нажать css .ok > Скриншот fail.png >! Назад",
    "? {\n  Нажать css .ok\n} > {\n  Лог fail\n} >! {\n  Скриншот x.png\n}",
    "Попробовать {\n  Пауза 1\n} Перехватить {\n  Лог e\n} Финализировать {\n  Пауза 1\n}",
    # markers
    "Нажать css .x >?",
    "Нажать css .x >@ { Нажать css .y }",
    # group + nest
    'Группа "smoke" {\n  Пауза 1\n  Если true { Пауза 1 }\n}',
    # domain duplicates + gates
    "Сканер https://example.com",
    "ZAP Сканер https://example.com",
    "Краулер https://example.com",
    "АктивноеСканирование https://example.com",
    "ZAP АктивноеСканирование https://example.com",
    "ZAP ПолучитьАлерты",
    "ZAP Отчёт html out.html",
    "HttpGet https://example.com",
    "HTTP GET https://example.com",
    "ОчиститьКэш",
    "Сессия ОчиститьКэш",
    "CDP ОчиститьКэш",  # alias ворот
    "Драйвер Нажать css .ok",
    "Браузер Нажать css .ok",
    "WD Нажать css .ok",
    # combo: loop + try + methodid
    "Цикл 1 {\n  ? Нажать css .ok > Лог fail >! Пауза 1\n}",
    'Пусть ${u} = "https://example.com"\nЕсли true {\n  ZAP Сканер ${u}\n}',
    # comments: только #; xpath //… без кавычек
    '# header\nПусть ${n} = 1\n# mid\nЛог ${n}\n',
    'Нажать xpath //form[@class="form-controller"]',
    "Нажать xpath //form[@class='form-controller']",
]


@pytest.mark.parametrize("script", _LANGUAGE_SCRIPTS, ids=lambda s: s.replace("\n", " | ")[:60])
def test_smoke_language_script_line(script: str):
    parse_script(script)
    diags = validate_language_script(script)
    errors = [d for d in diags if d.get("severity") == "error"]
    assert errors == [], f"{script!r} → {errors}"


def test_smoke_language_bundle_rejects_assignment_collisions():
    """Склейка независимых примеров повторно объявляет имена — это ошибка."""
    bundle = "\n".join(_LANGUAGE_SCRIPTS)
    parse_script(bundle)
    diags = validate_language_script(bundle)
    errors = [d for d in diags if d.get("severity") == "error"]
    assert any("уже объявлена" in d["message"] for d in errors)
