# -*- coding: utf-8 -*-
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import SECRET_LOG_MASK, DataStream
from core.errors import WiredError
from adapters.data_adapter import DataAdapter


def test_ref_canonical():
    s = DataStream({"email": "a@b.c", "n": 10})
    assert s.resolve("${email}") == "a@b.c"
    assert s.resolve("{{email}}") == "{{email}}"  # mustache больше не резолвим
    assert s.resolve("${n}") == 10
    assert s.resolve("plain") == "plain"


def test_resolve_arg_mid_string_interpolate():
    s = DataStream({"host": "app.bank.local", "path": "login", "n": 7})
    assert s.resolve_arg("https://${host}/${path}") == "https://app.bank.local/login"
    assert s.resolve_arg("${host}") == "app.bank.local"
    assert s.resolve_arg("${n}") == 7  # целая ссылка сохраняет тип
    assert s.resolve("https://${host}/${path}") == "https://${host}/${path}"  # resolve без mid


def test_path_access():
    s = DataStream(
        {
            "user": {"email": "a@b.c", "nested": {"id": 1}},
            "names": ["alice", "bob"],
        }
    )
    assert s.get_path("user.email") == "a@b.c"
    assert s.get_path("user.nested.id") == 1
    assert s.get_path("names[0]") == "alice"
    assert s.get_path("names[-1]") == "bob"
    assert s.resolve("${user.email}") == "a@b.c"
    assert s.resolve("${names[1]}") == "bob"


def test_parse_list_and_object_with_refs():
    s = DataStream({"third": "carol", "token": "t0k"})
    names = s.parse_value('Список ["alice", "bob", ${third}]')
    assert names == ["alice", "bob", "carol"]
    user = s.parse_value(
        'Объект {\n  email: "a@b.c"\n  role: "admin"\n  nested: Объект { id: 1 }\n}'
    )
    assert user == {"email": "a@b.c", "role": "admin", "nested": {"id": 1}}
    headers = s.parse_value('Объект { "X-Token": ${token} }')
    assert headers == {"X-Token": "t0k"}


def test_data_adapter_ops():
    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)

    data.let("email", '"user@test.local"')
    data.let("n", "10")
    data.let("ok", "true")
    assert stream.get("email") == "user@test.local"
    assert stream.get("n") == 10
    assert stream.get("ok") is True

    stream.set("third", "eve")
    data.let("names", '["alice", "bob", ${third}]')
    assert stream.get("names") == ["alice", "bob", "eve"]

    data.let(
        "user",
        'Объект { email: "a@b.c" role: "admin" nested: Объект { id: 1 } }',
    )
    assert stream.get_path("user.nested.id") == 1

    data.list_append("names", '"carol"')
    assert stream.get("names")[-1] == "carol"
    data.list_remove("names", "0")
    assert stream.get("names")[0] == "bob"

    data.object_put("user", "role", '"user"')
    assert data.object_get("user", "role") == "user"
    assert data.size("names") == 3  # bob, eve, carol


def test_secret_masked():
    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    data.secret("password", '"qwerty"')
    assert stream.get("password") == "qwerty"
    assert stream.is_secret("password")
    assert stream.mask_for_log("pass=qwerty") == f"pass={SECRET_LOG_MASK}"


def test_missing_path_raises():
    s = DataStream({"user": {}})
    with pytest.raises(WiredError):
        s.get_path("user.email")


def test_pretty_script_eval():
    from core.pretty_data import script_to_steps
    from tools.data_playground import eval_script

    steps = script_to_steps('Пусть ${n} = 10\nРазмер ${len} ${n}')
    assert steps[0]["constructor"] == "data|let|n|10"
    # size по числу — ошибка; по списку ок
    out = eval_script(
        'Пусть ${third} = "x"\n'
        'Пусть ${names} = ["a", ${third}]\n'
        'Размер ${names_len} ${names}\n'
    )
    assert out["ok"] is True
    assert out["variables"]["names"] == ["a", "x"]
    assert out["variables"]["names_len"] == 2


def test_multiline_object_pretty():
    from tools.data_playground import eval_script

    out = eval_script(
        'Пусть ${user} = Объект {\n'
        '  email: "a@b.c"\n'
        '  role: "admin"\n'
        '  nested: Объект { id: 1 }\n'
        '}\n'
    )
    assert out["ok"] is True
    assert out["variables"]["user"]["email"] == "a@b.c"
    assert out["variables"]["user"]["nested"]["id"] == 1


def test_constructor_validate_backend_contract():
    from core.constructor_validate import validate_constructor

    assert validate_constructor("webdriver|click|css|.x") == []
    bad = validate_constructor("webdriver|no_such_thing")
    assert bad and bad[0]["severity"] == "error"
    assert validate_constructor("data|let|n|10") == []
