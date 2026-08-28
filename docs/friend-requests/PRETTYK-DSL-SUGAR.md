# Friend Request: PRETTYK-DSL-SUGAR — Сахар, смарт-локаторы, управляющие конструкции

> **Статус:** `ready` (контракт утверждён Максимом · 28 авг 2026)
> **Гриф:** ЖИР. Ядро продукта — сердце PrettyK DSL.
> **Авторы:** Keeper, Максим, Dev
> **Дата:** 27 августа 2026 (финализировано 28 авг 2026)
> **Контекст:** Playwright стал runtime будущего. Босс полез в бек и начал `playwright_adapter.py`, но без контракта. Мы с Максимом провели полный product/UX раунд и спроектировали: (1) что должно быть в ядре, (2) какие гейты за что отвечают, (3) какой синтаксический сахар нужен, (4) как не раздуть адаптер до копии Selenium. После финального раунда (28 авг) утверждён полный контракт: короткие глаголы, DUEL-токены RU/EN для управляющих конструкций, символьные модификаторы как канон.

Спецификация: [`docs/research/2026-08-27-pretty-browser-contract-methodid-gates.md`](../research/2026-08-27-pretty-browser-contract-methodid-gates.md).

---

## 1. Тезис

**PrettyK DSL получает сердце.** Короткие глаголы, умные локаторы без префиксов, потоковые pipe'ы и failsafe-модификаторы. Playwright становится единым runtime, Selenium остаётся fallback до parity. Чистка CDP-мусора, allowlist-валидация, строгий gate ownership. Один контракт → два runtime → ноль дублирования.

```text
                          PrettyK DSL (Сердце)
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
    Root UI (Клик,        Сессия (Куки,         Сканер (ZAP,
    Вставить, Ждать)      Storage, Заголовки)    Spider, Active Scan)

    Locator Strategies × 11:
    text · exact · label · placeholder · test_id
    name · id/# · class/. · [attr*=] · role · xpath//
```

**Не делаем:**
- `PlaywrightAdapter` = клон `WebDriverAdapter` на 150 методов.
- `Сессия Нажать` и `Сессия ВставитьЗначение` — дубликаты root UI.
- CDP как основной Pretty-язык: один escape hatch, остальное Playwright-native.
- Reflection `dir()` blacklist в registry — только allowlist `PrettyMethodSpec`.
- Кринж 1С-стиля (`Попробовать / Перехватить / ВКонце`, «Для каждого»).

---

## 2. Gate Ownership Matrix

Каждый гейт владеет строго своим доменом:

| Гейт | Ответственность | Runtime | Примеры |
|---|---|---|---|
| **Root UI** | Клики, ввод, навигация, ожидания, скриншоты | `PlaywrightAdapter` | `Клик Войти`, `Вставить Логин admin` |
| **Assert** | Pass/fail verdict и evidence | `PlaywrightAdapter` + `Inspector` | `ПроверитьURL /dashboard`, `ПроверитьТекст "Успешно"` |
| **Сессия** | Cookies, storage state, заголовки, гео, эмуляция | `PlaywrightAdapter` context | `ОчиститьКуки`, `УстановитьКуки session abc` |
| **Сканер** | Spider, Active Scan, OpenAPI, Auth | `ZapAdapter` | `Сканер АктивноеСканирование` |
| **HTTP** | Raw API, REST/GraphQL seed | `HttpAdapter` | `HTTP GET /api/status` |
| **Драйвер** | Advanced/Legacy: frames, alerts, raw JS | `PlaywrightAdapter` low-level | `Драйвер ВыполнитьJS "..."` |

---

## 3. Pareto P0 — 80% ценности

25 операций, закрывающих типичный DAST/UI smoke:

```text
Открыть, ОбновитьСтраницу, Вернуться
Клик, Вставить, Дописать, Очистить
Текст, Значение, Атрибут
Ждать, ЖдатьИсчезновения, ЖдатьТекст, ЖдатьURL, ЖдатьЗаголовок, ЖдатьЗагрузкуСтраницы, ЖдатьПростойСети
ПроверитьЗаголовок, ПроверитьURL, ПроверитьНаличие, ПроверитьВидимость, ПроверитьНевидимость, ПроверитьТекст, ПроверитьРавенство, ПроверитьВхождение
ВыбратьПоТексту, ВыбратьПоЗначению, ЗагрузитьФайл
ОчиститьКуки, УстановитьКуки, ПолучитьКуки
Скрин, СкринЭлемента, Метка
```

---

## 4. Матрица локаторов — 11 стратегий

| Стратегия | Ключевое слово | Пример | Playwright API |
|---|---|---|---|
| Умный текст (contains, default) | без префикса / `text` | `Клик "Войти"` | `get_by_text(..., exact=False)` |
| Точный текст | `exact` | `Клик exact "Войти"` | `get_by_text(..., exact=True)` |
| Лейбл формы | `label` | `Вставить label "Логин" admin` | `get_by_label(...)` |
| Плейсхолдер | `placeholder` | `Вставить placeholder "Email" a@b.c` | `get_by_placeholder(...)` |
| Test-ID / QA-ID | `test_id` / `qa` | `Клик test_id submit-btn` | `get_by_test_id(...)` |
| Атрибут name | `name` | `Вставить name csrf_token $t` | `locator('[name=...]')` |
| ID | `id` / `#` | `Клик #btn-login` | `locator('#...')` |
| CSS класс | `class` / `.` | `Клик .btn-primary` | `locator('.btn-primary')` |
| Подстрока атрибута | `[attr*=]` | `Клик "[href*='logout']"` | `locator('[href*=...]')` |
| ARIA роль | `role` | `Клик role button "Войти"` | `get_by_role(...)` |
| XPath | `xpath` / `//` | `Клик "//form//button[1]"` | `locator('xpath=...')` |

### Smart Selector Inference (каскадный auto-detect):

1. `//` или `xpath=` → XPath
2. `#` → ID
3. `.` + валидный CSS-класс → CSS Class
4. `[attr=...]`, `>`, `:`, `+` → CSS Selector
5. Иначе → каскад: `get_by_role` → `get_by_label` → `get_by_test_id` → `[name=]` → `get_by_placeholder` → `get_by_text`

---

## 5. Синтаксический контракт — утверждённый канон

### А. Короткие глаголы действий — ОСНОВНОЙ КАНОН

Действия оператора пишутся короткими хлёсткими глаголами. Длинные legacy-формы остаются в парсере как тихие алиасы для обратной совместимости, но в Monaco, автодополнении и документации используются только короткие.

| Канонический сахар | Пример | Legacy (тихий алиас) |
|---|---|---|
| `Клик` | `Клик Войти` | `Нажать` |
| `Вставить` | `Вставить placeholder "Email" admin@pk.io` | `ВставитьЗначение` |
| `Дописать` | `Дописать ".note" приписка` | `ДописатьТекст` |
| `Очистить` | `Очистить "#search"` | `ОчиститьЗначение` |
| `Текст` | `Текст ".balance" -> $bal` | `ПолучитьТекст` |
| `Значение` | `Значение "#token" -> $jwt` | `ПолучитьЗначение` |
| `Атрибут` | `Атрибут "href" "#link" -> $url` | `ПолучитьАтрибут` |
| `Ждать` | `Ждать ".dashboard"` | `ЖдатьЭлемент` |
| `Скрин` | `Скрин auth_success.png` | `Скриншот` |

### Б. Кавычки — только для пробелов

```text
Клик Войти                          # ок
Вставить Логин admin                # ок
Вставить "Электронная почта" admin  # нужно: пробел в лейбле
```

### В. Стрелочные модификаторы — ЖЕЛЕЗОБЕТОННЫЙ КАНОН

| Символ | Назначение | Пример |
|---|---|---|
| `-> $var` | Data Capture Pipe | `Текст ".jwt" -> $token` |
| `>?` | Failsafe (мягкий пропуск) | `Клик "Принять cookies" >?` |
| `>!` | Recovery (при ошибке — выполнить recover-блок) | `Клик .btn >! { Клик .fallback }` |
| `>@` | Recover + retry (primary fail → recover ×1 → retry primary ×1 → fail) | `Клик #submit >@ { Клик .retry-btn }` |
| `>#hint` | Self-healing anchor | `Клик css ".btn-v2" >#КнопкаВхода` |
| `>>` | Scope drilldown | `Внутри "#modal" >> Клик "OK"` |
| `<!>` | Scenario-level failsafe (не шаг, а мета-модификатор сценария) | Объявляется в шапке |

### Г. Обработка ошибок — try / catch / finally

Только английские ключевые слова. Никаких «Попробовать / Перехватить / ВКонце». Никаких русских алиасов.

Символьные формы на уровне шага — `? > >!` — дополняют `try/catch/finally` для лёгких случаев:

```text
# Блочный try/catch (структурный control flow в Monaco):
try
    Клик "Удалить аккаунт"
    Клик "Подтвердить"
catch
    Скрин delete_failed.png
finally
    Клик "Назад"

# Лёгкий failsafe на шаг (когда не нужен целый блок):
Клик "Принять cookies" >?
```

| Форма | Назначение | Где живёт |
|---|---|---|
| `try / catch / finally` | Структурный блок обработки исключений | Monaco DSL (control flow AST) |
| `>?` (на шаге) | Мягкий пропуск: ошибка → SKIPPED/SOFT, сценарий продолжается | Модификатор шага |
| `>!` (на шаге) | Recovery: ошибка на primary → выполнить recover-блок | Модификатор шага |
| `<!>` (на сценарии) | Сценарный failsafe | Мета-модификатор |
| `?` (в блоке try) | Guard condition внутри try-блока | Control flow AST |

### Д. Управляющие конструкции — DUEL-токены RU/EN

Каждая конструкция имеет два полных синонима (русский и английский), которые компилируются в один и тот же AST-узел. Оператор пишет так, как ему удобно. Никакого дублирования рантайма.

#### Циклы

| Русский | Английский | Пример |
|---|---|---|
| `Для каждого $x в $list` | `foreach $x in $list` / `each $x in $list` | `Для каждого $user в $users ...` |
| `Пока $cond` | `while $cond` | `Пока $status != "ready" ...` |
| `Повторить N раз` | `repeat N` | `Повторить 3 раза ...` |

#### Условия

| Русский | Английский | Пример |
|---|---|---|
| `Если $cond` | `if $cond` | `Если $role == "admin" ...` |
| `Иначе` | `else` | `Иначе ...` |

#### Переменные и секреты

| Русский | Английский | Пример |
|---|---|---|
| `Пусть $name = "admin"` | `let $name = "admin"` | `Пусть $token = "xyz"` |
| `Секрет $pass = "123"` | `secret $pass = "123"` | `Секрет $api_key = env("API_KEY")` |

**Правило:** все RU/EN варианты — точные синонимы в лексере, один AST-узел, один рантайм.

### Е. Чистка CDP

750 строк `browser_adapter.py` → вырезается всё, что имеет Playwright-native эквивалент. Остаётся один escape hatch `Сессия Команда <Domain.method> <JSON>`.

---

## 6. Эталонный сценарий (Было → Стало)

```text
# ── Было (wire/Selenium) ─────────────────────────────────────────
webdriver|open|/auth/login
webdriver|send_keys|css|#input-email|admin@prettyk.io
webdriver|send_keys|css|#input-password|${PASS}
webdriver|click|css|.btn-login-primary
webdriver|wait_for_element|css|.user-dashboard|15
webdriver|get_text|css|.account-balance
data|let|balance|${LAST_RESULT}
webdriver|take_screenshot|dashboard.png

# ── Стало (PrettyK DSL) ───────────────────────────────────────────
Открыть /auth/login

Вставить placeholder "Email" admin@prettyk.io
Вставить "Пароль" $PASS
Клик Войти

Ждать ".user-dashboard"
Текст ".account-balance" -> $balance
Скрин dashboard.png

Клик "Оценить приложение" >?
ПроверитьТекст "Добро пожаловать"
```

---

## 7. Что Playwright даёт Friends Discovery

| Возможность | Было (Selenium/CDP adapter) | Стало (Playwright) |
|---|---|---|
| Smart locator | `send_keys\|css\|#input-email` | `Вставить placeholder "Email"` |
| Text contains | `click\|contains_text\|Авториз` | `Клик "Войти"` (exact=False default) |
| Test-ID | Не поддерживалось | `Клик test_id login-submit` |
| Role + Name | Не поддерживалось | `Клик role button "Сохранить"` |
| Attribute contains | `[href*='logout']` (было) | `[href*='logout']` (осталось) |
| Data pipe | `Пусть $x = ${LAST_RESULT}` | `Текст ".jwt" -> $token` (атомарно) |
| Failsafe | `>?` (частично) | `>?` (канонизирован) |
| Self-healing anchor | Не было | `>#КнопкаВхода` |
| CDP мусор | 750 строк `browser_adapter.py` | Вырезан, один escape hatch |

---

## 8. Что вырезано нахрен и почему

| Вырезанная конструкция | Причина |
|---|---|
| `Попробовать / Перехватить / ВКонце` | 1С-кринж. Ни один SecOps/QA инженер не будет это писать. Заменено на `try / catch / finally` + символьные формы. |
| Длинные глаголы как primary (`Нажать`, `ВставитьЗначение`, `ЖдатьЭлемент`, `ПолучитьТекст`) | Только как тихие legacy-алиасы в парсере. Основной канон — короткие `Клик / Вставить / Ждать / Текст / Скрин`. |
| Русские алиасы для `try/catch/finally` | Не предусмотрены. Только английские ключевые слова + символы. |

---

## 9. План реализации

| Фаза | Содержание | Исполнители |
|---|---|---|
| **Phase A — Contract Freeze** ✅ | Утверждение спецификации Максимом (28 авг 2026). | Keeper + Dev → Максим |
| **Phase B — P0 Backend Parity** | `PlaywrightAdapter` реализует P0, smart locator engine, sugar-парсер, DUEL-токены RU/EN, allowlist registry. | Boss |
| **Phase C — Monaco Sugar UI** | Подсветка коротких глаголов, автодополнение RU/EN, LED gutter, hover preview, pipe-синтаксис. | Flash |
| **Phase D — Parity Tests** | Сквозной parity test: один wired → Selenium + Playwright. | Boss |
| **Phase E — Cleanup** | Выпиливание CDP-мусора из `BrowserAdapter`, замена reflection на allowlist. | Boss |
| **Phase F — Cutover** | Playwright default, Selenium Grid из default compose. | Boss + Buddy |

---

## 10. Метрики успеха

- [ ] P0 сценарий (25 операций) выполняется на Playwright и Selenium с идентичным verdict.
- [ ] Smart locator резолвит 90%+ элементов без явной стратегии.
- [ ] Короткий глагол `Клик Войти` разрешается в канонический wire без ошибки.
- [ ] DUEL-токены `Для каждого` ≡ `foreach` ≡ `each` → один AST.
- [ ] `try / catch / finally` + `? > >!` покрывают все сценарии обработки ошибок.
- [ ] «Попробовать / Перехватить / ВКонце» отсутствуют в лексере.
- [ ] `-> $var` атомарно сохраняет значение в DataStream.
- [ ] `>?` мягко пропускает отсутствующий элемент (жёлтый LED, не падение).
- [ ] `browser_adapter.py` сокращён с 750 до ≤200 строк.
- [ ] `wired_validate` проверяет allowlist, а не Selenium `dir()`.
- [ ] Monaco показывает короткие глаголы и RU/EN дуалы в автодополнении.