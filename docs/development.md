# Разработка PrettyK

Здесь собраны требования к окружению, источники контрактов и проверки перед изменением PrettyK.

## 1. Требования

- Python `3.13.x`;
- Node.js `20.19+` либо `22.12+`;
- npm с поддержкой `package-lock.json`;
- Docker Compose v2 для интеграционного стенда;
- Git.

Runtime-зависимости перечислены в `orchestrator/requirements.txt`, тестовые и вспомогательные — в `orchestrator/requirements-dev.txt`:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install `
  -r orchestrator\requirements.txt `
  -r orchestrator\requirements-dev.txt

Set-Location frontend
npm.cmd ci
Set-Location ..
```

## 2. Карта репозитория

| Путь | Назначение |
|---|---|
| `orchestrator/main.py` | публичная точка запуска alpha |
| `orchestrator/models/` | Pydantic-модели манифеста |
| `orchestrator/core/` | Controller, язык, MethodId, DataStream |
| `orchestrator/adapters/` | интеграции с WebDriver, сканером, HTTP, данными и DefectDojo |
| `orchestrator/tools/` | генераторы каталогов; опц. API `data_playground.py` |
| `orchestrator/tests/` | Python-тесты |
| `frontend/` | Форма + Редактор-IDE (PrettyK / WireK; без UI-песочницы) |
| `frontend/src/generated/` | производные schema, keywords и MethodId |
| `docs/manifest.json` | редактируемая JSON Schema |
| `services/` | лабораторные compose-конфигурации и allure3-secops |
| `reports/` | локальные результаты; не исходный код |

## 3. Поддерживаемая точка запуска

Публичный CLI:

```powershell
.\.venv\Scripts\python.exe orchestrator\main.py --manifest <path>
.\.venv\Scripts\python.exe orchestrator\main.py --manifest <path> --validate-only
```

`--validate-only` — JSON Schema (`docs/manifest.json`) + Pydantic + конструкторы языка; без Controller/Scanner/Grid. Код выхода: `0` ок, `1` ошибки валидации. Фикстуры: `orchestrator/fixtures/validate_ok.json`, `validate_bad_ctor.json`.

`orchestrator/cli/parser.py` не подключён к `main.py`. Его параметры `--scanner-host`, `--scanner-port` и `--headless` не являются публичным контрактом.

`orchestrator/manifest_runner.py` — устаревшая pytest-обвязка. Не используйте её как промышленную точку запуска.

## 4. Источники истины

| Контракт | Редактируемый источник | Производный артефакт |
|---|---|---|
| схема манифеста (SoT формы/Редактора) | `docs/manifest.json` | `frontend/src/generated/manifest.schema.json` |
| runtime-модель | `orchestrator/models/manifest.py` | — |
| исполнение | `orchestrator/core/controller.py` и адаптеры | — |
| wire-сигнатуры | публичные методы адаптеров и Reporter | `frontend/src/generated/keywords.json` |
| MethodId | `orchestrator/core/method_id.py` | `frontend/src/generated/method_ids.json` |
| слова языка | `orchestrator/core/language_words.py` и парсер | подсказки frontend |
| `run_summary.json` | `orchestrator/utils/reporter.py` | `docs/run_summary.schema.json` — машиночитаемое описание фактического payload |

Производные JSON-файлы запрещено править вручную.

## 5. Генерация

Из корня репозитория:

```powershell
.\.venv\Scripts\python.exe orchestrator\tools\export_keywords.py
.\.venv\Scripts\python.exe orchestrator\tools\export_method_ids.py

Set-Location frontend
npm.cmd run generate:schema
Set-Location ..
```

Проверка каталогов без записи:

```powershell
.\.venv\Scripts\python.exe orchestrator\tools\export_keywords.py --check
.\.venv\Scripts\python.exe orchestrator\tools\export_method_ids.py --check
```

Для schema отдельного `--check` нет. Запустите генератор и убедитесь, что `git diff --exit-code -- frontend/src/generated/manifest.schema.json` не показывает незапланированный дрейф.

Команда frontend `npm run generate` последовательно обновляет все три артефакта, но использует команду `python`. На Windows с виртуальной средой надёжнее запускать Python-генераторы явно, как показано выше.

## 6. Проверки

**QA-1:** в UI-итерациях — только точечный файл или быстрый контур. Полный suite запрещён правилом testing.

| Контур | Команда |
|---|---|
| Fast BE | `.\orchestrator\tools\pytest_fast.ps1` (= `pytest -m "not heavy"`) |
| Точечный BE | `py -3 -m pytest orchestrator\tests\test_x.py -q` |
| Heavy/lab | opt-in env / живой стенд; маркеры `heavy` · `lab` в `pytest.ini` |
| Fast FE | `npm.cmd run test:fast` + путь к файлу при правке |

### 6.1 Python

```powershell
# быстрый контур (без heavy/lab)
.\orchestrator\tools\pytest_fast.ps1

# полный (редко; не в UI-цикле)
py -3 -m pytest orchestrator\tests -q
```

Для изменения языка или MethodId минимум:

```powershell
py -3 -m pytest `
  orchestrator\tests\test_method_id.py `
  orchestrator\tests\test_methods_placement_smoke.py `
  orchestrator\tests\test_string_bank_pack.py `
  orchestrator\tests\test_collections_smoke.py `
  orchestrator\tests\test_language_wave1.py -q
```

### 6.2 Frontend

```powershell
Set-Location frontend
npm.cmd run test:fast -- src\path\to\file.test.tsx
npm.cmd run typecheck
npm.cmd run build
npm.cmd run lint
Set-Location ..
```

### 6.3 Compose

Проверка синтаксиса не запускает контейнеры:

```powershell
docker compose -f services\docker-compose.yml config
docker compose -f services\docker-compose.scanner.yml config
docker compose -f services\docker-compose.target.yml config
docker compose -f services\docker-compose.defectdojo.yml config
```

Интеграционный прогон выполняется по [`stand.md`](stand.md). Запуск active scan не входит в обычный unit test и требует разрешённой цели.

## 7. Изменение манифеста

Изменение поля считается контрактным и выполняется в одной поставке:

1. получить решение владельца и изменить `docs/manifest.json`;
2. изменить Pydantic-модель либо явно оставить поле декларативным;
3. определить поведение Controller;
4. добавить тесты валидного и невалидного ввода;
5. обновить `docs/manifest.md` (и Форма/Редактор UX, если меняется поверхность авторства);
6. перегенерировать schema (`npm run generate:schema`);
7. проверить **Форму**, **Редактор**, tests и build (зона FE — ветка `frontend`).

Нельзя молча добавлять поле только в UI и описывать его как исполняемое. Документалист правит narrative в `docs/**`; код схемы/UI — FE/бэк по карточкам.

## 8. Добавление wire-действия

1. Реализовать публичный метод в подходящем адаптере.
2. Исключить служебный метод из публичного каталога, если он не является keyword.
3. Добавить unit test вызова и ошибок.
4. Обновить `keywords.json`.
5. При необходимости добавить MethodId отдельно.
6. Проверить, что действие не обходит границы адаптера и не выводит секреты.

`Controller._register_actions` и `export_keywords.py` должны описывать одинаковый набор компонентов. Особый случай — компонент `allure`: он регистрирует ограниченный список методов Reporter.

## 9. Добавление MethodId

1. Добавить отображение в `orchestrator/core/method_id.py`.
2. Выбрать tier: корень, проверка, util или ворота.
3. Не дублировать весь домен в корневом автодополнении.
4. Добавить тест resolve и тест раскладки (`tests/test_methods_placement_smoke.py`).
5. Обновить `method_ids.json`.
6. Проверить автодополнение вручную по [`../logic-construction.md`](../logic-construction.md) §2.1 и [`stand.md`](stand.md) §4.1.

Предпочтительные ворота:

- `Сканер` — `zap|*`;
- `HTTP` — `http|*`;
- `Сессия` — `browser|*`;
- `Драйвер` — `webdriver|*`.

Первая стрелка AC в Monaco Редактора (Ctrl+Space): язык + `?` + короткий ui + `Проверить*` + ворота + `Операция`. Не светить util dump, сырой `webdriver|…`, корневые `ПолучитьАлерты` / `ОтчётZAP` / `Паук*`. Resolve при execute шире AC. Исторические идеи переименования RU без смены wire — в [`history/2026-08-editor-wave/`](history/2026-08-editor-wave/README.md).

## 10. Изменение языка

Языковое изменение должно иметь один AST и один путь исполнения. Pretty и wire — представления, а не независимые runtime.

Порядок:

1. зафиксировать грамматику и ошибки;
2. изменить parser/AST;
3. изменить executor;
4. добавить положительные, граничные и отрицательные тесты;
5. обновить автодополнение;
6. обновить `logic-construction.md`;
7. проверить, что старые алиасы не расширяют канон случайно.

Запрещено разбирать новый синтаксис набором несвязанных regex в Controller, если он относится к LanguageEngine.

## 11. Правила безопасности разработки

- Не коммитить `.env`, токены, cookies, результаты и снимки реальных систем.
- Не использовать production-цель для smoke-теста.
- Не включать `api.disablekey=true` вне лаборатории.
- Не публиковать порты compose на недоверенном интерфейсе.
- Не объявлять поставку воспроизводимой, пока версии и digest не закреплены.
- Не считать успешный exit code достаточным без проверки обязательных артефактов.

## 12. Фронтенд, ассеты и мгновенная визуальная проверка

- **Единый источник истины иконок:** `frontend/src/assets/icons/`. Все ассеты компонентов подтягиваются через ES-импорты (напр. `import icon from '../assets/icons/name.png'`).
- **Моментальный браузерный скриншоттер:** `npm run screenshot` (в папке `frontend`). Playwright `connectOverCDP` (живой Chrome `:9222`) или headless fallback; раскрывает дерево и сохраняет точный снимок UI в `screenshot_latest.png`.
- **Ширина WireK:** выезжает за сплиттер до 50% ширины всего экрана (`window.innerWidth` / `workspaceRef`), со свободой растягивания поверх центральной области.


Текущая инженерная очередь — [`backlog.md`](backlog.md); долг Release 1 — историческая запись в [`history/releases/alpha-1.0.0/`](history/releases/alpha-1.0.0/README.md).
