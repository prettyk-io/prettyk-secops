# Pretty Browser Contract: MethodId, gates, Playwright parity и Sugar DSL

> **Статус:** `evolve` — рабочий канонический концепт и контрактная спецификация.
> **Дата:** 27 августа 2026.
> **Назначение:** Полный архитектурный контракт Playwright runtime, матрица гейтов, стратегия селекторов и спецификация синтаксического сахара (Sugar DSL) для исполнения Boss (DeepSeek V4 Pro).
> **Связанные материалы:** [`browser-runtime-airgap.md`](2026-08-27-browser-runtime-airgap.md),
> `orchestrator/core/method_id.py`, `wired_validate.py`, `action_factory.py`,
> `adapters/playwright_adapter.py`, `adapters/webdriver_adapter.py`, `adapters/browser_adapter.py`.

---

## 1. Главный архитектурный инвариант

`PlaywrightAdapter` не должен быть слепым 150-строчным клоном `WebDriverAdapter` или `BrowserAdapter`.

Стабильным публичным контрактом PrettyK является **человекочитаемый русский DSL (Pretty MethodId)**. Гейты (`gate`) и `component|action` — это внутренний машинный слой диспетчеризации (Wire). Адаптеры (Playwright / Selenium) — взаимозаменяемые исполнители runtime-контракта.

```text
Pretty DSL (Человеческий сценарий)
    │   «Клик Войти», «Вставить Логин admin», «Вставить placeholder "Email" a@b.c»
    ▼
Smart Locator Normalizer & MethodId Parser
    │   Разрешение стратегий (role, label, test_id, name, css, xpath, text)
    ▼
Canonical Wire Action (Машинный вызов)
    │   webdriver|click|label|Войти
    │   webdriver|send_keys|name|login|admin
    ▼
Runtime Dispatcher (ActionFactory / Controller)
    ├── PlaywrightAdapter (Целевой Unified AirGap Runtime)
    └── WebDriverAdapter (Временный Fallback до полного Cutover)
```

Оператор и сценарий не знают, какой драйвер работает под капотом. Технологические кишки спрятаны внутри адаптеров.

---

## 2. Gate Ownership Matrix: Разделение сфер ответственности

Каждый гейт отвечает строго за свой домен. Дублирование действий между гейтами запрещено:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          PRETTYK SCENARIO                              │
└────────────────────────────────────────────────────────────────────────┘
        │
        ├── 1. ROOT UI (Первая стрелка: Клик, Открыть, Вставить, Скрин...)
        │      └── Runtime: PlaywrightAdapter.element_actions
        │
        ├── 2. ASSERT (Проверить*: URL, Текст, Заголовок, Наличие, Равенство)
        │      └── Runtime: PlaywrightAdapter.assertions + Inspector
        │
        ├── 3. СЕССИЯ (Cookies, StorageState, Заголовки, Гео, Эмуляция)
        │      └── Runtime: PlaywrightAdapter.context_state
        │
        ├── 4. СКАНЕР (Spider, AJAX Spider, Active Scan, OpenAPI, Auth)
        │      └── Runtime: ZapAdapter (ZAP Daemon API)
        │
        ├── 5. HTTP (Raw API, микросервисы, REST/GraphQL seed)
        │      └── Runtime: HttpAdapter (Requests / HTTPX)
        │
        └── 6. ДРАЙВЕР (Advanced / Legacy: Frames, Alerts, Raw JS)
               └── Runtime: PlaywrightAdapter.page_lowlevel
```

### Правила изоляции гейтов:
1. **`Сессия` не кликает:** операции взаимодействия с элементами живут только в Root UI (`Сессия Нажать` — ❌).
2. **`Сканер` не водит браузер сам:** трафик через ZAP генерируется Root UI действиями браузера через настроенный прокси (`host.docker.internal:8099`).
3. **`HTTP` не трогает DOM:** только прямые сетевые вызовы API.
4. **`Драйвер` — это только Advanced/Legacy:** фреймы, сырой JS, системные диалоги `alert/confirm`.

---

## 3. Pareto-аудит P0: Ядро DAST и UI-прогонов

Принцип Парето: **20% методов закрывают 80% всех боевых сценариев сканера**.

### 🟢 Канонический состав P0 (Обязательный паритет):

| Группа | MethodId (Длинные канонические) | Короткий синтаксический сахар | Wire Target |
|---|---|---|---|
| **Навигация** | `Открыть`<br>`ОткрытьПоURL`<br>`ОбновитьСтраницу`<br>`Вернуться` | `Открыть`<br>`ОткрытьПоURL`<br>`Обновить`<br>`Назад` | `webdriver\|open`<br>`webdriver\|open_by_url`<br>`webdriver\|refresh`<br>`webdriver\|back` |
| **Действия** | `Нажать`<br>`ВставитьЗначение`<br>`ДописатьТекст`<br>`ОчиститьЗначение`<br>`Навести` | `Клик`<br>`Вставить`<br>`Дописать`<br>`Очистить`<br>`Навести` | `webdriver\|click`<br>`webdriver\|send_keys`<br>`webdriver\|append_text`<br>`webdriver\|clear`<br>`webdriver\|hover` |
| **Чтение** | `ПолучитьТекст`<br>`ПолучитьЗначение`<br>`ПолучитьАтрибут` | `Текст`<br>`Значение`<br>`Атрибут` | `webdriver\|get_text`<br>`webdriver\|get_value`<br>`webdriver\|get_attribute` |
| **Ожидания** | `ЖдатьЭлемент`<br>`ЖдатьИсчезновенияЭлемента`<br>`ЖдатьТекст`<br>`ЖдатьURL`<br>`ЖдатьЗаголовок`<br>`ЖдатьЗагрузкуСтраницы`<br>`ЖдатьПростойСети` | `Ждать`<br>`ЖдатьСкрытия`<br>`ЖдатьТекст`<br>`ЖдатьURL`<br>`ЖдатьЗаголовок`<br>`ЖдатьЗагрузку`<br>`ЖдатьСеть` | `webdriver\|wait_for_element`<br>`webdriver\|wait_for_element_not`<br>`webdriver\|wait_for_text`<br>`webdriver\|wait_for_url`<br>`webdriver\|wait_for_title`<br>`webdriver\|wait_for_page_load`<br>`webdriver\|wait_for_network_idle` |
| **Проверки** | `ПроверитьЗаголовок`<br>`ПроверитьURL`<br>`ПроверитьНаличиеЭлемента`<br>`ПроверитьВидимостьЭлемента`<br>`ПроверитьНевидимостьЭлемента`<br>`ПроверитьТекстНаСтранице`<br>`ПроверитьРавенство`<br>`ПроверитьВхождение` | (те же) | `webdriver\|assert_title`<br>`webdriver\|assert_url`<br>`webdriver\|assert_element_present`<br>`webdriver\|assert_element_visible`<br>`webdriver\|assert_element_not_visible`<br>`webdriver\|assert_text_present`<br>`webdriver\|assert_equals`<br>`webdriver\|assert_contains` |
| **Формы / Файлы** | `ВыбратьПоТексту`<br>`ВыбратьПоЗначению`<br>`ЗагрузитьФайл` | `Выбрать`<br>`ВыбратьЗначение`<br>`ЗагрузитьФайл` | `webdriver\|select_by_text`<br>`webdriver\|select_by_value`<br>`webdriver\|upload_file` |
| **Сессия (SecOps)**| `ОчиститьCookies`<br>`УстановитьCookie`<br>`ПолучитьCookie` | `ОчиститьКуки`<br>`УстановитьКуки`<br>`ПолучитьКуки` | `browser\|clear_cookies`<br>`browser\|set_cookie`<br>`browser\|get_cookie` |
| **Evidence** | `Скриншот`<br>`СкриншотЭлемента`<br>`ПриложитьСкриншот`<br>`МеткаВДневнике` | `Скрин`<br>`СкринЭлемента`<br>`ПриложитьСкрин`<br>`Метка` | `webdriver\|take_screenshot`<br>`webdriver\|take_element_screenshot`<br>`allure\|attach_screenshot`<br>`webdriver\|log_marker` |

### 🔻 Удалено из P0 в P2 / Legacy:
* `ПрокрутитьНа` (по X/Y координатам) — пиксельный антипаттерн; в P0 остаётся надёжный `ПрокрутитьКЭлементу`.
* `НажатьПоИндексу` — источник flaky-падений; заменяется семантическим текстом или ролью.
* `ЭлементОтображается` / `ЭлементДоступен` как функции-геттеры boolean — в сценариях заменяются на `ПроверитьВидимостьЭлемента`.

---

## 4. Кладбище CDP и чистка мусора

Старый `browser_adapter.py` (750 строк) содержал массу методов прямого вызова CDP команд Selenium `execute_cdp_cmd`. В Playwright они вычищаются:

| Старый костыль Selenium/CDP | Приговор | Playwright-native реализация |
|---|---|---|
| `cdp_capture_screenshot` | 🗑️ **KILL** | `page.screenshot(type="png")` |
| `cdp_clear_browser_cache` | 🗑️ **KILL** | `new_cdp_session` под капотом `Сессия ОчиститьКэш` |
| `cdp_clear_browser_cookies` | 🗑️ **KILL** | `context.clear_cookies()` |
| `cdp_set_extra_headers` | 🗑️ **KILL** | `page.set_extra_http_headers()` |
| `cdp_add_init_script` | 🗑️ **KILL** | `context.add_init_script()` |
| `cdp_reload` | 🗑️ **KILL** | `page.reload()` |
| `cdp_evaluate` | 🗑️ **KILL** | `page.evaluate()` |
| `cdp_set_timezone / locale / geolocation` | 🗑️ **KILL** | Параметры контекста `BrowserContext` |
| `click_text`, `click_role`, `click_js` | 🗑️ **MERGE** | Единый метод `Нажать` с выбором селектора |
| `send_keys`, `fill`, `set_value` | 🗑️ **MERGE** | Единый метод `ВставитьЗначение` (`fill`) + `ДописатьТекст` (`press_sequentially`) |
| 30+ методов `cdp_performance_*`, `cdp_touch_*` | 📦 **PARK** | Только через единый escape hatch: `Сессия Команда <Domain.method> <JSON>` |

---

## 5. Полная спецификация стратегий поиска локаторов

Для надёжной работы в динамических SPA и DAST-сценариях Playwright-адаптер поддерживает 11 стратегий поиска:

| Стратегия | Ключевое слово | Пример в сценарии | Что ищет под капотом Playwright |
|---|---|---|---|
| **Умный текст (по умолч.)** | `text` / без префикса | `Клик "Войти"` | `page.get_by_text("Войти", exact=False)` (contains) |
| **Точный текст** | `exact` | `Клик exact "Войти"` | `page.get_by_text("Войти", exact=True)` |
| **Лейбл формы** | `label` | `Вставить label "Логин" admin` | `page.get_by_label("Логин")` |
| **Плейсхолдер** | `placeholder` | `Вставить placeholder "Email" a@b.c` | `page.get_by_placeholder("Email")` |
| **Test-ID / QA-ID** | `test_id` / `qa` | `Клик test_id submit-btn` | `page.get_by_test_id("submit-btn")` |
| **Атрибут name** | `name` | `Вставить name csrf_token $token` | `page.locator('[name="csrf_token"]')` |
| **Идентификатор** | `id` / `#` | `Клик #btn-login` | `page.locator('#btn-login')` |
| **CSS класс** | `class` / `.` | `Клик .btn-primary` | `page.locator('.btn-primary')` |
| **Подстрока атрибута** | `[attr*="..."]` | `Клик "[href*='logout']"` | `page.locator('[href*="logout"]')` |
| **ARIA роль** | `role` | `Клик role button "Войти"` | `page.get_by_role("button", name="Войти")` |
| **XPath** | `xpath` / `//` | `Клик "//form//button[1]"` | `page.locator('xpath=//form//button[1]')` |

### Правила Smart Selector Inference (Автоопределение):
1. Если строка начинается с `//` или `xpath=` → **XPath**.
2. Если начинается с `#` → **ID**.
3. Если начинается с `.` (и далее валидный CSS-класс без пробелов) → **CSS Class**.
4. Если содержит `[attr=...]` или `>` / `:` / `+` → **CSS Selector**.
5. В остальных случаях запускается каскадный Smart Match:
   - `get_by_role('button'/'link', name=val)`
   - `get_by_label(val)`
   - `get_by_test_id(val)`
   - `locator(f'[name="{val}"]')`
   - `get_by_placeholder(val)`
   - `get_by_text(val, exact=False)`

---

## 6. Спецификация синтаксического сахара (Sugar DSL)

### 6.1. Кавычки и токенизация
Кавычки нужны **только для объединения аргументов с пробелами**:
```text
# Без пробелов — кавычки не нужны:
Клик Войти
Вставить Логин admin
Вставить Пароль $admin_pass

# С пробелами — кавычки обязательны:
Клик "Войти в личный кабинет"
Вставить "Электронная почта" "ivan@corp.ru"
```

### 6.2. Разрешение коллизий: текст с точками (`.NET`, `.htaccess`, `#1`)
Если текст начинается со спецсимвола CSS (`.` или `#`), есть 2 прозрачных пути:
1. **Явная стратегия:** `Клик text ".NET Core"` или `Клик text "#1 в рейтинге"`.
2. **Кавычки + Auto-Fallback:** `Клик ".NET Core"`. Парсер пробует найти CSS `.NET`, видит отсутствие элемента или синтаксическую невалидность и переключается на `get_by_text(".NET Core")`.

### 6.3. Стрелочные модификаторы (Arrow Semantics)
Символ `>` убран из простых кликов (было `Клик > Войти`, стало `Клик Войти`). Стрелки зарезервированы под логические модификаторы:

1. **`-> $var` (Data Capture Pipe — сохранение данных):**
   ```text
   ПолучитьТекст css ".jwt-token" -> $token
   ПолучитьАтрибут "meta[name=csrf]" "content" -> $csrfToken
   ```
2. **`>?` (Failsafe — мягкий пропуск плашек и баннеров):**
   ```text
   Клик "Принять все cookies" >?
   Клик css ".promo-modal-close" >?
   ```
   При отсутствии элемента шаг помечается жёлтым статусом `SKIPPED / SOFT`, сценарий не падает.
3. **`>#hint` (Self-Healing Anchor — семантический якорь самолечения):**
   ```text
   Клик css "button.v2-submit-482" >#КнопкаВхода
   ```
4. **`>>` (Context Drilldown — скоуп поиска внутри контейнера):**
   ```text
   Внутри "#modal-auth" >> Клик "Войти"
   ```

---

## 7. Эталонный пример боевого сценария (Было vs Стало)

```text
# ── Было (Старый многословный wire/Selenium стиль) ───────────────────────────
webdriver|open|/auth/login
webdriver|send_keys|css|#input-email|admin@prettyk.io
webdriver|send_keys|css|#input-password|${PASS}
webdriver|click|css|.btn-login-primary
webdriver|wait_for_element|css|.user-dashboard|15
webdriver|get_text|css|.account-balance
data|let|balance|${LAST_RESULT}
webdriver|take_screenshot|dashboard.png

# ── Стало (Новый лаконичный PrettyK Sugar DSL) ────────────────────────────────
Открыть /auth/login

Вставить placeholder "Email" admin@prettyk.io
Вставить "Пароль" $PASS
Клик Войти

Ждать ".user-dashboard"
ПолучитьТекст ".account-balance" -> $balance
Скрин dashboard.png

Клик "Оценить приложение" >?
ПроверитьТекст "Добро пожаловать"
```

---

## 8. План реализации и пакет задач для Boss (DeepSeek V4 Pro)

### Пакет Boss: Heavy Execution & Parity (Backend)
1. **Task B1 (P0 Engine Parity):** Довести `orchestrator/adapters/playwright_adapter.py` до 100% покрытия P0 методов из Таблицы 3 с полным паритетом сигнатур `WebDriverAdapter`.
2. **Task B2 (Smart Locator Engine):** Реализовать в `PlaywrightAdapter` каскадный `_locator(selector_type, selector_value)` с поддержкой всех 11 стратегий из Раздела 5.
3. **Task B3 (MethodId & Sugar Parser):** Обновить `orchestrator/core/method_id.py` для поддержки коротких глаголов (`Клик`, `Вставить`, `Ждать`, `Скрин`), пайпа `-> $var` и модификатора `>?`.
4. **Task B4 (Allowlist Validation Registry):** Перевести `orchestrator/core/wired_validate.py` и `action_factory.py` с `dir()` reflection blacklist на строгий allowlist `PrettyMethodSpec`.
5. **Task B5 (Parity Integration Test Suite):** Создать `orchestrator/tests/test_browser_runtime_parity.py` — сквозной тест одного wired-сценария на двух runtime (Playwright и Selenium) с проверкой эквивалентности verdicts, ZAP-прокси и evidence.
