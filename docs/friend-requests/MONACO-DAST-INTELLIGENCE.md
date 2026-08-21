# MONACO-DAST-INTELLIGENCE: умный редактор для DAST

> `lane: ready` · 20 авг 2026. Profile: `secops-lab-pure`.

## Тезис

Monaco-редактор в Studio получает доменный DAST-интеллект: валидацию манифеста в реальном времени, security-диагностику, зеркалирование трафика при прогоне и контекстные подсказки из результатов паука.

## Из скоупа исключено (парковка)

**DOM Scanner Panel** и **Corpus Awaken (LLM)** — исключены из текущей поставки. Причина: сначала отлаживаем детерминированный движок перебора словарей на сухую, потом понимаем метрики, и только затем подключаем LLM как ассистента поверх. Без работающего базового движка LLM-подсказки не с чем сравнивать — нет метрик, нет A/B, нет ответа для аудиторов ЦБ.

## Фаза 1: JSON Schema валидация в Monaco (Boss, 1 день)

### Что сейчас
Валидация конструкторов — только через playground `:8765`. Редактор не показывает ошибки до отправки.

### Что должно быть
Monaco показывает красные подчёркивания для ошибок в конструкторе сразу при вводе, без отправки на бэкенд. Базовая клиентская валидация синтаксиса PrettyK (не парсинг — только структура).

**Дано:** оператор пишет конструктор в Monaco.
**Когда:** строка не соответствует базовому синтаксису (например, нет типа локатора после `Нажать`).
**Тогда:** Monaco подсвечивает строку красным с сообщением об ошибке.

**DoD:** ошибки базового синтаксиса подсвечиваются в редакторе мгновенно, без задержки на playground.

## Фаза 2: Live DOM Scanner Panel (Boss + Flash, 3 дня)

### Что сейчас
Оператор переключается между Burp/браузером и Studio, чтобы узнать селекторы, URL'ы, параметры форм.

### Что должно быть
Параллельная панель справа от Monaco, показывающая live DOM-дерево сканируемой страницы. Клик по DOM-элементу — вставляет готовый локатор в редактор.

**Дано:** открыт редактор, запущен паук на `target.io/login`.
**Когда:** в DOM-панели видна форма `#login` с полями `input[name=user]`, `input[name=pass]`.
**Тогда:** клик по `input[name=user]` вставляет `Браузер|ввод|css "input[name=user]"|` в текущую позицию редактора.

**Архитектура:**
- CDP Chrome `:9222` в фоне
- Spider → DOM extract (inputs, forms, links, cookies, headers)
- WebSocket/SSE из Live в Studio Panel
- Monaco `executeEdits` для вставки локатора

**DoD:** DOM-панель видна справа от редактора. Элементы кликабельны. Вставка работает.

## Фаза 3: Corpus Awaken — умный автокомплит (Flash, 3 дня)

### Что сейчас
Оператор вручную пишет фаззинг-словари или выбирает пресеты без привязки к контексту страницы.

### Что должно быть
Qwen3-1.7B анализирует DOM-контекст и предлагает релевантные корпуса прямо в Monaco completions.

**Дано:** DOM-сканер нашёл `input[type=text][name=q]` на странице поиска.
**Когда:** оператор печатает `Браузер|ввод|#q|` и вызывает автокомплит.
**Тогда:** Monaco показывает:
- `corpus.search.sqli_basic` — "SQLi basic set для текстового поля поиска"
- `corpus.search.xss_reflected` — "XSS reflected"
- `corpus.search.cmd_injection` — "Command injection"

**Архитектура:**
- DOM Scanner → extracted inputs + context
- Qwen3-1.7B (thinking=off) → corpus suggestions (JSON)
- Monaco `CompletionItemProvider` → inline completions

**DoD:** автокомплит предлагает корпуса на основе реального DOM-контекста страницы.

## Фаза 4: Security Diagnostics (Flash, 2 дня)

### Что сейчас
Нет проверок security best-practices в редакторе. Оператор может забыть аутентификацию, passive scan, файловый фаззинг.

### Что должно быть
Второй слой Monaco markers — не синтаксис, а security-рекомендации.

| Маркер | Правило |
|---|---|
| 🟠 Warning | Нет аутентификации для таргета |
| 🟡 Info | Active scan без passive baseline |
| 🔴 Error | Редирект на внешний домен не в allowlist |
| 🔵 Hint | На странице есть file input, но нет file upload фаззинга |

**Реализация:** чистый TypeScript, ~200 строк правил. Без LLM.

**DoD:** markers показываются при открытии/редактировании манифеста.

## Фаза 5: Live Traffic Mirror (Flash, 3 дня)

### Что сейчас
При прогоне оператор видит логи в Live Monitor, но не видит привязку «строка в манифесте → HTTP-ответ».

### Что должно быть
При запущенном прогоне — traffic mirror в Monaco: inline annotations справа от каждой строки показывают HTTP-статус и время ответа.

```
 2 │ ОткрытьПоURL https://target.io/login
   │ → 200 OK  342ms  text/html  12KB
 3 │ Браузер|ввод|css "#user"|admin
   │ → DOM event dispatched
```

**Архитектура:**
- Live Monitor `:8767` SSE → Studio подписывается
- Парсинг соответствия «строка → HTTP response»
- `monaco.editor.deltaDecorations()` — inline annotations

**DoD:** при прогоне строки редактора показывают HTTP-статусы справа.

## Фаза 6: Smart Completions из состояния скана (Flash, 2 дня)

### Что сейчас
Оператор вручную вводит URL'ы.

### Что должно быть
После паучьего прогона Monaco completion подхватывает найденные URL'ы с их HTTP-статусами.

```
ОткрытьПоURL █
  ▸ /login          (200)
  ▸ /dashboard      (302→200)  
  ▸ /api/users      (401)
  ▸ /admin          (403)
  ▸ /backup.zip     (200 ⚠️)
```

**DoD:** автокомплит URL'ов показывает результаты паука с кодами ответов.

## Приоритет

| Фаза | Кто | Дней | Зависит |
|---|---|---|---|
| 1. JSON Schema validation | Boss | 1 | — |
| 2. DOM Scanner Panel | Boss + Flash | 3 | — |
| 3. Corpus Awaken (LLM) | Flash | 3 | Фаза 2 + QWEN3-ALERT-ASSISTANT |
| 4. Security Diagnostics | Flash | 2 | — |
| 5. Traffic Mirror | Flash | 3 | KDT Live SSE |
| 6. Smart Completions | Flash | 2 | Фаза 2 |

## Out of scope

- Полный парсер PrettyK на клиенте (только базовая структура в Фазе 1)
- Замена playground-валидации клиентской (playground остаётся источником истины)
- WebSocket вместо SSE для Traffic Mirror (SSE достаточно для MVP)
- GPU-инференс для LLM (CPU, 1.7B)