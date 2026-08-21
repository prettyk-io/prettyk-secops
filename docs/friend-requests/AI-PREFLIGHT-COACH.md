# AI-PREFLIGHT-COACH: Семантический аудит манифеста перед запуском

> `lane: evolve` · 20 авг 2026. Profile: `secops-lab-pure`.
>
> **Добавлено/поправлено: Gemini — Spatial Telemetry & Cybernetic Canvas Design System, 20 августа 2026.**

## Тезис

Перед стартом прогона Qwen3-1.7B проверяет манифест на **семантическую разумность и логические несоответствия** (в дополнение к синтаксической валидации Monaco):
1. **Auth Consistency:** Создан ли контекст аутентификации, но забыт вызов `ПрименитьAuth`? Задан ли `Bearer Token` без переменной окружения?
2. **Orphan Detection:** Находит «сиротские» сущности — фаззеры, не вызванные ни в одном сценарии; page models, к которым никто не обращается.
3. **Scan Sanity:** Проверяет таймауты сканирования против объема целевого приложения (например, spider timeout 1 мин на 982 URL).
4. **Target Mismatches:** Несоответствие хостов в сценариях и коннекторах.

## As-built якорь

- `cosmo/src/monaco/penguinDiagnosticsGate.ts` — блокирующий синтаксический гейт.
- `cosmo/src/App.tsx` — кнопка запуска и валидации манифеста.
- `orchestrator/models/manifest.py` — Pydantic модель манифеста.
- `orchestrator/lab/llm_server.py` — endpoint для предполётного анализа.

## Архитектура

```
  [ Manifest JSON in Editor ]
               │
               ▼
  [ Monaco Syntax Gate ] ──(If Valid)──► [ AI Pre-Flight Coach ]
  (Hard Errors: Red Block)               POST /api/ai/preflight
                                                  │
                                                  ▼
                                         [ Amber Advisory Chips ]
                                          • "Auth defined but not applied"
                                          • "Orphan Fuzzer detected"
                                          • "Spider timeout < 3min"
```

## Что делает

### Given: Оператор нажимает «Запустить» в Студии / Редакторе
**When:** Синтаксическая валидация Monaco прошла успешно.
**Then:**
- Модель выполняет быстрый аудит (< 250ms, non-thinking mode) и возвращает предупреждения:
  - *Amber Warning:* «Контекст `juice_auth` объявлен, но шаг `ПрименитьAuth` отсутствует в сценарии `juice_shop_test_1`. Запустить без авторизации?»
  - *Orphan Info:* «Фаззер `juice_fuzz_search` не используется ни в одном сценарии. Нода на графе приглушена.»
  - *Sanity Tip:* «Spider timeout = 1 мин. Для 982 эндпоинтов рекомендуется ≥ 3 мин.»
- Предупреждения выводятся в виде ненавязчивых чипов над кнопкой Run. Оператор может запустить прогон в один клик либо исправить настройки.

## Этапы реализации

### Этап 1: Backend Pre-flight Endpoint (Boss, 2 часа)
- `POST /api/ai/preflight` в `llm_server.py` с GBNF-схемой.
- Анализ связности сущностей: Scenarios ↔ Auth ↔ Fuzzers ↔ Connectors.

### Этап 2: Pre-flight UI Strip в Editor / Studio (Flash, 3 часа)
- Компонент `PreflightAdvisoryStrip.tsx` рядом с кнопкой Launch.
- Приглушение сиротских нод на графе (`orphan` visual state).
- Чипы с быстрыми действиями («Исправить таймаут на 3 мин», «Игнорировать»).

## Out of scope

- Блокировка запуска (блокировать имеет право только детерминированный синтаксический Monaco Gate).
- Автоматическая правка кода манифеста без подтверждения оператора.

**Добавлено/поправлено: Gemini — Spatial Telemetry & Cybernetic Canvas Design System, 20 августа 2026.**
