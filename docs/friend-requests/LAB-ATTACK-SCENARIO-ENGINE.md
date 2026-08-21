# Friend-Request: Движок сценариев атак и расширенных полезных нагрузок для SecOps Lab (/lab)

> **ID:** `LAB-ATTACK-SCENARIO-ENGINE`  
> **Статус:** `ready`  
> **Роль / Исполнитель:** Boss  
> **Слой:** Frontend (`cosmo/src/lab/`) ↔ Backend (`orchestrator/services/intruder/`)

---

## 1. Продуктовая суть и замысел

Для автономной станции **SecOps Lab (`/lab`)** требуется полнофункциональный движок формирования и оркестрации атак (Burp Intruder-killer):
1. **Поддержка 4 режимов атаки (Attack Types):**
   - **Sniper** — перебор одного словаря по очереди по всем позициям маркеров `§...§`.
   - **Battering Ram** — подстановка одного значения одновременно во все позиции.
   - **Pitchfork** — параллельный проход по N словарям для N позиций (строка в строку).
   - **Cluster Bomb** — полный декартов перебор всех комбинаций N словарей.
2. **Типы полезных нагрузок (Payload Sets):**
   - **Simple List** — статические словари (XSS, SQLi, SSRF, Command Injection, Auth Bypass).
   - **Runtime Numbers** — числовые диапазоны с шагом (Step / Min / Max / Base / Format).
   - **Brute Forcer** — генерация комбинаций символов заданной длины.
   - **Custom Script / Regexp** — динамическая генерация на лету.
3. **Парсинг и фильтрация ответов (Grep & Extract):**
   - **Grep - Match:** поиск ключевых regex-паттернов (ошибки БД, стектрейсы, токены) с подсветкой в таблице результатов.
   - **Grep - Extract:** извлечение значений по регулярным выражениям или CSS-селекторам.
   - **Payload Processing:** правила предобработки (URL-encode, Base64, MD5, префиксы/суффиксы).

---

## 2. Архитектура исполнения и UI-контракт

1. **Многопоточный асинхронный воркер (`orchestrator/services/intruder_engine.py`):**
   - Управление concurrency (пул соединений `aiohttp` / `httpx`, RPS throttle, паузы между запросами).
   - Автоматический ре-аут при получении 401/403 через Auth Vault.
2. **Интерфейс витрины атак (`cosmo/src/lab/`):**
   - Конструктор запроса с подсветкой позиций маркеров `§target§`.
   - Таблица результатов в реальном времени (Виртуализированный список строк: ID, Payload, Status Code, Error, Response Length, Latency, Grep Match).
   - Инспектор HTTP: просмотр Raw Request / Raw Response для выбранного элемента в таблице.

---

## 3. Критерии приёмки (DoD)

- [ ] Воркер корректно отрабатывает режим Cluster Bomb с 2+ словарями без утечек памяти.
- [ ] Таблица результатов держит 10 000+ строк через виртуализацию без просадок UI.
- [ ] Кнопки Start / Pause / Stop мгновенно управляют потоком запросов.
- [ ] Результаты атаки можно экспортировать в CSV / JSON или передать в качестве PoC в DefectDojo.

---

## 4. Delivery Log (Flash)

> Статус документа: `ready`. Backend-ядро и генераторы закрыты. Виртуализация UI, экспорт CSV/JSON и ре-аут через Auth Vault — отдельный скоуп (следующий заход).

### Сделано

- **Многопоточный воркер** (`orchestrator/lab/intruder_engine.py`): `IntruderAttackSession._run_attack` теперь исполняет задачи через `ThreadPoolExecutor` с `concurrency` воркерами. Результаты пишутся потокобезопасно и **упорядочиваются по `item_id`** (строгий порядок строк в таблице независимо от гонки потоков). `stop()` прерывает и одиночный, и пульный режим. `concurrency == 1` идёт последовательным путём.
- **Генераторы пейлоадов** (там же):
  - `RuntimeNumbersSpec` / `generate_runtime_numbers` — числовой диапазон (start/stop/step/base/fmt) с шаблоном `{value}/{index}/{index0}`.
  - `BruteForcerSpec` / `generate_brute_force` — комбинации charset длиной `min_len..max_len` с prefix/suffix.
  - `generate_payload_set` / `resolve_payload_sets` — декларативный разбор `{kind, spec, items}` наравне с legacy плоскими списками.
- **Payload Processing**: `apply_processing` (prefix → encoders → suffix) + энкодер **`md5`** добавлен в `apply_encoders` (рядом с url/base64/hex).
- **Live-эндпоинт** (`orchestrator/utils/live_server.py`): `_accept_intruder_start` принимает `prefix`, `suffix`, `concurrency`, `delay_ms`, `timeout_sec`.

### Тесты

`pytest orchestrator/tests/test_intruder_engine.py` — 19 passed: режимы атак, генераторы (numbers/bruteforce/форматы/limit), resolve+processing, MD5, и многопоточный воркер (порядок результатов + соблюдение concurrency).

### Не сделано (вне этого скоупа)

- Виртуализация списка 10 000+ строк на UI (`react-window`/виртуальный рендер) — таблица Ant `Table` пока пагинированная.
- Экспорт CSV/JSON и push PoC в DefectDojo.
- Авто-реаут 401/403 через Auth Vault в воркере.
