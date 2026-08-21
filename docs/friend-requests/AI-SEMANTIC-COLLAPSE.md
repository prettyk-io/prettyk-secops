# AI-SEMANTIC-COLLAPSE: Смысловая группировка алертов и фазирование сценариев

> `lane: evolve` · 20 авг 2026. Profile: `secops-lab-pure`.
>
> **Добавлено/поправлено: Gemini — Spatial Telemetry & Cybernetic Canvas Design System, 20 августа 2026.**

## Тезис

Qwen3-1.7B производит **семантическую компрессию (Semantic Collapse)** двух уровней:
1. **Finding Cluster Synthesis:** Схлопывает 5000 сырых алертов ZAP в 4–5 осмысленных историй безопасности (Exploit Families), объединяя побочные эффекты одной уязвимости (например, SQL Injection + Error Disclosure на одном эндпоинте).
2. **Scenario Phase Folding:** Схлопывает 32 строки элементарного конструктора сценария в 3–5 высокоуровневых фаз атаки (Bootstrap, Reconnaissance, Injection Surface, Extraction, Teardown).
3. **Spider URL Hierarchy:** Группирует 982 найденных URL по функциональным доменам (`/api/*`, `/rest/*`, `/#/login`, `/assets/*`).

## As-built якорь

- `orchestrator/finding_collapse.py` — детерминированное схлопывание по fingerprint (Level 0).
- `cosmo/src/admin/DojoFindingsTable.tsx` — отображение таблицы находок.
- `cosmo/src/constructor/` — 32-строчный конструктор сценариев.
- `orchestrator/lab/llm_server.py` — endpoint для семантической группировки.

## Архитектура

```
  [ Raw ZAP Alerts / Constructor Steps ]
                   │
                   ▼ (Level 0)
     Deterministic Fingerprint Filter
                   │
                   ▼ (Level 1: AI Semantic Grouping)
  POST /api/ai/semantic-group (Qwen3 Non-Thinking)
                   │
                   ▼ (Level 2: Operator Presentation)
      Dynamic Folding UI (Dojo & Canvas)
```

## Что делает

### Given: 28 детерминированных находок после сканирования
**When:** оператор открывает результаты или таблицу находок.
**Then:**
- Модель объединяет связанные алерты в один кластер:
  ```json
  {
    "cluster_id": "cluster-sqli-search",
    "title": "Инъекции SQL и раскрытие стектрейса в поисковой подсистеме",
    "severity": "High",
    "member_findings": ["SQL Injection (40018)", "Application Error Disclosure (90022)"],
    "root_cause_hypothesis": "Непараметризованный запрос в SearchProductDAO",
    "systemic_remediation": "Использовать PreparedStatement или ORM Criteria API."
  }
  ```
- В UI кластер отображается одной раскрываемой строкой с бейджем участников.

### Given: 32 элементарных шага в конструкторе сценариев
**When:** оператор переключает режим отображения сценария в «Фазовый фокус».
**Then:**
- Шаги автоматически группируются в макро-фазы:
  - *Phase 1:* Auth & Session Init (шаги 01–06) — `[ 6/6 OK · 1.2s ]`
  - *Phase 2:* Attack Surface Injection (шаги 07–18) — `[ Active ]`
  - *Phase 3:* Verification & Reporting (шаги 19–32) — `[ Queued ]`
- Пользователь может развернуть любую фазу до микро-команд.

## Этапы реализации

### Этап 1: Endpoint семантической группировки на бэкенде (Boss, 3 часа)
- `POST /api/ai/semantic-group` в `llm_server.py` с GBNF-схемой.
- Вход: список схлопнутых алертов Level 0.
- Выход: строго типизированный массив `exploit_clusters` с обоснованием связей.

### Этап 2: Phase Folding Engine для конструктора (Flash, 3 часа)
- Анализ AST команд конструктора и автоматическая разметка фаз.
- Компонент `ScenarioPhaseFolder.tsx` в парящих формах.
- Переключение режимов: `Macro Phases` (высокий полет) ↔ `Micro Steps` (32 строки).

### Этап 3: UI-аккордеон в таблице находок (Flash, 3 часа)
- Группировка строк в `DojoFindingsTable.tsx` по `cluster_id`.
- Сохранение 100% доступа к исходным ID находок (zero-loss).

## Out of scope

- Автоматическое удаление или маскирование алертов без согласия оператора.
- Перестановка шагов сценария в конструкторе.

**Добавлено/поправлено: Gemini — Spatial Telemetry & Cybernetic Canvas Design System, 20 августа 2026.**
