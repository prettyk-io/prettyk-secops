# Манифест KDT

> Граница SoT (hub): [`canon/manifest-sot.md`](canon/manifest-sot.md) (**CANON**). Machine-контракт: Pydantic `orchestrator/models/manifest.py`. Legacy JSON Schema: [`manifest.json`](manifest.json).

Манифест — JSON-файл с параметрами окружения, правилами безопасности и сценариями. Его можно создать в Редакторе или собрать программно по JSON Schema [`manifest.json`](manifest.json).

## Минимальная структура

```json
{
  "meta": {
    "assessment_purpose": "scheduled"
  },
  "infrastructure": {
    "zap_mode": "demon",
    "browser_type": "chrome"
  },
  "security_configuration": {
    "base_url_override": "http://juice-shop:3000",
    "allowed_extra_domains": "",
    "scan_policy": "custom_policy",
    "auth_type": "Без авторизации"
  },
  "test_suites": {
    "imports": [],
    "pages": {},
    "scenarios": [
      {
        "scenario_name": "home_page",
        "steps": [
          {
            "constructor": "Открыть $base_url"
          }
        ]
      }
    ],
    "test_data_constructor": [],
    "fuzzers": []
  }
}
```

Для ручной работы в ZAP (`assessment_purpose: manual`) блоки security и suites могут отсутствовать. В остальных режимах они зависят от выбранной политики.

## Корневые разделы

| Раздел | Назначение |
|---|---|
| `meta` | цель и владельцы проверки |
| `infrastructure` | режим ZAP, браузер и тайм-ауты |
| `security_configuration` | разрешённая цель, дополнительные домены, политика и аутентификация |
| `test_suites` | пользовательские сценарии для `custom_policy` |
| `scanning_and_fuzzing_targets` | цели политики `scanner_fuzzing` |
| `openapi_swagger_scanning` | схема для `openapi_schema` |
| `api_targets_scanning` | API-цели для `api_scanner` |
| `gui_elements_scanning` | цели crawler-политики |

`docs/manifest.json` — источник допустимых полей. Неизвестные поля отклоняются или удаляются при импорте legacy-файла, поэтому не храните в манифесте произвольные заметки.

## `meta`

Обязательное поле:

- `assessment_purpose`: `scheduled`, `pre_release`, `emergency` или `manual`.

Дополнительные поля связывают прогон с приложением и ответственными: `project_id`, `initiator_name`, `app_leader`, `release_manager`, `release_domain`, `emergency_reason`, `compliance_requirements`.

`generate_act` (bool, default `false`) — формировать акт проверки. По allOf: `manual` → всегда `false` (поле скрыто); `pre_release` → `true` и readOnly; `scheduled` / `emergency` — опционально. Без оси допуска акт не выпускается (кнопка disabled / zip без `act/act.html`).

## `infrastructure`

Основные поля:

| Поле | Значения | Назначение |
|---|---|---|
| `zap_mode` | `demon`, `webswing` | daemon для автоматического прогона; Webswing для Desktop UI |
| `browser_type` | `chrome`, `chrome-headless`, `firefox`, `firefox-headless` | браузер-исполнитель |
| `zap_work_timeout_min` | число | максимальное ожидание действий ZAP |
| `idle_timeout_min` | число | время ручной паузы |
| `webswing_session_timeout_min` | число | тайм-аут Webswing |
| `debug_mode` | bool, default `false` | режим отладки: пауза Live, all-failsafe, без idle/work kill; допуск VOID |

Remote- или local-WebDriver выбирается переменной `KDT_WEBDRIVER_MODE`, а не полем манифеста.

## `security_configuration`

| Поле | Назначение |
|---|---|
| `base_url_override` | основной URL цели; доступен в сценарии как `$base_url` |
| `allowed_extra_domains` | дополнительные разрешённые домены через запятую |
| `scan_policy` | фиксировано `custom_policy` (пользовательские suites); не выбирается в анкете |
| `auth_type` | тип аутентификации |
| `auth_details` | параметры выбранного способа аутентификации |

`test_suites` открывается для любого назначения кроме `manual` — без гейта по `scan_policy`. Ветки scanner/openapi/api/crawler из схемы убраны.

> [!IMPORTANT]
> `scan_policy` / Honest Contract: поле в JSON не запускает spider или active scan. ZAP-действия — явные шаги в сценариях.

## `test_suites`

Редактор показывает пять исполняемых разделов и authoring-метаданные папок:

```text
test_suites
├── pages                  Модели данных
├── scenarios              Сценарии
├── test_data_constructor  Модули
├── fuzzers                Fuzzers
├── imports                Ресурсы
└── editor_folders         Папки Редактора (только authoring)
```

`editor_folders` хранит одноуровневую группировку `pages`, `scenarios` и
`modules`: у папки есть внутренний `id`, русское `title` и плоский список
`members`. Она не вкладывает исполняемые сущности и исключается из
runtime-экспорта. Fuzzers и ресурсы намеренно остаются без папок.

### Сценарии

```json
{
  "scenario_name": "login",
  "continue_on_failure": false,
  "steps": [
    {
      "description": "Открыть страницу",
      "constructor": "Открыть $base_url",
      "retry": 0,
      "retry_delay": 2,
      "failsafe": false,
      "continue_on_failure": false,
      "save_as": ""
    }
  ]
}
```

`scenario_name` обязателен. Сценарии исполняются по порядку массива.
Необязательный `description` на уровне сценария — название Allure suite:
Studio синхронизирует его с названием папки. Без папки Allure использует
сам `scenario_name`.

`continue_on_failure` на **сценарии** — scenario failsafe: падение не валит этап-1
(остальные сценарии продолжают). Авторский маркер в canvas: первая строка
`<!>` (см. [справочник языка](reference/language.md)); Редактор синхронизирует
флаг с маркером. Не путать с `>?` / `failsafe` на **шаге**.

В шаге обязателен только `constructor`. Остальные поля:

- `description` — заголовок в отчёте;
- `retry` и `retry_delay` — повторы и задержка;
- `failsafe` — ошибка шага ожидаема (`>?`);
- `continue_on_failure` — продолжить после ошибки шага;
- `save_as` — сохранить результат в поток данных.

Синтаксис `constructor` описан в [справочнике языка](reference/language.md).

### Модели данных

`pages` — объект, где ключ служит идентификатором модели:

```json
{
  "pages": {
    "login": {
      "title": "Login page",
      "path": "/#/login",
      "constructor": "Элемент email = id email\nОперация Войти { ... }"
    }
  }
}
```

В сценарии операция вызывается как `login.Войти`.

### Ресурсы

`imports` подключает файлы:

```json
{
  "path": "resources/users.txt",
  "kind": "data_file",
  "as": "users"
}
```

Поддерживаемые виды:

- `data_file` — строки `.txt` загружаются в поток данных;
- `fuzz_corpus` — строки `.txt` становятся payload-корпусом;
- `scenario_json` — зарезервирован, runtime пока отклоняет его.

Короткая запись строкой равна `data_file`.

### Модули

`test_data_constructor` хранит технические источники и преобразования данных. Новые фаззинг-кампании создавайте в `fuzzers`; старый `module_type: "Фаззер"` поддерживается только при импорте существующих файлов.

Модули API (IMP): `module_type` **`OpenAPI`** (`openapi_fields`), **`GraphQL`** (`graphql_fields`), **`gRPC`** (`grpc_fields` — proto pack + import roots). Галочка анкеты / `zap_import` сами по себе **не** запускают silent scan.

### Fuzzers

```json
{
  "id": "juice_search_q",
  "label": "Juice search q",
  "algorithm": "triples",
  "session_replay": true,
  "policy": {
    "max_requests": 25,
    "requests_per_second": 1.0,
    "alert_on_server_error": true,
    "latency_multiplier": 3.0,
    "size_ratio": 3.0,
    "size_abs_delta": 2048
  },
  "targets": [
    {
      "url": "http://127.0.0.1:3000/rest/products/search?q={MASK}",
      "method": "GET",
      "corpus": "intent_boundary"
    }
  ]
}
```

В Fuzzer задаётся алгоритм, политика безопасности и таблица целей `targets[]`. В целевом URL или теле запроса задаётся маска подстановки `{MASK}` (или `{MASK_1}`, `{MASK_2}` для Pitchfork). `corpus` указывает на ресурс или встроенный набор `intent_*`. Ограничения безопасности: не более 25 запросов и не более 1 запроса в секунду в одном потоке. Наряду с `targets[]` поддерживается автоматический импорт legacy-формата (`message`/`location`).

Запуск из сценария:

```text
ФаззингВолна juice_search_q
```

## Экспорт из Редактора

- **«Скачать манифест»** сохраняет JSON для повторного редактирования и запуска.
- **«Скачать пакет»** собирает ZIP с runtime-манифестом и файлами ресурсов.
- **«Загрузить манифест»** принимает JSON, выполняет совместимую миграцию и показывает результат в Форме и Редакторе.

После загрузки старого файла скачайте новую копию: миграция применяется только в памяти Редактора.

## Валидация

Кнопка **«Валидировать»** проверяет активный документ. Полная CLI-проверка:

```powershell
.\.venv\Scripts\python.exe orchestrator\main.py `
  --manifest path\to\manifest.json `
  --validate-only
```

Проверяются:

1. JSON и структура по схеме;
2. runtime-модель;
3. синтаксис моделей и сценариев;
4. ссылки между сущностями.

Код `0` — файл валиден; `1` — есть ошибки. Валидация не открывает браузер.

## Для интеграторов

Машиночитаемые контракты:

- [`manifest.json`](manifest.json) — JSON Schema;
- [`run_summary.schema.json`](run_summary.schema.json) — итог прогона;
- [`../frontend/src/generated/keywords.json`](../frontend/src/generated/keywords.json) — действия runtime;
- [`../frontend/src/generated/method_ids.json`](../frontend/src/generated/method_ids.json) — команды PrettyK.

После изменения схемы frontend-копия обновляется командой:

```powershell
Set-Location frontend
npm.cmd run generate:schema
```

Процесс изменения контракта описан в [руководстве разработчика](development.md).
