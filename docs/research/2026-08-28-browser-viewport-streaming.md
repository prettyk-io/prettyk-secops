# Browser Authoring — Viewport-Only Streaming (Архитектурный кристалл)

> **Статус:** `evolve` — архитектурное решение для `PW-AIRGAP-1` / `PK-WIRE-SYNC`.
> **Дата:** 28 авг 2026.
> **Область:** Studio BrowserStage, CDP Screencast Relay, Docker Playwright Runtime.

---

## 1. Проблема, которую закрываем навсегда

1. **Окна Chrome на десктопе хоста:** локальный запуск Playwright (`headless=False` или fallback) открывал окна браузера прямо на экране оператора. В изолированной и airgap-коробке десктоп оператора трогать строго запрещено.
2. **noVNC — это не вьюпорт страницы:** старый Selenium/noVNC транслирует весь виртуальный монитор Xvfb `1920×1080` (с серыми полями, системными полосами прокрутки и оконными рамками), а не чистый рабочий DOM-контур сайта.
3. **Screenshot-поллинг — костыльный тупик:** периодический вызов `page.screenshot()` каждые 80мс грузит CPU, убивает FPS, теряет ховеры, фокусы и CSS-анимации.

---

## 2. Архитектурный кристалл (3 изолированных канала)

```text
       ┌───────────────────────────────────────────────────────────────┐
       │   Браузер оператора (Studio / BrowserStage :5173)             │
       └───────┬───────────────────────────────▲───────────────────────┘
               │ 1. Клик по координатам         │ 2. Viewport-only поток
               │    (CSS x, y внутри canvas)   │    (JPEG 1280x800 ~15-20 fps)
               ▼                               │
       ┌───────────────────────────────────────┴───────────────────────┐
       │   PrettyK API / Viewport Relay (:8765)                        │
       │   - Отдельный async event-loop для CDP Screencast             │
       │   - Latest-frame backpressure (FIFO-1, нет очереди кадров)    │
       │   - Преобразование экранных кликов в CDP Input                │
       └───────┬───────────────────────────────▲───────────────────────┘
               │ CDP WebSocket                 │ Page.screencastFrame
               │ (port 9223)                   │ (JPEG payload)
               ▼                               │
       ┌───────────────────────────────────────┴───────────────────────┐
       │   Docker: playwright-authoring (:9223)                        │
       │   - Headed Chromium под Xvfb :99                              │
       │   - DOM Observe binding (__pk_cdp_click__)                    │
       │   - noVNC (:7902) — ТОЛЬКО как fallback-пульт для отладки     │
       └───────────────────────────────────────────────────────────────┘
```

---

## 3. Детальная механика трёх ключевых узлов

### 3.1. Картинка (Viewport Stream)
- Контейнер `playwright-authoring` запускает Chromium в headed-режиме внутри Xvfb `:99`.
- PrettyK API подключается к браузеру через порт `:9223` и отправляет команду `Page.startScreencast`:
  - `format: "jpeg"`, `quality: 80`, `maxWidth: 1280`, `maxHeight: 800`, `everyNthFrame: 1`.
- Chromium пушит кадры только при реальных изменениях страницы (отрисовка, скролл, CSS-анимация, фокус).
- Relay-сервер держит ровно 1 последний кадр (FIFO буфер глубиной 1), предотвращая накопление памяти при медленном клиенте, и немедленно отправляет `Page.screencastFrameAck`.

### 3.2. Интерактив и координаты (Coordinate Mapping)
- В `BrowserStage` оператор взаимодействует исключительно с областью вьюпорта (1280×800).
- Клик по экранному элементу пересчитывается в реальные CSS-координаты:
  ```typescript
  const scaleX = 1280 / renderedWidth;
  const scaleY = 800 / renderedHeight;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  ```
- Backend отправляет событие через CDP `Input.dispatchMouseEvent` (`mousePressed` / `mouseReleased`) либо нативный Playwright `page.mouse.click(x, y)`.
- Реальный Chromium внутри контейнера отрабатывает нативные события: hover, active, input focus.

### 3.3. Генерация DSL (DOM Observe → Monaco/Canvas)
- На странице в Chromium активен инжект `__pk_cdp_click__` через `expose_binding`.
- При клике браузер перехватывает нативный DOM Event:
  - вычисляет `tag`, `id`, `classes`, `data-testid`, `text`, `rect`;
  - сопоставляет с деревом доступности (AX Node role, accessible name);
  - формирует упорядоченный список стратегий локаторов (test_id → clean_id → label → text → role → css).
- Кандидат передаётся в `ScenarioDeckStore` → создаётся шаг сценария → моментально проецируется на Canvas и в Monaco Editor.

---

## 4. Сравнение вариантов транспорта

| Вариант | Где браузер | Канал кадров | Канал ввода | Вердикт |
|---|---|---|---|---|
| **noVNC** | Xvfb в контейнере | VNC → WebSocket → canvas | VNC pointer/keyboard | Стримит весь Xvfb desktop (1920×1080); оставлен как debug fallback |
| **CDP Page.startScreencast** | headed Chromium в Docker | CDP `Page.screencastFrame` (JPEG) | CDP `Input` / Playwright | **Канонический источник кадров вьюпорта** |
| **WebSocket Relay поверх CDP** | Chromium в Docker | Binary WS кадры клиенту | WS / HTTP команды | **Целевой транспорт для BrowserStage** |
| **WebRTC** | Chromium в Docker | Media track через SFU | DataChannel bridge | Избыточная сложность для authoring, проблемы в airgap |
| **Screenshot polling** | Любой | Периодический PNG poll | HTTP клик | **Запрещён:** высокий CPU, потеря ховеров/анимаций |
| **MJPEG stream** | Любой | Multipart HTTP stream | HTTP клик | Допустим как простой relay кадров screencast, но не для polling |

### Ограничение текущего sync Playwright воркера
Текущий `_BrowserWorker` в `browser_service.py` блокируется на `queue.get()`. В синхронном Playwright колбэки CDP обрабатываются только во время активных API-вызовов, а не в постоянном цикле событий.
- **Решение:** вынос screencast relay в независимый асинхронный поток / websocket listener, не зависящий от блокировок очереди команд.

---

## 5. Контракты протокола и сообщений

### 5.1. Frame (Сервер → Клиент)
```json
{
  "type": "frame",
  "seq": 1042,
  "timestamp": 1787910000000,
  "width": 1280,
  "height": 800,
  "deviceScaleFactor": 1
}
```
*Следом за заголовком передаётся бинарный payload JPEG кадра.*

### 5.2. Input (Клиент → Сервер)
```json
{
  "type": "pointer",
  "action": "click",
  "x": 431.5,
  "y": 276.0,
  "button": "left",
  "clickCount": 1
}
```

### 5.3. Lifecycle & Errors
```json
{ "type": "ready", "browserId": "container-7f9a12b4", "url": "http://localhost:3000/" }
{ "type": "error", "code": "BROWSER_UNAVAILABLE", "message": "Container not connected on :9223", "retryable": true }
{ "type": "closed", "reason": "session_terminated" }
```

---

## 6. Жёсткие инварианты и запреты

1. **Zero Desktop Windows:** `playwright.chromium.launch(headless=False)` на хосте оператора строго запрещён.
2. **Container Required:** при недоступности контейнера `:9223` API возвращает статус `BROWSER_UNAVAILABLE` с подсказкой оператору. Тихий запуск локального Chrome на хосте запрещён.
3. **Viewport Purity:** в BrowserStage транслируется строго рабочий прямоугольник страницы 1280×800. Рамки рабочего стола Xvfb скрыты.
4. **No Polling:** никаких циклов `page.screenshot()` под видом видеопотока. Кадры генерируются браузером по факту инвалидации экрана.
5. **Single Process Lifecycle:** повторные опросы статуса (`/api/browser/status`) не имеют права спавнить новые браузерные процессы.

---

## 7. Продуктовая ценность

- **0 окон на десктопе:** оператор видит только рабочую среду PrettyK в браузере.
- **Чистый UI-опыт:** оператор видит чистую страницу целевого приложения без артефактов VNC и виртуального рабочего стола.
- **Скорость и отзывчивость:** живые ховеры, анимации выпадающих меню и плавная реакция на ввод.
- **Airgap-монолитность:** один базовый образ `playwright-authoring` без внешних сетевых зависимостей при старте.

---

## 8. Критерии приёмки и Steel Thread

### Сквозной проверочный сценарий (Juice Shop Steel Thread):
1. Открыть Studio / BrowserStage на `http://localhost:5173`.
2. Выполнить навигацию на `http://localhost:3000` (Juice Shop).
3. Убедиться, что на десктопе Windows не появилось ни одного окна Chrome.
4. Включить режим записи (Observe mode).
5. Навести курсор на карточку товара (проверить отображение hover-эффекта в стриме).
6. Кликнуть по кнопке добавления в корзину.
7. Проверить генерацию Observe Event с метаданными элемента и деревом AX.
8. Убедиться, что сгенерированный шаг `webdriver|click|...` мгновенно появился в Scenario Deck Canvas и Monaco Editor.

---

## 9. Реализационный порядок

1. **Docker Runtime:** контейнер `playwright-authoring` поднимается compose'ом (`:9223` CDP, `:7902` noVNC).
2. **Relay Core:** независимый async CDP-хэндлер для `Page.startScreencast` с политикой FIFO-1.
3. **Transport & Mapping:** переключение `BrowserStage.tsx` на поток вьюпорта и пересчёт координат клика.
4. **Acceptance:** сквозной прогон Juice Shop Steel Thread.
5. **Cleanup:** удаление legacy скриншот-путей и обновление тестового набора.

