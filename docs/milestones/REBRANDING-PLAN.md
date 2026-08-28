# Rebranding Plan: scanner-kdt / KDT → prettyk

> **Дата:** 21 августа 2026
> **Режим:** Keeper → GPT/Gemini review перед спуском DeepSeek
> **Цель:** убрать KDT и лишнюю scanner-специфику из продуктового naming, оставить OWASP scanner честно обозначенным как внутренний DAST-движок
>
> **Статус после ревью:** plan-only. До утверждения контрактов массовые замены не выполнять.

---

## Тезисы Максима

1. **scanner** — просто движок сканирования (spider + passive scan wait). В naming и логах он не нужен. Анбрендить.

2. **KDT** — устарел. prettyk = DSL. В смысловой нагрузке не нужен.

3. **Terminology target:** сканер / движок анализа уязвимостей. Не дрочить на спецификацию тула.

---

## Инвентаризация

| Категория | Кол-во | Глубина |
|---|---|---|
| CSS-переменные `--kdt-*` | ~40 | HIGH — вся тема |
| CSS-селекторы `.kdt-*` | ~200 | HIGH — весь UI |
| `localStorage` ключи `kdt.*` | ~12 | MEDIUM — нужна миграция |
| Env vars `KDT_*` | ~80+ | HIGH — ломает CI/CD |
| MethodId wire `scanner\|*` | ~95 методов | HIGH — ломает сценарии |
| Python файлы/классы `scanner_*` | ~40 | HIGH — импорты |
| Allure категории | 3 | LOW — косметика |
| Docker имена (`kdt-net` и т.д.) | ~10 | MEDIUM |
| SonarQube project keys | 2 (`scanner-kdt-*`) | LOW |
| CORS header `X-KDT-User` | 1 | LOW |
| README / docs / rules | ~30 файлов | LOW |

---

## Варианты naming: на утверждение

### CSS/env/storage префикс

| Что сейчас | Вариант A: короткий | Вариант B: полный |
|---|---|---|
| `--kdt-accent` | `--pk-accent` | `--prettyk-accent` |
| `.kdt-header` | `.pk-header` | `.prettyk-header` |
| `KDT_LIVE` | `PK_LIVE` | `PRETTYK_LIVE` |
| `kdt.checks.v1` | `pk.checks.v1` | `prettyk.checks.v1` |

**Предварительная рекомендация:** для нового публичного пространства — `prettyk-*` / `PRETTYK_*`. Короткий `pk-*` удобнее для CSS, но слишком легко спутать с произвольным package key, private key или product fork. Решение должно быть единым для CSS, storage и env, но это не означает, что внутренние wire-идентификаторы обязаны получить тот же префикс.

### scanner wire component в MethodId

| Что сейчас | Вариант A: dast | Вариант B: scanner |
|---|---|---|
| `scanner\|spider_scan` | `dast\|spider` | `scanner\|spider` |
| `scanner\|active_scan` | `dast\|active` | `scanner\|active` |
| `scanner\|passive_scan_wait` | `dast\|passive_wait` | `scanner\|passive_wait` |
| `scanner\|generate_report` | `dast\|report` | `scanner\|report` |

**Ревью:** `dast` точен для spider/active/passive scan, но слишком узок для всех текущих операций: contexts, replacer rules, scripts, OAST, automation plans, reports и raw requests. `scanner` лучше подходит как продуктовая категория. При этом `static-scanner` здесь неверен: OWASP scanner выполняет dynamic analysis.

**Предварительная рекомендация:** публично использовать `Scanner` / «сканер» / «движок анализа уязвимостей». Не переименовывать wire component автоматически только ради текста. Если wire-контракт всё-таки меняется, выбрать `scanner`, а не `dast`, и выпустить явный compatibility layer.

### Python файлы/классы

| Сейчас | Новое |
|---|---|
| `scanner_adapter.py` / `scannerAdapter` | публично: scanner adapter; физическое имя можно оставить до отдельного миграционного пакета |
| `scanner_work_stream.py` / `scannerWorkStream` | публично: scan work stream; rename файла отдельно |
| `scanner_report_summary.py` | публично: scanner report summary; rename файла отдельно |
| `scanner_context.py` | публично: scan context; rename файла отдельно |
| `scannerApiError` | публично: scanner API error; rename класса только вместе с импортами и тестами |

**Принцип:** de-branding пользовательского слоя не требует немедленного сокрытия конкретного backend-адаптера. `scanner_adapter.py` может честно остаться техническим названием реализации OWASP scanner; иначе мы получаем большой diff без продуктовой пользы.

### Инфраструктура

| Сейчас | Новое |
|---|---|
| `kdt-net` (Docker network) | `prettyk-net` |
| `kdt-editor-api` (systemd) | `prettyk-editor-api` |
| `docker-compose.scanner.yml` | `docker-compose.scanner.yml` (только если файл входит в репозиторий) |
| `docker-compose.scanner-webswing.yml` | `docker-compose.scanner-webswing.yml` (только если файл входит в репозиторий) |
| `reports/scanner-results` | `reports/scanner-results` |
| `kdt-api-lab` | `prettyk-api-lab` |
| Sonar: `scanner-kdt-backend` | `prettyk-backend` |

### Метки в UI/Allure

| Сейчас | Новое |
|---|---|
| «scanner демон» в продуктовых доках | «сканер» или «движок анализа» |
| «scanner Webswing» в UI-тексте | «Scanner Webswing»; URL `/scanner` не менять |
| Allure feature: `"scanner + Selenium"` | `"Scanner + Selenium"` или `"Dynamic analysis + Selenium"` |
| Allure category: `"scanner / security"` | `"Scanner / security"` |

---

## Что НЕ трогаем

- **scanner API URL**: `https://scanner/JSON/...` в `scanner_adapter.py` — это Docker DNS имя контейнера OWASP scanner, не наш брендинг.
- **Webswing `/scanner` путь**: `http://127.0.0.1:8082/scanner` — это путь Webswing-приложения, не наш.
- **Название OWASP scanner в attribution**: «на базе OWASP scanner» остаётся в README/доках, это честно.
- **Исторические документы**: старые названия в `sanctuary/history/`, acceptance evidence и release snapshots не переписывать механически. При необходимости добавить пояснение о новом имени.
- **Внутренние source names**: `scanner_adapter.py`, Docker DNS `scanner` и `scanner` в API URL не являются автоматически продуктовым брендингом.

---

## Обратная совместимость сценариев

Сценарии пользователей с `scanner|spider_scan` не должны ломаться без отдельного решения о breaking change.

В `method_id.py`:

```python
# Концептуально: старые wire-значения должны разрешаться в новый target.
# Реализацию нельзя копировать буквально до проверки resolver/export contract.
# _SCANNER_ALIAS_MAP = {old_wire: new_wire for old_wire, new_wire in ...}
# Пользователь пишет `scanner|spider_scan` — работает.
# Новые сценарии используют новый канон только после миграции SoT.
# Через N месяцев алиасы можно убрать.
```

**Критическое замечание:** в текущем коде `scanner` — не отдельный простой alias-словарь. Он участвует в `_STEP_DESCRIPTORS`, `_CATEGORY_LABELS`, `_METHOD_ID`, `_FACADE_scanner`, resolver/parser, controller adapter registry, diary/hooks, finding source и generated `cosmo/src/generated/method_ids.json`. Поэтому алиасы должны быть проверяемым слоем на границе загрузки/экспорта, а не только `str.replace()` в `method_id.py`.

---

## Три волны исполнения

### Волна 1: контракт и словарь (обязательно до замен)

Сначала зафиксировать таблицу `old → new → scope → compatibility → owner`. Не менять одновременно display text, wire ID, env API, storage API и filenames. Для каждого пункта определить, является ли он:

- публичным термином;
- внутренним runtime-ключом;
- persisted data / storage key;
- внешним deployment-контрактом;
- историческим свидетельством.

Стоп-гейты перед исполнением:

- подтвердить canonical namespace: `pk` или `prettyk`;
- подтвердить canonical env prefix и policy: hard cut или период чтения legacy env;
- подтвердить wire namespace: оставить `scanner` внутри или добавить новый `scanner`;
- подтвердить, входит ли infrastructure directory `services/` в этот repo. Сейчас `D:\prettyk-dev\services` отсутствует, поэтому compose/service renames нельзя считать выполненной задачей этого дерева;
- определить SoT и regenerated artifacts для wired/method catalog.

### Волна 2: KDT → prettyk (по контрактным пакетам, не blind search-replace)

| Файлы | Что |
|---|---|
| `cosmo/src/**/*.tsx`, `*.ts`, `*.css`, E2E selectors | выбранный namespace для CSS классов + переменных; затем typecheck/build и smoke |
| все storage/cookie keys | новый namespace + явная versioned migration; не менять cookie/header без проверки Live contract |
| `orchestrator/**/*.py`, scripts, CI, operator docs | новый env namespace; legacy read policy и deprecation matrix обязательны |
| `*.ps1`, `*.yml`, `*.yaml` | `kdt-net` → `prettyk-net`, `kdt-api-lab` → `prettyk-api-lab` |
| `.opencode/rules/*.mdc` | вычистить `scanner-kdt`, `KDT`, старые ссылки |
| `AGENTS.md`, `README.md`, `sonar-project.*.properties` | `kdt` → `prettyk`, `scanner-kdt` → `prettyk` |
| `sonar-access.md`, `vps-access.md` | обновить |
| `cosmo/package.json` и lockfile | `kdt-wired-editor` → утверждённое имя package; только после решения scope |

**Почему это не safe search-replace:** `KDT_*` — внешние переменные запуска, `kdt.*` — persisted state, CSS-классы используются E2E, а `X-KDT-User` участвует в Live ACL. Каждое из них требует отдельного smoke/compatibility check.

### Волна 3: публичный scanner vocabulary (без обязательного физического rename)

| Файлы | Что |
|---|---|
| `orchestrator/core/method_id.py` | display category/title → `Scanner`; wire component менять только отдельным RFC |
| `orchestrator/utils/reporter.py` | Allure feature/category метки |
| `orchestrator/utils/allure_report_meta.py` | Allure category regex |
| `orchestrator/wired_runner.py` | feature и attachment labels → scanner vocabulary; runner помечен DEAD, не расширять его роль |
| `orchestrator/adapters/scanner_adapter.py` и `scanner_*` helpers | rename только если принято решение о physical source rename |
| `orchestrator/core/controller.py` | registry key менять только вместе с resolver, hooks, findings и tests |
| `orchestrator/tests/test_scanner_*.py` | переименовывать только вместе с физическим source rename; имя теста не является целью |
| `orchestrator/tests/**/*.py` | обновлять моки и imports только при изменении контракта |
| `orchestrator/tools/*.ps1` | нейтральные display names; infrastructure paths только при наличии файлов |

**Исправление к исходному плану:** пока не принято решение о wire compatibility, тесты и модули не надо массово переименовывать. Название теста не является ценностью само по себе.

### Волна 4: инфраструктура и deployment contracts

Только после отдельного inventory внешних потребителей:

- Docker DNS/service names;
- compose filenames и volumes;
- systemd unit names;
- Apache/nginx paths;
- Sonar project keys;
- CI secrets/env;
- existing reports and artifact paths.

Если `services/` сознательно не входит в `prettyk-dev`, этот пакет выполняется в отдельном ops-repository или остаётся документированным migration backlog, но не маскируется как выполненная code change.

### Волна 5: доки и хвосты

| Файлы | Что |
|---|---|
| `docs/*.md` | вычистить устаревшие KDT/scanner упоминания |
| `sanctuary/**` | обновить путь `sanctuary/canon/custom/cosmo/cbr-specific` → `sanctuary/custom/cosmo/cbr-specific` |
| `cosmo/docs/` | ledger, tocompose (PAL-доки — возможно, выпилить) |
| Правила `.opencode/rules/` | ссылки на старые пути, имена |

Для документов применить классификацию: current canonical docs обновлять, history/release evidence сохранять, dead/WIP material удалять только после отдельной проверки.

---

## Приёмка каждой волны

### KDT namespace

- `npm run typecheck`;
- `npm run build`;
- точечные Vitest для storage/theme/editor;
- Playwright smoke с обновлёнными selectors;
- Live ACL smoke для user header/cookie/token;
- запуск с новым env namespace и проверка выбранной legacy policy.

### Scanner vocabulary

- `python orchestrator/tools/export_method_ids.py --check`;
- точечные tests для `resolve_call`, facade lookup, parser, controller dispatch, diary/hooks, findings и gate;
- проверка, что старый report metadata читается;
- проверка, что новый report не содержит scanner как продуктовой категории, если это утверждено;
- smoke spider/passive wait/active scan на lab stand.

### Infrastructure

- compose config validation;
- clean start на канонической сети;
- один daemon и один Webswing, без duplicate port owners;
- artifact/report paths доступны после rename;
- только затем обновлять operator runbooks.

---

## Что на утверждение

1. **CSS/env/storage префикс:** `pk` или `prettyk`? Предварительно: `prettyk` для env/storage, CSS решать отдельно.
2. **Публичная категория сканирования:** `Scanner` / «сканер»? `DAST` оставить техническим описанием.
3. **MethodId wire:** оставить `scanner` как implementation wire или вводить `scanner` с versioned compatibility layer?
4. **Обратная совместимость:** читать старые `scanner|*` и `KDT_*` на переходный период или делать hard cut?
5. **Infrastructure boundary:** где живут compose/systemd/VPS contracts, если `services/` исключён из нового repo?
6. **Порядок:** Wave 1 contract map → namespace migration → public vocabulary → infra → docs.
7. **PAL-доки** (`cosmo/docs/source/tocompose/*.md`) — старые Cosmo-заметки. Архивируем, обновляем или удаляем после отдельного решения?

---

## Ревью Luna/GPT: итог

### Findings

1. **P0 — wire rename нельзя выполнять как search-replace.** `scanner` является component в method catalog, resolver, controller registry, diary/hooks, findings и generated frontend catalog. Простого `_scanner_ALIAS_MAP` недостаточно.
2. **P0 — env rename является внешним контрактом.** Массовая замена `KDT_*` ломает CI, operator scripts, stand и deployment. Нужны prefix decision, compatibility policy и owner каждой переменной.
3. **P1 — `dast` не покрывает весь facade.** Contexts, scripts, replacer, OAST, reports и raw requests шире, чем собственно DAST scan. Для пользовательской семантики предпочтительнее `Scanner`; DAST оставить как технический тип анализа.
4. **P1 — services boundary не совпадает с планом.** В `D:\prettyk-dev` нет `services/`, поэтому compose/systemd rename нельзя планировать как обычный repo refactor.
5. **P1 — исторические документы нельзя переписывать механически.** History и acceptance evidence должны сохранять фактические старые названия.
6. **P1 — в исходном списке пропущен frontend package identity.** `cosmo/package.json` всё ещё называется `kdt-wired-editor`; это отдельный package/lockfile contract.

### Решение до кода

До получения ответов на вопросы выше выполнять только inventory, contract map и точечные проверки. Не переименовывать одновременно CSS, env, storage, MethodId, adapter modules и infrastructure identifiers.
