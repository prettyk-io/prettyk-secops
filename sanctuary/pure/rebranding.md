# Rebranding: KDT / zap-kdt → PrettyK

> **CANON** — hub topic. Slice: **22 августа 2026** (2FA sealed: рейнеминг выполнен, zero regressions, канонизировано в pure).

---

## Исход

`zap-kdt` — имя старого репозитория и рабочее название фреймворка. KDT (Key-Driven Testing) устарел; ZAP в имени создавал ложное впечатление, что продукт — обёртка над OWASP ZAP.

**Решение (2FA: 21 авг 2026):** новый канон `prettyk-io/prettyk-dev`. Продукт — **PrettyK** (DSL + SecOps-платформа).

---

## Нейминг: канон

| Слой | До | После |
|---|---|---|
| **Продукт** | KDT Framework | **PrettyK** |
| **DSL** | KDT (Key-Driven Testing) | **PrettyK** (DSL) |
| **Репозиторий** | `failed1/zap-kdt` | **`prettyk-io/prettyk-dev`** |
| **Организация** | — | **`github.com/prettyk-io`** |
| **Package FE** | `kdt-manifest-editor` | **`prettyk-editor`** |
| **Сканер** (публично) | ZAP демон, ZAP Webswing | **сканер, Scanner Webswing** |
| **Сканер** (Allure) | `ZAP / security`, `ZAP + Selenium` | **`Scanner / security`**, **`Scanner + Selenium`** |
| **Монитор** | KDT Live | **PrettyK Live** |
| **MethodId display** | `"ZAP"` (category) | **`"Сканер"`** |

---

## Что осталось от старого

| Слой | Что | Почему |
|---|---|---|
| **Wire component** | `"zap"` | Честное internal имя адаптера OWASP ZAP. Переименование — отдельный RFC с compatibility layer. |
| **Файл адаптера** | `zap_adapter.py` / `ZapAdapter` | Конкретная реализация OWASP ZAP. Не прячем. |
| **Docker DNS** | `https://zap/JSON/...` | Имя контейнера OWASP ZAP, не наш брендинг. |
| **Webswing URL** | `/zap` | Путь Webswing-приложения, не наш. |
| **Attribution** | «на базе OWASP ZAP» | Честно указываем в README/доках. |
| **History docs** | `sanctuary/history/`, acceptance evidence | Не переписываем механически — это фактические старые названия. |
| **User scenarios** | `zap\|spider_scan` | Сценарии пользователей не ломаются. `"ZAP"` алиасится на `"Сканер"` в facade. |

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
pk_env("LIVE")  # PK_LIVE || KDT_LIVE
pk_env_flag("ALLURE_WAIT")  # bool
pk_env_int("ELEMENT_TIMEOUT")  # int
```

Приоритет: `PK_*` → fallback `KDT_*`. Обратная совместимость: старые `KDT_*` переменные продолжают работать.

Вспомогательные `_env()` в `gate_policy.py`, `gate_policy_load.py`, `defectdojo_client.py` также получили dual-read.

### MethodId (display only)

Wire `"zap"` не тронут. Обновлены display-слои:

- `_STEP_DESCRIPTORS` — category `"ZAP"` → `"Сканер"`
- `_CATEGORY_LABELS` — `"zap": "Сканер"`
- `_FACADES` — ключ `"ZAP"` → `"Сканер"`; `"ZAP"` добавлен как алиас в `_FACADE_ALIASES`

### Allure

- `allure_report_meta.py`: executor name `"KDT"` → `"PrettyK"`, category `"ZAP / security"` → `"Scanner / security"`
- `wired_runner.py`: feature `"ZAP + Selenium"` → `"Scanner + Selenium"`, attachment `"ZAP Alerts"` → `"Scanner Alerts"`

### Инфраструктура и мета

| До | После |
|---|---|
| `kdt-net` | `prettyk-net` |
| `kdt-api-lab` | `prettyk-api-lab` |
| `kdt-editor-api` | `prettyk-editor-api` |
| `reports/zap-results` | `reports/scanner-results` |
| Sonar: `zap-kdt-backend` | `prettyk-backend` |
| Sonar: `zap-kdt-frontend` | `prettyk-frontend` |
| `KDTZaproxy.md` | `prettyk.md` |
| `docker-compose.zap.yml` (ref) | `docker-compose.scanner.yml` (ref) |

---

## Результаты

| Волна | Файлов | Тесты |
|---|---|---|
| Frontend CSS/storage | 60+ | typecheck ✓, Vitest 177/178 |
| Backend env dual-read | 41 | 52/52 |
| MethodId vocabulary | 5 | 55/55 |
| Docs/infra/tails | 40+ | 72/72 |

**Zero regressions.** Wire `zap` не тронут — сценарии пользователей не ломаются.

---

## Стены

- Исторические документы (`sanctuary/history/`, acceptance evidence) не переписывать механически.
- `services/` не входит в `prettyk-dev` — compose/service renames там отдельно.
- `friend-requests/`, `backlog.md` — рабочие/архивные документы, оставлены без изменений.
- `cosmo/docs/source/tocompose/` (PAL-доки) — архив Cosmo, не трогать без отдельного решения.