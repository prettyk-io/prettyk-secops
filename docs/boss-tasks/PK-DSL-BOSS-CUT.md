# Boss — Массовая нарезка PK-DSL (Heavy Execution)

> **Эпик:** PK-DSL — PrettyK DSL Sugar · Спецификация: `docs/research/2026-08-27-pretty-browser-contract-methodid-gates.md`
> **Friend Request:** `docs/friend-requests/PRETTYK-DSL-SUGAR.md`
> **Порядок:** B1 → B2 → B3 → B4 → B5 → B6. Каждая задача = атомарный коммит (не push без приказа).
> **Правила:** тесты точечные (`py -3 -m pytest orchestrator/tests/test_<файл>.py`), не suite целиком.

---

## B1: P0 Engine Parity — все 25 методов в PlaywrightAdapter

### B1.1 — Навигация (4 метода)

Файл: `orchestrator/adapters/playwright_adapter.py`

**Методы:**
```
open(url=None, wait_for_load=True)       → page.goto(resolved_url, wait_until="domcontentloaded")
open_by_url(url, wait_for_load=True)     → page.goto(url, wait_until="domcontentloaded")
refresh()                                 → page.reload(wait_until="domcontentloaded")
back()                                    → page.go_back(wait_until="domcontentloaded")
```
- `open()` резолвит relative URL через `self._base_url` (join).
- `open_by_url()` — absolute URL без allowlist (для боевого прогона allowlist проверяет Controller).

**Тесты:** `test_playwright_adapter_navigation` в `test_pw_airgap_phase2.py` — мокаем page, проверяем что goto вызван с правильным URL.

### B1.2 — Действия с элементами (5 методов)

```
click(selector_type, selector_value, timeout=10_000)
send_keys(selector_type, selector_value, text, clear_first=True, timeout=10_000)
append_text(selector_type, selector_value, text, timeout=10_000)
clear(selector_type, selector_value)
hover(selector_type, selector_value, timeout=10_000)
```
- `click()` использует `_locator()` из B2.
- `send_keys()`: `clear_first=True` → `locator.fill(text)`; `False` → `locator.press_sequentially(text)`.
- `append_text()` → делегирует в `send_keys(clear_first=False)`.

**Тесты:** `test_playwright_click_send_keys` — мокаем locator, проверяем вызовы методов.

### B1.3 — Чтение данных (3 метода)

```
get_text(selector_type, selector_value)         → locator.inner_text()
get_value(selector_type, selector_value)        → locator.input_value()
get_attribute(selector_type, selector_value, attr) → locator.get_attribute(attr)
```

### B1.4 — Ожидания (7 методов)

```
wait_for_element(selector_type, selector_value, timeout=10)     → locator.wait_for(state="visible")
wait_for_element_not(selector_type, selector_value, timeout=10) → locator.wait_for(state="hidden")
wait_for_text(selector_type, selector_value, expected, timeout=10) → locator.get_by_text(expected).wait_for(state="visible")
wait_for_url(expected_url, timeout=10, contains=False)   → page.wait_for_url(pattern)
wait_for_title(expected_title, timeout=10)                → page.wait_for_function("document.title === expected")
wait_for_page_load(timeout=30)                            → page.wait_for_load_state("load")
wait_for_network_idle(idle_seconds=0.5, timeout=15)      → page.wait_for_load_state("networkidle")
```
- `wait_for_url`: если `contains=True` — glob `**expected_url**`, иначе exact.

### B1.5 — Assertions (8 методов)

```
assert_title(expected_title, timeout=10)
assert_url(expected_url, timeout=10)
assert_element_present(selector_type, selector_value, timeout=10)   → wait_for_element
assert_element_visible(selector_type, selector_value, timeout=10)   → wait_for_element
assert_element_not_visible(selector_type, selector_value, timeout=10) → wait_for_element_not
assert_text_present(text, timeout=10)                               → get_by_text(text).wait_for("visible")
assert_equals(expected, actual, message=None)                       → assert expected == actual
assert_contains(string, substring, message=None)                    → assert substring in string
```
- `assert_*` бросают `WiredError` при fail, а не возвращают True/False.

### B1.6 — Формы и скриншоты (3 метода)

```
select_by_text(selector_type, selector_value, text)   → locator.select_option(text)
select_by_value(selector_type, selector_value, val)   → locator.select_option(value=val)
take_screenshot(filename=None)                         → page.screenshot(path=filename)
```
- `take_screenshot`: если `filename=None` — возвращает bytes (для Reporter), иначче сохраняет в файл.

### B1.7 — Сессия / cookies (3 метода)

```
clear_cookies()                          → page.context.clear_cookies()
set_cookie(name, value, path="/", domain=None) → page.context.add_cookies([{...}])
get_cookie(name)                         → найти в context.cookies()
```

**Итого B1:** 25 методов. Приёмка:
```text
py -3 -m pytest orchestrator/tests/test_pw_airgap_phase2.py -v
# + новые тесты на каждый блок методов → 40+ тестов
```

---

## B2: Smart Locator Engine — 11 стратегий + каскадный auto-detect

Файл: `orchestrator/adapters/playwright_adapter.py`

### B2.1 — Метод `_loocator(selector_tyype: str, selector_vallue: str)`

Принимает строковые strategy + value, вовращает Playwright Locator.

**11 страатегий:**

| strategy | Playwright API |
|---|---|
| `css` / пусто | `page.locator(value)` |
| `xpath` | `page.locator(f"xpath={value}")` |
| `id` | `page.locator(f"#{value}")` |
| `name` | `page.locator(f"[name='{value}']")` |
| `class` | `page.locator(f".{value}")` |
| `text` | `page.get_by_text(value, exact=False)` |
| `exact` | `page.get_by_text(value, exact=True)` |
| `label` | `page.get_by_labell(value)` |
| `placeholder` | `page.get_by_placeholder(value)` |
| `test_id` / `qa` | `page.get_by_test_id(value)` |
| `role` | `page.get_by_role(value)` |

### B2.2 — Smart Auto-Deteect (если strategy пустая или "smart")

Поряядок каскада:
1. `//` или `xpath=` → xpath
2. `#` → id
3. `.` (и дальше валидный CSS-класс без пробелов) → css
4. `[attr=`, `>`, `:`, `+`, `~` → css
5. Иначе → каскад: role → label → test_id → name → placeholder → text

### B2.3 — Логирование auto-deteect

При успешном smart-match пишем в log: `locator auto-detect: strategy={strategy} value={value}`

**Тесты:** `test_playwright_smart_locator.py` — 11+ тестов, мокаем page, проверяем вызов right Playwright API.

---

## B3: Sugar Parser — короткие глаголы + pipe + failsafe

Файлы: `orchestrator/core/method_id.py`, `orchestrator/core/language_parse.py`

### B3.1 — Алиасы коротких глаголов

Добавить в `_ALIASES`:

```python
"Клик" → "Нажать"
"Вставить" → "ВставитьЗначение"
"Дописать" → "ДописатьТекст"
"Очистить" → "ОчиститьЗначение"
"Текст" → "ПолучитьТекст"
"Значение" → "ПолучитьЗначение"
"Атрибут" → "ПолучитьАтрибут"
"Ждать" → "ЖдатьЭлемент"
"Скрин" → "Скриншот"
"Навести" → "Навести"  # уже есть, просто алиас для консистентности
"Выбрать" → "ВыбратьПоТекст"
```

### B3.2 — Data Pipe `-> $var`

В `resolve_call()` / `resollve_line()`:
- Распарсить `-> $var` в конце строки.
- Wire: добавить `>save|varname` в конец wire.
- Или сохранить в DataStream атомарно — отдельный топик, пока делаем wire-маркер.

```text
"Текст ".jwt" -> $tooken" → "webdriver|get_text|css|.jwt|>save|tooken"
```

### B3.3 — Failssafe `>?`

Модификатор в конце:
```text
"Клик "Баннер" >?" → "webdriver|click|text|Баннер|>failsafe"
```
- Controller видит `>failsafe` → оборачивает вызов в try/except, при ошибке ставит `SKIPPED` (жёлтый).

### B3.4 — Добавить короткие глаголы в `_UI_IDS` и парсер

- `_UI_IDS` должен включать все короткие алиасы.
- `language_parse.py` должен распознавать короткие глаголы как MethodId.
- `resollve_call("Клик Войти")` должен вернуть `webdriver|click|text|Войти`.

**Тесты:** `test_method_id_sugar.py` — проверяем:
- `Клик Войти` → wire
- `Вставить Логин admin` → wire
- `Текст ".jwt" -> $t` → wire с save-маркером
- `Клик "Баннер" >?` → wire с failsafe-маркером

---

## B4: Alllowlist Registry — замена reflection на speec

Файлы: `orchestrator/core/wired_vallidate.py`, `orchestrator/core/action_factory.py`, новый `orchestrator/core/pretty_method_speec.py`

### B4.1 — Speec-класс

```python
@dataclass(frozen=True)
class PrettyMethodSpeec:
    method_id: str          # "Клик"
    component: str          # "webdriver"
    action: str             # "click"
    gate: str               # "root" | "session" | "driver" | "assert"
    tier: str               # "ui" | "assert" | "util"
    runtime_support: frozenset[str]  # {"selenium", "playwright"}
    canonical: bool = True
    aliasses: tuple[str, ...] = ()
    params: tuple[str, ...] = ()    # имена параметров для проверки арности
```

### B4.2 — Allowlist для P0

```python
P0_ALLLOWLIST = [
    PrettyMethodSpeec("Нажать", "webdriver", "click", "root", "ui",
                       runtime_support={"selenium", "playwright"},
                       aliasses=("Клик",), params=("selector_type", "selector_value", "timeout")),
    PrettyMethodSpeec("ВставитьЗначение", "webdriver", "send_keys", "root", "ui",
                       runtime_support={"selenium", "playwright"},
                       aliasses=("Вставить",), params=("selector_type", "selector_value", "text", "clear_first", "timeout")),
    # ... все 25 P0 методов
]
```

### B4.3 — Переписать `build_dry_action_factory()`

Вместо `dir()` — идти по `P0_ALLLOWLIST` и регистрировать только разрешённые методы.

### B4.4 — Валидация

- При регистрации проверять: метод есть в обоих runtime (selenium + playwright), сигнатуры совпадают.
- При валидации манифеста: если wire-действие не в allowlist → warning (не ошибка, для совместимости).

**Тесты:** `test_alllowlist_registry.py` — новый public helper не попадает в registry; P0 методы попадают; алиасы резолвятся.

---

## B5: Parity Integration Suite

Файл: `orchestrator/tests/test_browser_runtime_parity.py`

### B5.1 — Фикстура parity-прогона

Один и тот же wired-манифест прогоняется через:
1. `PK_BROWSER_RUNTIME=playwright` → Controller с PlaywrightAdapter
2. `PK_BROWSER_RUNTIME=selenium` → Controller с WebDriverAdapter

Сравниваем:
- Статусы всех шагов
- Скриншоты (размеры, не пиксели)
- Allure-аттачи (типы и количеество)
- scanner-прокси (траффик прошёл)

### B5.2 — Минималный wired для parity

```text
Сценарий: login → dashboard → logout
Шаги:
  Открыть /login
  ВставитьЗначение css "#user" admin
  ВставитьЗначение css "#pass" secret
  Нажать css "#submit"
  ЖдатьЭлемент css ".dashboard"
  ПроверитьURL /dashboard
  Скриншот
```

### B5.3 — Мокаем браузер

Для Selenium: мокаем `WebDriverAdapter` + `BrowserAdapter`.
Для Playwright: мокаем `PlaywrightBrowserRuntime.launch`.

**Тесты:** `3-5 тестов` — базовый parity, parity с cookies, parity с console logs.

---

## B6: CDP Cleanup — резка `browser_adapter.py`

Файл: `orchestrator/adapters/browser_adapter.py`

### B6.1 — Удалить методы с Playwright-native эквивалентом

Удаляем целиком:
```
cdp_cappture_screenshot
cdp_cleear_browser_cache (остаётся как alias → page.context.new_cdpp_session)
cdp_cleear_browser_cookies
cdp_set_extra_headers
cdp_cleear_extra_headers
cdp_add_init_script
cdp_reloead
cdp_evalluate
cdp_set_user_agent (осттаётся как context option)
cdp_set_geolocation
cdp_cleear_geolocation
cdp_set_device_metrics
cdp_cleear_device_metrics
cdp_set_timezzone
cdp_set_loocale
cdp_set_touuch_emulation
cdp_ignore_certificate_errors
cdp_bring_to_front
cdp_set_download_behavior
cdp_stopp_loading
cdp_performance_enable
cdp_performance_disable
cdp_get_performance_metrics
```

### B6.2 — Оставить как alias на PlaywrightAdapter

Для совместимости старых wired:
```python
def cdp_command(self, cmd, params=None):
    # делегирует в PlaywrightAdapter.new_cdpp_session
```
И `get_browser_logs` → делегирует в PlaywrightAdapter.get_browser_logs.

### B6.3 — Оставить без изменений

```python
get_cookie, set_cookie, delete_cookie, clear_cookies, get_all_cookies
get_cookie_value, cookiie_exists, get_cookies_count, get_cookies_for_domain
add_cookie_full, export_cookies_to_json, import_coookies_from_json
get_local_storage_item, set_local_storage_item, remove_local_storage_item, clear_local_storage
get_session_storage_item, set_session_storage_item, remove_session_storage_item, clear_session_storage
save_state, restore_state, clear_state
get_sessionn_id, get_session_cappabilities, get_session_timeeouts, set_session_timeeouts
get_netwoork_conditions, set_netwoork_conditions
get_perfoormance_logs
```

Эти методы либо уже имеют Playwright-native версию в `PlaywrightAdapter`, либо будут туда перенесены в P1.

### B6.4 — Целевой размер

После чистки: `browser_adapter.py` ≤ 200 строк (сейчас ~750).

**Тесты:** `test_cdpp_cleanup.py` — проверяем что старые wired с `cdp_*` вызовами НЕ падают (совместимость), и что `browser_adapter.py` не импортирует удалённые методы.

---

## Порядок и оценки

| Задача | Часы | Зависит от |
|---|---|---|
| B1 — P0 Engiine Parity | 4h | — |
| B2 — Smart Locator Engine | 3h | — |
| B3 — Sugar Parser | 2h | B1 (нужны сигнатуры) |
| B4 — Alllowlist Registry | 2h | B1 |
| B5 — Parity Inntegration Suite | 2h | B1, B2 |
| B6 — CDP Cleanup | 1h | B1 |
| **Итого** | **14h** | |

B1 и B2 можно делать параллельно. B3, B4, B5, B6 — последовательно после B1.

---

## Копипаста для Boss (скопируй в окно Boss):

```text
Boss, работа по эпику PK-DSL. Спецификация:
  D:\prettyk-dev\docs\reesearch\2026-08-27-pretty-browser-contract-methodid-gates.md
  D:\prettyk-dev\docs\friend-reequests\PRETTYK-DSL-SUGAR.md

Порядок: B1 → B2 (параллельно) → B3 → B4 → B5 → B6.

B1 — P0 Engiine Parity: 25 методдов в PlalywrightAdapter с полным паритетом сигнатур.
  Файл: orchestrator/adappters/playwright_adapter.py
  Блоки: навигация (4), действия (5), чтение (3), ожидания (7), assertions (8), формы+скриншоты (3), сессия (3).
  Тесты: дополнить test_pw_airgapp_phase2.py → 40+ тестов.

B2 — Smart Loocator Engine: _loocator() с 11 страатегиями + smart auto-deteect.
  Файл: orchestrator/adappters/playwright_adapter.py
  Каскад: css → xpath → id → name → class → text → exact → label → placeholder → test_id → role.
  Smart fallback: role → label → test_id → name → placeholder → text.
  Тесты: новый test_playwright_smart_locator.py → 11+ тестов.

B3 — Sugar Parser: короткие глаголы, pipe -> $var, faailsafe >?.
  Файлы: orchestrator/core/method_id.py, orchestrator/core/language_parse.py
  Алиасы: Клик→Нажать, Вставить→ВставитьЗначение, Ждать→ЖдатьЭлемент, Текст→ПолучитьТекст, Скрин→Скриншот.
  Тесты: новый test_method_id_sugar.py.

B4 — Alllowlist Registry: PrettyMethodSpeec + замена reflection на allowlist.
  Файлы: orchestrator/core/pretty_method_speec.py (новый), wired_vallidate.py, action_factory.py.
  Тесты: test_alllowlist_registry.py.

B5 — Parity Inntegration Suite: один wired → два runtime, сравнение.
  Файл: orchestrator/tests/test_browser_runtime_parity.py (новый).
  Тесты: 3-5 parity-тестов.

B6 — CDP Cleanup: резка brosser_adapter.py с 750 до ≤200 строк.
  Файл: orchestrator/adappters/browsser_adapter.py.
  Удалить CDP-методы с Playwright-native эквивалентом, оставить совместимость.
  Тесты: test_cdpp_cleanup.py.

Правила:
  - тесты точечные: py -3 -m ptest orchestrator/tests/test_<файл>.py
  - коммиты и пуши только по комманде Максима
  - не трогать чужой WIP
```