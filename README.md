# PrettyK

PrettyK — среда для функциональных и динамических проверок безопасности веб-приложений. Автор описывает сценарий в Редакторе на языке PrettyK, оркестратор выполняет его через браузер и OWASP ZAP (scanner), а результат появляется в PrettyK Live, Allure и `run_summary.json`.

Статус проекта: **alpha, подготовка к beta**. Формат манифеста и язык ещё могут меняться.

> [!WARNING]
> Активное сканирование создаёт нагрузку и может изменить данные цели. Используйте PrettyK только в согласованном контуре. Локальный стенд предназначен для Juice Shop и других изолированных тестовых систем.

## Попробовать PrettyK

Требуются Windows 10/11, Python 3.13, Node.js и Docker.

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r orchestrator\requirements.txt

Set-Location frontend
npm.cmd ci
Set-Location ..

.\.cursor\scripts\lab_ensure_ui.ps1
```

Откройте [http://localhost:5173/](http://localhost:5173/). Редактор позволяет создать сценарий и скачать манифест без запуска браузера или сканирования.

Дальше:

1. [Создайте первый сценарий](docs/getting-started.md).
2. [Запустите локальную проверку Juice Shop](docs/guides/first-juice-check.md).
3. [Откройте всю документацию](docs/README.md).

## Что входит в PrettyK

- Форма параметров проверки и Редактор сценариев;
- язык PrettyK и стабильная диагностическая запись `component|action|args`;
- Python-оркестратор, WebDriver, HTTP-клиент и управление сканером (OWASP ZAP);
- локальный стенд с Juice Shop, Selenium Grid, PrettyK Live и allure-light-secops;
- quality gate по уровню alerts сканера;
- JSON Schema для интеграции с внешними системами.

Единственная поддерживаемая точка полного запуска:

```powershell
.\.venv\Scripts\python.exe orchestrator\main.py --manifest path\to\manifest.json
```

Коды завершения: `0` — проверка завершена и gate пройден; `1` — ошибка; `2` — проверка завершена, но gate обнаружил недопустимые alerts.

## Для интеграции и разработки

- [структура манифеста](docs/manifest.md);
- [технический паспорт](docs/prettyk.md);
- [безопасная эксплуатация](docs/security.md);
- [разработка и тесты](docs/development.md);
- [`docs/manifest.json`](docs/manifest.json) — JSON Schema;
- [`docs/run_summary.schema.json`](docs/run_summary.schema.json) — итог прогона.
