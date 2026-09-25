# Локальный стенд PrettyK

> Обязательный контур: [`../sanctuary/pure/lab-up.md`](../sanctuary/pure/lab-up.md) (**CANON**).  
> Роли Grid / Live / Allure / Dojo: [`../sanctuary/pure/runtime-shell.md`](../sanctuary/pure/runtime-shell.md).  
> Ниже — lab команды и порты (PUBLIC).  
> **Чистка:** `lab_clean` = ops mid-lab (allure/live целиком). TTL/артефакты по check — эпик ART (`artifact_cleanup_job.py`), не подмена mid-run.  
> Retention job: checks с `legal_hold` не трогает — в отчёте job поле **`held_skipped`** (legal_hold).

Команды из корня репозитория. HTML-отчёты: **prettyk-allure3** (`http://127.0.0.1:5050/`, канон; порт :5051 свободен, legacy выпилен); чистка `-Target allure`.

> [!WARNING]

> Лабораторный scanner работает без API-ключа. Не публикуйте порты стенда в общую сеть и не направляйте active scan на систему без разрешения.

## Требования

- Windows 10/11 и PowerShell;
- Python 3.13;
- Node.js 20.19+ или 22.12+;
- Docker Engine или Docker Desktop с Compose v2;
- 8 ГБ свободной памяти (DefectDojo входит в старт по умолчанию).

## Установить зависимости

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r orchestrator\requirements.txt

Set-Location cosmo
npm.cmd ci
Set-Location ..
```

На Windows используйте `npm.cmd`, если политика PowerShell блокирует `npm.ps1`.

## Запустить только Редактор

> [!IMPORTANT]
>
> **После инвазивных правок FE сдавать мёртвый Editor нельзя.**  
> DoD агента (глаза: форма логина или shell, не белый экран; падение → логи и корень) —  
> см. [`internal/agent-primer.md`](internal/agent-primer.md) §15 «DoD живого Editor».  
> Операционный чеклист стенда — global skill **`prettyk-lab`** (startup: `lab_up.ps1`).  
> Обратная ссылка на этот раздел — там же (Jira-style bidirectional).

### Только интерфейс

Если нужно открыть или проверить только React-интерфейс, не запускайте весь lab и не запускайте playground:

```powershell
Set-Location cosmo
npm.cmd run dev
```

Откройте [http://localhost:5173/](http://localhost:5173/). Ожидаемо: форма логина или shell — не пустая белая страница.

### Интерфейс с проверкой PrettyK

```powershell
.\.cursor\scripts\lab_ensure_ui.ps1
```

Откройте [http://localhost:5173/](http://localhost:5173/).

Скрипт проверяет или запускает Vite и локальный API проверки языка. Он не запускает Docker, браузер, scanner, PrettyK Live или сценарий. После изменения Python-кода проверки перезапустите скрипт; изменения React и CSS обычно подхватывает Vite. Инвазивный FE → снова глазная проверка по блоку IMPORTANT выше.

## Запустить обязательный контур

Обычный старт без очистки выполняет один скрипт:

```powershell
.\orchestrator\tools\lab_up.ps1
```

Он поднимает Docker Engine при необходимости, Grid, **allure3-secops**, scanner daemon,
Juice Shop, Editor/playground, idle PrettyK Live и DefectDojo, после чего ждёт их HTTP-readiness.
Webswing не входит в старт по умолчанию. SonarQube — опционально:
`.\orchestrator\tools\lab_up.ps1 -IncludeSonarQube`.

Ниже — ручной fallback для диагностики стартёра.

### 1. Подготовить сеть и каталоги

```powershell
docker network inspect pk-net *> $null
if ($LASTEXITCODE -ne 0) { docker network create pk-net }

New-Item -ItemType Directory -Force -Path `
  reports\allure-results, `
  reports\allure-report, `
  reports\scanner-results, `
  reports\video | Out-Null
```

### 2. Запустить сервисы

```powershell
docker compose -f services\docker-compose.yml up -d
docker compose -f services\docker-compose.scanner.yml up -d
docker compose -f services\docker-compose.target.yml up -d
```

Этот набор поднимает Selenium Grid, браузеры, allure3-secops, scanner (daemon) и Juice Shop.

### 3. Запустить PrettyK Live

В отдельном терминале:

```powershell
Set-Location orchestrator
..\.venv\Scripts\python.exe tools\run_live_idle.py
```

PrettyK Live остаётся доступным между прогонами. Останавливать его после каждого сценария не нужно.

## Проверить готовность

```powershell
docker compose -f services\docker-compose.yml ps
docker compose -f services\docker-compose.scanner.yml ps
docker compose -f services\docker-compose.target.yml ps

curl.exe -fsS http://127.0.0.1:4444/status
curl.exe -fsS http://127.0.0.1:5050/health
curl.exe -fsS http://127.0.0.1:8080/JSON/core/view/version/
curl.exe -fsS http://127.0.0.1:3000/
curl.exe -fsS http://127.0.0.1:8767/api/meta
```

Все пять HTTP-команд должны завершиться без ошибки.

## Основные адреса

| Сервис | Адрес |
|---|---|
| Редактор | [http://localhost:5173/](http://localhost:5173/) |
| Juice Shop | [http://127.0.0.1:3000/](http://127.0.0.1:3000/) |
| pk-api-lab (REST/OpenAPI) | [http://127.0.0.1:8090/](http://127.0.0.1:8090/health) · [openapi.json](http://127.0.0.1:8090/openapi.json) |
| pk-api-lab GraphQL | [http://127.0.0.1:8090/graphql](http://127.0.0.1:8090/graphql) · [SDL](http://127.0.0.1:8090/graphql/sdl) |
| pk-api-lab gRPC | `127.0.0.1:50051` (`bank.v1.AccountService`) · proto pack `services/pk-api-lab/proto_pack` |
| PrettyK Live | [http://127.0.0.1:8767/](http://127.0.0.1:8767/) |
| Chrome noVNC | [http://127.0.0.1:7900/?autoconnect=1&resize=scale](http://127.0.0.1:7900/?autoconnect=1&resize=scale) |
| Selenium Grid | [http://127.0.0.1:4444/ui/](http://127.0.0.1:4444/ui/) |
| allure3-secops | [http://127.0.0.1:5050/](http://127.0.0.1:5050/) (корень → последний отчёт, канон) |
| scanner API | [http://127.0.0.1:8080/](http://127.0.0.1:8080/) |

Внутри Docker-сети Juice Shop доступен как `http://juice-shop:3000`. Именно этот адрес используют wired-файлы с remote-браузером.

## Проверить wired

Проверка структуры и сценариев без браузера:

```powershell
.\.venv\Scripts\python.exe orchestrator\main.py `
  --wired path\to\wired.json `
  --validate-only
```

Код `0` означает, что wired валиден; `1` — найдены ошибки.

## Выполнить прогон

```powershell
$env:PK_WEBDRIVER_MODE = "remote"

.\.venv\Scripts\python.exe orchestrator\main.py `
  --wired orchestrator\wired\wired_juice_baseline.json

$LASTEXITCODE
```

Коды полного прогона:

| Код | Значение |
|---:|---|
| `0` | сценарий выполнен, обязательные артефакты получены, quality gate пройден |
| `1` | ошибка загрузки, инициализации, выполнения или обязательной отчётности |
| `2` | сценарий выполнен, но quality gate обнаружил недопустимые alerts |

Для Juice Shop код `2` может быть ожидаемым: приложение намеренно уязвимо.

## Найти результат

| Путь | Содержание |
|---|---|
| `run_summary.json` | итог, код, gate и пути к артефактам |
| `reports\allure-results\` | исходные данные для allure3-secops |
| `reports\allure-report\` | HTML-отчёт (статика сервиса) |
| `reports\scanner-results\` | отчёты scanner |
| `reports\video\` | видео сессий Grid |
| `reports\live\` | данные PrettyK Live |

Артефакты могут содержать URL, тела ответов, снимки экрана и сведения об уязвимостях. Храните их как результаты проверки безопасности.

## Очистить локальные результаты

Обычная очистка перед новым прогоном (allure3-secops + Live diary/meta/hooks):

```powershell
.\orchestrator\tools\lab_clean.ps1 -Target allure,live
```

Отдельно:

```powershell
# только allure3-secops (токены allure и allure-light-secops — синонимы)
.\orchestrator\tools\lab_clean.ps1 -Target allure
.\orchestrator\tools\lab_clean.ps1 -Target allure-light-secops

# только ленты PrettyK Live (+ results_hooks.json); idle-процесс не гасить
.\orchestrator\tools\lab_clean.ps1 -Target live

# пересоздать Juice Shop и сбросить его состояние
.\orchestrator\tools\lab_clean.ps1 -Target juice
```

> [!CAUTION]
> `-Target juice` сбрасывает состояние цели. Не выполняйте эту команду во время прогона.

## Остановить стенд

```powershell
docker compose -f services\docker-compose.target.yml down
docker compose -f services\docker-compose.scanner.yml down
docker compose -f services\docker-compose.yml down
```

DefectDojo (по умолчанию) и SonarQube (если запускался):

```powershell
docker compose -f services\docker-compose.defectdojo.yml down
docker compose -f services\docker-compose.sonarqube.yml down
```

Эти команды не удаляют именованные volumes. Не добавляйте `--volumes`, если данные нужны.

## Опциональные сервисы

### HAR → scanner sequence (IMP-HAR)

Compose scanner монтирует `reports/runs` → `/scanner/wrk/prettyk-runs`. Studio Resources (`kind=har_file`) пишут `.har` в run-dir; `ИмпортHAR` переписывает host-path в контейнерный. После правки `services/docker-compose.scanner.yml` volumes — **recreate** demon, не только restart:

```powershell
docker compose -f services\docker-compose.scanner.yml up -d --force-recreate
```

Живой smoke sequence (IMP-HAR-4): `$env:PK_HAR_SEQUENCE_LIVE=1` → `pytest tests/test_har_sequence_live.py` (IMP-HAR-4).  
Реальный gRPC unary (lab Ping): `$env:PK_GRPC_UNARY=1` + api-lab `:50051` (Opt-in).

### Scanner Webswing

По умолчанию | или манифест `scanner_mode=webswing` | `.scanner` compose из стенда |

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File services\scanner-webswing-up.ps1
```

UI: [http://127.0.0.1:8082/scanner](http://127.0.0.1:8082/scanner). Подробности: Webswing lab baseline (см. `sanctuary/pure/zap-dual.md`).

### DefectDojo

DefectDojo не участвует в выполнении сценария (шаги/WebDriver). После прогона XML импортируется в finalize; **admission quality gate** читает ACTIVE severity counts из Dojo (scanner — fallback, если Dojo skipped). Входит в `lab_up.ps1` по умолчанию и поднимается до ready/healthy (nginx/postgres/valkey `healthy`, uwsgi/celery Up, `restart: unless-stopped`). Ручной fallback:

```powershell
docker compose -f services\docker-compose.defectdojo.yml up -d
```

Локальный вход: `admin` / `admin`. Не используйте эти данные вне изолированной лаборатории.

### SonarQube (Community)

Статический анализ (INFRA-10). Не в обязательном `lab_up` — только явный старт. Нужно ~2–4 ГБ RAM сверх базового контура; первый boot 2–5 мин.

```powershell
docker network inspect pk-net *> $null
if ($LASTEXITCODE -ne 0) { docker network create pk-net }
docker compose -f services\docker-compose.sonarqube.yml up -d
```

Или: `.\orchestrator\tools\lab_up.ps1 -IncludeSonarQube`.

UI: [http://127.0.0.1:9000/](http://127.0.0.1:9000/). Креды admin — в gitignored [`sonar-access.md`](../sonar-access.md) (не в docs).

Раздельный скан backend / frontend (токен из UI → `$env:SONAR_TOKEN`):

```powershell
.\orchestrator\tools\sonar_scan.ps1 -Target backend
.\orchestrator\tools\sonar_scan.ps1 -Target frontend
```

SonarQube — lab-сервис; детали в `sanctuary/pure/lab-up.md`.

## Типовые проблемы

| Симптом | Что проверить |
|---|---|
| `npm.ps1 cannot be loaded` | используйте `npm.cmd` |
| `network pk-net not found` | повторите подготовку сети |
| Редактор не отвечает | выполните `lab_ensure_ui.ps1`; Vite обычно доступен через `localhost`, не `127.0.0.1`. Логи: `.cursor/logs/vite-dev.log` / `vite-dev.err.log`. Старт UI — вне Job Object агентского шелла (иначе Vite умирает вместе с abort/end-of-turn). |
| Белая страница, в DevTools `__BUNDLED_DEV__ is not defined` | это известная ошибка Vite 8 HMR-клиента. В `vite.config.ts` есть workaround. Перезапустите только Vite: завершите его терминал и выполните `Set-Location cosmo; npm.cmd run dev`. Убедитесь, что [http://localhost:5173/@vite/client](http://localhost:5173/@vite/client) содержит `const isBundleMode = false;`. |
| `lab_ensure_ui.ps1` завершился на `curl: (7) Failed to connect` вместо запуска Vite | обновите рабочую копию: скрипт теперь подавляет ожидаемый stderr `curl` и доходит до `Start-Vite`. Для немедленного UI-запуска используйте `Set-Location cosmo; npm.cmd run dev`. |
| Selenium недоступен | проверьте `:4444/status` и `docker compose ... ps` |
| В Grid нет живого экрана | откройте noVNC `:7900`; для картинки нужен не headless-браузер |
| PrettyK Live пуст | запустите `run_live_idle.py`; до первого шага пустая лента нормальна |
| scanner connection refused | дождитесь ответа API `:8080` |
| Браузер не видит Juice Shop | внутри Docker используйте `http://juice-shop:3000`, не `localhost` |
| allure3-secops не создал отчёт | проверьте `:5050/health` (`service=allure3-secops`) и файлы в `reports\allure-results` |

Короткий набор команд: операторская шпаргалка (см. `sanctuary/pure/lab-up.md`). Архитектура сервисов: браузерный стенд и отчётность (см. `sanctuary/pure/runtime-shell.md`). Требования к изоляции: [безопасная эксплуатация](security.md).
