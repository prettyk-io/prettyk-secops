# PrettyK: технический паспорт

> **PUBLIC/QUEUE detail**, не hub CANON. Истина: [`canon/INDEX.md`](canon/INDEX.md) · runtime: [`canon/runtime-shell.md`](canon/runtime-shell.md) · кандидаты: [`canon/POSSIBLE-FRIEND.md`](canon/POSSIBLE-FRIEND.md).

PrettyK — интерпретатор JSON-манифестов для функциональных и динамических проверок безопасности веб-приложений. В одном манифесте — данные, браузер, HTTP и управление OWASP scanner. Оркестратор гоняет сценарий, кладёт свидетельства на диск и отдаёт код выхода для CI.

> [!WARNING]
> PrettyK выполняет активные действия и может изменять состояние цели. Применение допускается только в согласованном контуре и в пределах выданного разрешения на проверку.

## 1. Контур исполнения

Alpha реализует сквозной контур:

```text
JSON-манифест
  → Python-оркестратор (Controller)
  → браузер через MITM-прокси OWASP scanner
  → действия spider / active scan + scanner XML/HTML на диск
  → quality gate по настраиваемому порогу серьёзности
  → main: finalize_reports
       → allure-light-secops generate
       → опциональный импорт XML в DefectDojo
```

Для заведомо уязвимой цели ожидается код процесса `2`, если сценарий завершился без ошибки, обязательные отчёты доступны и quality gate по заданному порогу не пройден.

Поддерживаемая внешняя точка запуска одна:

```powershell
python orchestrator\main.py --manifest <path-to-manifest.json>
```

Проверка без запуска Controller, scanner и WebDriver:

```powershell
python orchestrator\main.py --manifest <path-to-manifest.json> --validate-only
```

## 2. Задача продукта

PrettyK отделяет описание проверки от технической обвязки конкретного пайплайна. Автор задаёт проверку декларативно, а runtime:

1. в `--validate-only` проверяет JSON Schema, Pydantic-модель и конструкторы; полный run при загрузке применяет Pydantic;
2. подготавливает scanner, WebDriver и аутентификацию HTTP;
3. строит поток данных сценария;
4. разрешает pretty-команды и MethodId в wire-действия;
5. исполняет шаги через адаптеры;
6. завершает браузерную сессию и формирует артефакты;
7. оценивает alerts scanner по настраиваемому порогу и возвращает код для CI.

Основные потребители alpha — разработчики PrettyK, инженеры автоматизации, AppSec и интеграторы DevSecOps.

## 3. Нецели alpha

В текущий контракт не входят:

- промышленный портал управления проверками;
- защищённая конфигурация scanner, DefectDojo и браузерной фермы;
- полностью автономный airgap-дистрибутив;
- автоматическое исполнение каждого поля JSON Schema;
- стабильный Python SDK;
- промышленная браузерная ферма сверх лабораторного Selenium Grid;
- гарантированная оркестрация зависимостей между сценариями и шагами;
- промышленный продукт Webswing (auth UI, единый процесс с daemon, встроенный desktop в PrettyK); lab baseline concurrent + hold — есть, см. [`webswing-daemon-stand.md`](webswing-daemon-stand.md).

Каталог `frontend/` — демо **Форма | Редактор** (schema [`zaebal.json`](zaebal.json)): анкета + **свой IDE** suites (Модели данных, Сценарии, Модули, Fuzzers, Ресурсы → PrettyK → WireK). Ресурсы = input-файлы. Нет UI-песочницы; `data_playground` — опциональный tool. Suites только в Редакторе (`custom_policy`). Пользовательская модель: [`zaebal.md`](zaebal.md).

## 4. Архитектура

Два контура: **исполнение** (манифест → адаптеры → цель) и **финализация отчётов** (`main` → `finalize_reports`). scanner пишет файлы отчётов на диск; в DefectDojo их отправляет оркестратор, не scanner.

### 4.1 Исполнение

```mermaid
flowchart TB
  Author[Автор или внешний портал] --> Form[Форма: meta infra security]
  Author --> Editor[Редактор IDE: дерево PrettyK Wire]
  Form --> Wired[JSON или suite ZIP]
  Editor --> Wired
  Schema[docs/manifest.json] -.->|AJV / effectiveSchema| Form
  Schema -.-> Editor

  Wired --> Val[Validator AJV / --validate-only]
  Val --> Main[orchestrator/main.py]
  Main --> Model[Pydantic Wired]
  Model --> Controller[Controller]

  Controller --> Stream[DataStream]
  Controller --> Language[LanguageEngine]
  Language --> MethodId[MethodId resolver]
  Language --> AST[AST]
  AST --> Factory[ActionFactory]

  Factory --> WD[WebDriverAdapter]
  Factory --> Browser[BrowserAdapter]
  Factory --> scanner[scannerAdapter]
  Factory --> HTTP[HttpAdapter]
  Factory --> Data[DataAdapter / Inspector]

  WD --> Driver[Local WebDriver или Selenium Grid]
  Driver -->|proxy 8099| scanner[OWASP scanner]
  scanner -->|API 8080| scanner
  scanner --> Target[Разрешённая цель]
  HTTP --> Target
```

### 4.2 Отчёты и свидетельства

```mermaid
flowchart TD
  Ctrl[Controller.run] --> Bind[bind_allure / allure attach]
  Ctrl --> scannerGen[scannerAdapter.generate_report]
  scannerGen --> Disk["reports/scanner-results XML/HTML"]
  Bind --> Results["reports/allure-results"]
  Ctrl --> Teardown["teardown: scanner-final.html + close_test"]
  Teardown --> Results

  Main[main.py finally] --> Fin["finalize_reports"]
  Fin --> AllureGen["trigger_allure_report → allure-light-secops"]
  AllureGen --> HtmlReport["reports/allure-report"]
  Fin --> Dojo["trigger_defectdojo_import XML с диска"]
  Disk -.->|путь к XML| Dojo
```

Allure HTML и импорт DefectDojo вызываются только из `finalize_reports` после `Controller.shutdown`. По умолчанию сбой Allure/Dojo журналируется. При `KDT_REQUIRE_ALLURE=1` или `KDT_REQUIRE_DEFECTDOJO=1` отсутствие или сбой соответствующего результата переводит процесс в код `1`.

### 4.3 Компоненты

| Компонент | Ответственность |
|---|---|
| `docs/manifest.json` | Legacy JSON Schema (RJSF era). Machine-контракт: Pydantic. Форма — прямой React-маппер. |
| `orchestrator/models/manifest.py` | runtime-модель загрузки и базовая валидация |
| `orchestrator/core/controller.py` | lifecycle прогона, сценарии, данные, quality gate, запись allure-results |
| `orchestrator/core/language_engine.py` | разбор pretty-языка и построение AST |
| `orchestrator/core/method_id.py` | отображение русских MethodId в wire-действия |
| `orchestrator/core/execution_trace.py` | независимое дерево исполненных действий и control-flow для Live/Allure |
| `orchestrator/core/action_factory.py` | регистрация и вызов действий |
| `orchestrator/adapters/` | границы интеграции с WebDriver, scanner, HTTP и данными |
| `orchestrator/adapters/scanner_adapter.py` | API scanner; `generate_report` пишет файл на диск |
| `orchestrator/utils/reporter.py` | вложения; `finalize_reports` → allure-light-secops и DefectDojo |
| `orchestrator/adapters/defectdojo_client.py` | HTTP import-scan XML (вызов из Reporter) |
| `frontend/` | Форма (анкета) + Редактор-IDE (Модели данных / Сценарии / Модули / Fuzzers / Ресурсы · PrettyK · WireK) |

Controller не должен обращаться к Selenium или scanner в обход адаптеров. Reporter — утилита финализации, не адаптер исполнения шагов.

### 4.4 Потоки управления и трафика

Управляющий поток к scanner идёт через API на `127.0.0.1:8080`. Браузерный HTTP/S-трафик направляется через отдельный listener на порту `8099`. Для удалённого браузера loopback заменяется на адрес хоста, доступный из контейнера.

Прямые запросы `HttpAdapter` не проходят через браузер. Их аутентификация подготавливается отдельно по `security_configuration.auth_*`.

## 5. Жизненный цикл прогона

Перед полным прогоном есть отдельная ветка `--validate-only`: JSON → stripping legacy-ключей → `docs/manifest.json` → Pydantic → проверка конструкторов. Она возвращает `0` или `1` и не создаёт Controller, scanner или WebDriver.

Полный прогон:
1. `main.py` загружает JSON, готовит env/secretref и создаёт `Manifest`.

2. `Controller` подключает scannerAdapter, создаёт listener браузерного прокси и регистрирует действия.
3. Создаётся WebDriverAdapter; реальный браузер стартует при первом браузерном действии.
4. Применяются тайм-ауты инфраструктуры и поддерживаемый HTTP auth bootstrap.
5. Для каждого сценария: `bind_allure`, Allure test result и сценарный `DataStream`.
6. Контекст и экспорт поддерживаемых data-модулей поступают в поток данных.
7. Шаг разбирается в AST или wire и исполняется через ActionFactory.
8. `save_as`, retry, failsafe и `continue_on_failure` применяются к листовым шагам; keyword `scanner Отчёт` пишет XML/HTML на диск.
9. После сценария: финальный `scanner-final.html`, закрытие Allure test; затем Controller запрашивает alerts от `KDT_GATE_SEVERITY` и выше.
10. В `main` `finally`: `Controller.shutdown` (WebDriver), затем `finalize_reports` — генерация allure-light-secops и при включённой интеграции импорт XML в DefectDojo.

Ошибки финализации отчётности журналируются отдельно. Они не подменяют результат исполнения по умолчанию, но становятся ошибкой процесса при `KDT_REQUIRE_ALLURE=1` или `KDT_REQUIRE_DEFECTDOJO=1`.

Текущая приёмка: [`acceptance/`](acceptance/). Журналы alpha — в [`history/releases/alpha-1.0.0/`](history/releases/alpha-1.0.0/README.md).

## 6. Фактический контракт манифеста

JSON Schema описывает форму шире, чем runtime. Наличие поля в схеме означает, что его можно представить и проверить структурно, но не означает автоматического исполнения.

Поверхности и ворота (сдержанно; поля — [`manifest.md`](manifest.md) §1.1):

| Поверхность | Что делает | Что не делает |
|---|---|---|
| **Форма** | meta / infra / security (+ target-блоки); download / copy / load / reset | нет `test_suites` на UI; CTA «Запустить» = театр |
| **Редактор** | IDE suites: 5 разделов дерева; PrettyK; WireK = трансформ. view + «Валидировать» | Validate = client-only ≠ run; не RJSF-конструкторы |
| **CLI** `main.py` | единственное ребро исполнения → Controller / gate / reports | UI не вызывает Controller напрямую |

### 6.1 Поддерживается

| Область | Поведение |
|---|---|
| `meta.assessment_purpose` | метка Allure и ветвление обязательности security |
| `meta.project_id` | метаданные прогона и сессии браузера |
| `infrastructure.browser_type` | выбор Chrome/Firefox и headless |
| тайм-ауты infrastructure | таймер работы и таймер бездействия |
| `additional_local_server_port` | дополнительный listener scanner |
| `test_suites.pages` | `constructor` макета → elements/actions; legacy массивы мержатся |
| `test_suites.imports` | `data_file` `.txt` → список строк в DataStream |
| `test_suites.scenarios[].steps` | последовательное исполнение |
| `constructor` шага | pretty, MethodId или wire |
| `retry`, `retry_delay` | повтор шага после ошибки |
| `failsafe`, `continue_on_failure` | регулируемое продолжение |
| `save_as` | сохранение результата в DataStream |
| quality gate | код `2`, если gate включён и есть alert от `KDT_GATE_SEVERITY` и выше |

### 6.2 Поддерживается частично

| Область | Ограничение |
|---|---|
| `auth_type`, `auth_details` | Basic, Bearer, API Cookie и Cookie подготавливают HttpAdapter; браузерная сессия и SSO задаются шагами |
| `test_data_constructor` | в DataStream экспортируются только реализованные формы данных; технический конфиг не равен исполняемому коннектору |
| page model | макет `constructor` первичен в схеме/Редакторе; legacy `elements`/`actions` при импорте |
| `scanner_mode=webswing` | bootstrap + poke UI + API :8090 + hold до idle/work; dual-stand с demon; не промышленный Desktop-продукт |
| валидация текста шага | проблемы собираются до прогона, но не всегда останавливают его до первого действия |
| отчётность | результаты и XML создаются действиями; Allure/Dojo обязательны только при `KDT_REQUIRE_ALLURE=1` / `KDT_REQUIRE_DEFECTDOJO=1` |

### 6.3 Декларативно, без автоматического исполнения

- `security_configuration.base_url_override` не открывается автоматически;
- `allowed_extra_domains` не создаёт scanner include/exclude;
- `scan_policy` не запускает spider, active scan, OpenAPI или crawler;
- `test_suites.imports`: runtime принимает `.txt` / `data_file`; `scenario_json` отклоняется;
- `depends_on` и `context` не входят в схему сценария; в legacy JSON графа исполнения нет;
- `scanning_and_fuzzing_targets`, `openapi_swagger_scanning`, `api_targets_scanning` и `gui_elements_scanning` сами по себе не запускают действия;
- поля портального процесса в `meta` не влияют на сценарий, если код явно их не читает.

Подробное описание полей: [`manifest.md`](manifest.md).

## 7. Язык и действия

Автор может использовать три представления:

```text
pretty / MethodId → AST → wire → ActionFactory → адаптер
```

Пример:

```text
Нажать css .submit
        ↓
webdriver|click|css|.submit
```

Wire-формат `component|action|args` остаётся диагностическим контрактом runtime. Pretty-язык предоставляет данные, ветвления, циклы, обработку ошибок, группы и page calls. Полный справочник: [`../logic-construction.md`](../logic-construction.md). Живой разбор Juice smoke (pretty → wire): [`language-conversion-juice.md`](language-conversion-juice.md).

Полный каталог действий не копируется в паспорт. Источники истины:

- код адаптеров и `frontend/src/generated/keywords.json` — сигнатуры wire-действий;
- `orchestrator/core/method_id.py` и `frontend/src/generated/method_ids.json` — MethodId и ворота автодополнения.

## 8. Результат процесса

| Код | Смысл |
|---:|---|
| `0` | исполнение завершено без ошибки, требуемые отчёты доступны, gate пройден или отключён |
| `1` | ошибка загрузки, инициализации или исполнения; также отсутствует требуемый Allure/Dojo |
| `2` | исполнение и обязательная отчётность завершились, но gate не пройден |

Порог gate задаёт `KDT_GATE_SEVERITY`: `High` по умолчанию, также `Medium`, `Low` или `Informational`. `KDT_QUALITY_GATE=0` отключает severity-gate. Ошибка чтения алертов по умолчанию fail-closed (`KDT_QUALITY_GATE_ON_ALERT_ERROR=closed`) и ведёт к коду `2`; `open`/`fail-open` разрешает fail-open только осознанно.

Артефакты по умолчанию:

| Путь | Содержание |
|---|---|
| `reports/allure-results/` | результаты и вложения |
| `reports/allure-report/` | HTML allure-light-secops |
| `reports/scanner-results/` | отчёты scanner |
| `reports/video/` | видео удалённого браузера |
| `reports/live/` | дневник Live (если был) |
| `run_summary.json` | итог полного прогона: exit, gate, счётчики сценариев, пути, режим и фактические порты scanner; cwd или `KDT_RUN_DIR` |

Машиночитаемый контракт — [`run_summary.schema.json`](run_summary.schema.json). `paths.allure_results` и `paths.allure_report` присутствуют всегда; `scanner_html`, `scanner_xml` и `live` — только когда этот артефакт есть. `gate=void` (или legacy `error`) — код процесса `1`, допуск не авторитетен; `gate=fail` — отказ допуска (код `2`).

## 9. Доверенные границы

```mermaid
flowchart LR
  CI[CI / разработчик] -->|манифест и секреты окружения| Host[PrettyK host]
  Host --> Docker[Docker Engine]
  Docker --> Browser[Контейнер браузера]
  Host --> scanner[scanner API]
  Browser -->|MITM| scanner
  scanner --> Target[Разрешённая цель]
  Host --> Artifacts[Артефакты на диске]
  Host -->|finalize_reports XML| Dojo[Внешний DefectDojo]
  Host -->|finalize_reports| AllureLite[allure-light-secops]
```

Критические границы:

- манифест является исполняемым входом и должен поступать из доверенного источника;
- scanner получает возможность обращаться к целевой сети и модифицировать трафик;
- порты Selenium Grid и noVNC доступны на лабораторном узле (без docker.sock);
- `acceptInsecureCerts` ослабляет проверку сертификата внутри тестовой сессии;
- результаты могут содержать секреты, персональные данные и описания уязвимостей;
- токены DefectDojo передаются только через защищённое окружение.

Полный набор мер: [`security.md`](security.md).

## 10. Сервисы и поставка

Для локального доказательства используются Selenium Grid 4 (noVNC), allure-light-secops, Juice Shop и опциональный DefectDojo. Бывший Selenoid заменён; Docker socket ферме не нужен.

Airgap остаётся целевой моделью. Alpha не содержит готового offline-бандла, реестра SBOM, процедуры импорта образов и полного набора закреплённых digest. Теги `latest` в compose исключают утверждение о воспроизводимой поставке.

Локальный запуск описан в [`stand.md`](stand.md), сервисы — в [`basis-services.md`](basis-services.md), порядок изменения контрактов — в [`development.md`](development.md).
