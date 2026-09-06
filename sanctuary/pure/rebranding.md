# Rebranding: KDT / scanner-kdt → PrettyK

> **CANON** — hub topic. Slice: **22 августа 2026** (2FA sealed: рейнеминг выполнен, zero regressions, канонизировано в pure).

---

## Исход

`scanner-kdt` — имя старого репозитория и рабочее название фреймворка. KDT (Key-Driven Testing) устарел; scanner в имени создавал ложное впечатление, что продукт — обёртка над OWASP scanner.

**Решение (2FA: 21 авг 2026):** новый канон `prettyk-io/prettyk-dev`. Продукт — **PrettyK** (DSL + SecOps-платформа).

---

## Нейминг: канон

| Слой | До | После |
|---|---|---|
| **Продукт** | KDT Framework | **PrettyK** |
| **DSL** | KDT (Key-Driven Testing) | **PrettyK** (DSL) |
| **Репозиторий** | `failed1/scanner-kdt` | **`prettyk-io/prettyk-secops`** (до 01.09.2026 `prettyk-dev`) |
| **Cosmoport 2.0** | — | **`prettyk-io/prettyk-control-plane`** (отдельная кодовая база, `D:\prettyk-control-plane`) |
| **Организация** | — | **`github.com/prettyk-io`** |
| **Package FE** | `kdt-wired-editor` | **`prettyk-editor`** |
| **Сканер** (публично) | scanner демон, scanner Webswing | **сканер, Scanner Webswing** |
| **Сканер** (Allure) | `scanner / security`, `scanner + Selenium` | **`Scanner / security`**, **`Scanner + Selenium`** |
| **Монитор** | KDT Live | **PrettyK Live** |
| **MethodId display** | `"scanner"` (category) | **`"Сканер"`** |

---

## Что осталось от старого

| Слой | Что | Почему |
|---|---|---|
| **Wire component** | `"scanner"` | Честное internal имя адаптера OWASP scanner. Переименование — отдельный RFC с compatibility layer. |
| **Файл адаптера** | `scanner_adapter.py` / `scannerAdapter` | Конкретная реализация OWASP scanner. Не прячем. |
| **Docker DNS** | `https://scanner/JSON/...` | Имя контейнера OWASP scanner, не наш брендинг. |
| **Webswing URL** | `/scanner` | Путь Webswing-приложения, не наш. |
| **Attribution** | «на базе OWASP scanner» | Честно указываем в README/доках. |
| **History docs** | `sanctuary/history/`, acceptance evidence | Не переписываем механически — это фактические старые названия. |
| **User scenarios** | `scanner\|spider_scan` | Сценарии пользователей не ломаются. `"scanner"` алиасится на `"Сканер"` в facade. |

---

## Технические замены

### Frontend (60+ файлов)

| До | После |
|---|---|
| `--kdt-*` / `.kdt-*` | `--pk-*` / `.pk-*` |
| `kdt.*` (localStorage) | `pk.*` |
| `KdtTokenPack`, `KdtSelectWidget`, ... | `PkTokenPack`, `PkSelectWidget`, ... |
| `kdtRuIntl.ts` | `pkRuIntl.ts` |
| `kdt://` (URI scheme) | `pk://` (regex backward-compat) |
| `delimiter.kdt` (Monaco) | `delimiter.pk` |

### Backend env (41 файл)

Добавлен **dual-read helper** `orchestrator/utils/env_dual.py`:

```python
pk_env("LIVE")  # PK_LIVE || PK_LIVE
pk_env_flag("ALLURE_WAIT")  # bool
pk_env_int("ELEMENT_TIMEOUT")  # int
```

Приоритет: `PK_*` → fallback `KDT_*`. Обратная совместимость: старые `KDT_*` переменные продолжают работать.

Вспомогательные `_env()` в `gate_policy.py`, `gate_policy_load.py`, `defectdojo_client.py` также получили dual-read.

### MethodId (display only)

Wire `"scanner"` не тронут. Обновлены display-слои:

- `_STEP_DESCRIPTORS` — category `"scanner"` → `"Сканер"`
- `_CATEGORY_LABELS` — `"scanner": "Сканер"`
- `_FACADES` — ключ `"scanner"` → `"Сканер"`; `"scanner"` добавлен как алиас в `_FACADE_ALIASES`

### Allure

- `allure_report_meta.py`: executor name `"KDT"` → `"PrettyK"`, category `"scanner / security"` → `"Scanner / security"`
- `wired_runner.py`: feature `"scanner + Selenium"` → `"Scanner + Selenium"`, attachment `"scanner Alerts"` → `"Scanner Alerts"`

### Инфраструктура и мета

| До | После |
|---|---|
| `kdt-net` | `prettyk-net` |
| `kdt-api-lab` | `prettyk-api-lab` |
| `kdt-editor-api` | `prettyk-editor-api` |
| `reports/scanner-results` | `reports/scanner-results` |
| Sonar: `scanner-kdt-backend` | `prettyk-backend` |
| Sonar: `scanner-kdt-frontend` | `prettyk-frontend` |
| `KDTzaproxy.md` | `prettyk.md` |
| `docker-compose.scanner.yml` (ref) | `docker-compose.scanner.yml` (ref) |

---

## Результаты

| Волна | Файлов | Тесты |
|---|---|---|
| Frontend CSS/storage | 60+ | typecheck ✓, Vitest 177/178 |
| Backend env dual-read | 41 | 52/52 |
| MethodId vocabulary | 5 | 55/55 |
| Docs/infra/tails | 40+ | 72/72 |

**Zero regressions.** Wire `scanner` не тронут — сценарии пользователей не ломаются.

---

## Стены

- Исторические документы (`sanctuary/history/`, acceptance evidence) не переписывать механически.
- `services/` не входит в `prettyk-secops` — compose/service renames там отдельно.
- `friend-requests/`, `backlog.md` — рабочие/архивные документы, оставлены без изменений.
- `cosmo/docs/source/tocompose/` (PAL-доки) — архив Cosmo, не трогать без отдельного решения.