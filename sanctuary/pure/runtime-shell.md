# Runtime shell — Grid, WebDriver, Live-монитор

> **CANON** — hub topic. Slice: **11 августа 2026** (Live/Session touch).  
> Реестр: [`INDEX.md`](INDEX.md).  
> Lab detail: [`../monitoring.md`](../monitoring.md) · [`../basis-services.md`](../basis-services.md) · [`../stand.md`](../stand.md).

## 1. Роли (не путать) — экстраполируется на любой стенд

| Роль | Вопрос | Не является |
|---|---|---|
| **WebDriver** | Кто кликает в UI? | Отчётом / SOC |
| **Selenium Grid** (опц.) | Remote WD + UI сессий + noVNC нод | Оболочкой KDT |
| **Live-оболочка** (PrettyK Live) | Картинка + ленты сценария/ZAP во время прогона | Grid UI / Allure / Dojo |
| **Сырой noVNC** | Desktop ноды без лент | Продуктовым монитором |
| **allure-light-secops** | HTML шагов после прогона | Live |
| **DefectDojo** | Реестр findings (часто ACTIVE для gate) | Исполнением шагов |
| **ZAP** | MITM + API сканера | Браузерной фермой |

Формула стенда: **манифест → оркестратор → WebDriver (±Grid) → трафик через ZAP → свидетельства (Allure/ZAP/Dojo) + опционально Live**.

## 2. Lab-контур (локальные порты — пример, не догма)

Типичный compose: hub, Chrome/Firefox + noVNC, video sidecar, allure3-secops (канон). Docker socket в ферму **не** монтировать.

| Сервис (lab) | Пример URL |
|---|---|
| Grid UI | `http://127.0.0.1:4444/ui/` (слэш в конце) |
| Live | `http://127.0.0.1:8767/` |
| noVNC Chrome | `http://127.0.0.1:7900/?autoconnect=1&resize=scale` |
| allure3-secops | `http://127.0.0.1:5050/` |
| DefectDojo | `http://127.0.0.1:8081/` |

На другом стенде меняются host/ports/compose — **роли из §1 те же**.

## 3. Env-якоря (транспорт, не поля анкеты)

| Переменная | Смысл |
|---|---|
| `KDT_WEBDRIVER_MODE` | `remote` \| `local` (не поле манифеста) |
| `KDT_SELENIUM_URL` | хаб Grid; legacy alias `KDT_SELENOID_URL` |
| `KDT_SELENIUM_VIDEO` | `0` — без записи sidecar |
| `KDT_LIVE` / `KDT_LIVE_PORT` | монитор вкл/порт (default `8767`); `0` — без HTTP |
| `KDT_PROXY_HOST_FROM_CONTAINER` | подмена loopback прокси для remote WD |

## 4. Live: idle vs work

1. **Work** — прогон с `KDT_LIVE≠0`: runner пишет diary/meta; конец прогона **не** гасит HTTP.
2. **Idle** — `run_live_idle.py`: long-lived оболочка; порт занят → soft-bind (NDJSON на диск, процесс жив).
3. Чёрный iframe — норма при headless / нет сессии / idle без браузера.
4. Два вида UI (рабочая сцена / наблюдатель) — lab UX, не SLA/SOC.
5. `debug_mode` → пауза в Live + admission **VOID** ([`admission.md`](admission.md)).
6. Session lane (lab): storage → fuzz Bearer / diary clues — EVIDENCE acceptance 25; не multi-tenant SSO.
7. Artifacts API: soft `legal_hold` + purge refuse — [`nav-check.md`](nav-check.md); не WORM.

## 5. Обязательность компонентов

| Компонент | Без него |
|---|---|
| ZAP + WebDriver | Нет прогона UI/DAST-контура |
| Grid | Можно `local` WD |
| Live | Можно `KDT_LIVE=0` |
| Allure / Dojo | Опциональны; `KDT_REQUIRE_*=1` делает fail-closed |

## 6. Честные границы

- Live lab без auth на порту — не публиковать наружу.
- Grid UI ≠ смотреть сценарий; video-файл ≠ noVNC.
- Секреты в Live NDJSON маскируются частично — не светить пароли в `ЛогАтаки`.
- Selenoid / docker.sock в ферме — **снято**; не воскрешать.
