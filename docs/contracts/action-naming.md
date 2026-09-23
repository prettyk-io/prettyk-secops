# Action-naming — каноничный словарь browser-действий (FE ↔ BE)

> **Единственный источник истины нейминга browser-действий** между backend (`browser_service.py`) и frontend (`scenarioStepModel` / `browserSession` / `useCdpRecorder`).
> **Карточка:** ACT-DEBT (Поток 6). **Исполнитель:** Luna (worker). **Дата:** 2026-09-23.
> **Правило:** новые observe-события и DSL/предложение используют ИМЕННО эти имена; синонимы не вводить. Любой рассинхрон (`press` vs `keyboard`, `scroll` vs `wheel`, `fill` vs `type`) — договорный дрейф, а не «кто-то переименовал».

---

## 1. Каноничный словарь (wire action, lowercase)

| Канон | Семантика | Поле-источник события | Redaction |
|---|---|---|---|
| `click` | клик по элементу | pointer (page.mouse / hit-test) | — |
| `type` | ввод текста в поле | input/change на el | `$value` / `$secret` |
| `wheel` | колесо мыши (deltaX/deltaY) | wheel (mouse wheel) | — |
| `scroll` | программная прокрутка к элементу / по координатам | scrollIntoView / step `scroll` | — |
| `drag` | drag & drop (start/end coords) | dragstart/dragend | — |
| `hover` | наведение (mouseenter) | mouseenter с дебаунсом | — |
| `key` | нажатие клавиши (key + целевой element) | keydown/keypress | печатные → `$value` |
| `focus` | установка фокуса (без ввода) | focusin | — |
| `select` | выбор опции (select/option) | change на select | value — выбор, не секрет |

> **`wheel` ≠ `scroll`.** Разные источники события: `wheel` — физическое колесо мыши (delta), `scroll` — программная прокрутка к цели. Не считать синонимами.

---

## 2. Маппинг слоёв (wire-канон ↔ backend step-имена)

Два легитимных слоя имён — они **не сводятся друг к другу**, а связаны явным маппингом:

- **Wire-канон** (обсерв-события → DSL-предложение): `click`, `type`, `wheel`, `scroll`, `drag`, `hover`, `key`, `focus`, `select`.
- **Backend step-имена** (`_SUPPORTED_STEP_ACTIONS`, Playwright-native + существующие методы): `click`, `fill`, `type`, `goto`, `navigate`, `wait_for`, `select_option`, `press_key`, `hover`, `scroll`.

`fill`, `select_option`, `press_key` — **Playwright-native имена backend-слоя, не подлежат сведению** к wire-канону. FE маппит свои `ActionKind` в эти step-имена напрямую, как они есть.

| Wire-канон | FE `ActionKind` | FE → BE DTO `action` | BE `_SUPPORTED_STEP_ACTIONS` | Вердикт |
|---|---|---|---|---|
| `click` | `Click` | `click` | `click` | совпадают |
| `type` | `Type` | `fill` (Playwright-native, не сводить) | `fill`, `type` | различие слоёв, не дрейф |
| `hover` | `Hover` | `hover` | `hover` | совпадают |
| `select` | `Select` | `select_option` (Playwright-native, не сводить) | `select_option` | различие слоёв, не дрейф |
| `key` | `PressKey` | `press_key` (Playwright-native, не сводить) | `press_key` | различие слоёв, не дрейф |
| `scroll` | — (нет отдельного FE) | — | `scroll` | только BE |

### Навигация / пауза (вне action-канона — управление сессией)

Не действия над элементом, поэтому в 9-элементный action-канон не входят, но живут в том же маппинге:

| FE `ActionKind` | FE → BE DTO `action` | BE `_SUPPORTED_STEP_ACTIONS` |
|---|---|---|
| `Open` | `goto` | `goto` (alias `navigate`) |
| `Wait` | `wait_for` | `wait_for` |

---

## 3. Гэпы (pending — зона ACT-BE / ACT-FE)

Каноничные wire-действия, которые ещё **не реализованы** в текущем контуре (не регрессия ACT-DEBT, а фронтир Потока 6):

| Wire-канон | BE (observe/step) | FE (`ActionKind` / `observationToAction`) |
|---|---|---|
| `wheel` | нет | нет |
| `drag` | нет | нет |
| `focus` | нет (input/change есть, focusin нет) | нет |

> `key` (`PressKey` / `press_key`) — уже реализован и маппится в существующий FE-нейм `PressKey`, гэпом **не является**.

---

## 4. Стратегии локатора (вторичный контракт, не action-нейминг)

Сверка наборов — приложена к parity-тесту (инвариант «FE strategy ⊆ BE strategy»):

- **FE `STRATEGY_KINDS`:** `role`, `label`, `css`, `test_id`, `text`, `xpath`.
- **BE `_resolve_step_locator`:** `role`, `text`, `xpath`, `id`, `test_id`/`testid`, `label`, `placeholder`, `alt`, `title`, `css` (default).

FE ⊂ BE — разъезда нет (BE шире, FE не шлёт не поддержанное).

---

## 5. Где править при изменении

| Слой | Файл | Символ |
|---|---|---|
| BE константа действий | `orchestrator/browser/browser_service.py` | `_BrowserWorker._SUPPORTED_STEP_ACTIONS` |
| BE стратегии локатора | `orchestrator/browser/browser_service.py` | `_BrowserWorker._resolve_step_locator` |
| FE enum действий | `frontend/src/studio/scenarioStepModel.ts` | `ACTION_KINDS` |
| FE map → BE DTO | `frontend/src/studio/browserSession.ts` | `scenarioStepToBackendDto` |
| FE observe → action | `frontend/src/terminal/useCdpRecorder.ts` | `observationToAction` |
| FE observe-тип | `frontend/src/studio/browserSession.ts` | `CdpObservation.action` |

**Guard:** `orchestrator/tests/test_action_naming_parity.py` (машиночитаемая сверка FE↔BE, read-only).