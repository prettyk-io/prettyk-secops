# AI-SPATIAL-CANVAS-TELEMETRY: Векторные трассы, LED-фонари шагов и HUD-навигатор

> `lane: evolve` · 20 авг 2026. Profile: `secops-lab-pure`.
>
> **Добавлено/поправлено: Gemini — Spatial Telemetry & Cybernetic Canvas Design System, 20 августа 2026.**

## Тезис

Интерактивный граф Студии (`StudioGraphExplorer`) оснащается **пространственной телеметрией реального времени**:
1. Световые векторные трассы на рёбрах графа (Slow-Mo Beziers) с адаптивной скоростью, отражающей задержку сетевого ответа.
2. 4-позиционная матрица LED-фонарей в слотах шагов 32-строчного конструктора парящих форм (Emerald, Amber, Crimson, Violet Pre-light).
3. Контекстный микро-чип (Contextual HUD Whisperer 240 × 48 px) над активной нодой графа вместо перегруженных чат-ботов.
4. Резонанс фоновой сетки (Grid Resonance) и угловые скобы (Corner Reticles) вокруг центров активных вычислений.

## As-built якорь

- `cosmo/src/studio/graph/StudioGraphExplorer.tsx` — рендеринг канваса, парящих форм категорий и рёбер графа.
- `cosmo/src/studio/graph/GraphWaveOverlay.tsx` — существующий периметральный canvas wave движок (`#38BDF8` Cyan, `#A855F7` Violet, `#D946EF` Magenta).
- `cosmo/src/studio/graph/useGraphStore.ts` — хранилище позиций, зума и панорамирования канваса.
- `orchestrator/utils/live_server.py` — стриминг событий Diary SSE и метаданных.
- `pure/research/AI-SPATIAL-TELEMETRY-DESIGN-SYSTEM-GEMINI.md` — мастер-спецификация цветов, физики и CSS-анимаций.

## Архитектура

```
 Live Diary Events (SSE / WebSocket)
        │
        ▼
 GraphTelemetryBus (Frontend Event Normalizer)
        │
   ┌────┴───────────────────────────────┐
   ▼                                    ▼
[SVG Telemetry Layer]           [Step Slot LED Matrix]
 • Slow-mo photon trails         • Emerald Solid (OK)
 • Adaptive speed (∝ latency)    • Amber Breathing (Warning)
 • Active branch highlighting    • Crimson Strobe (Fail)
 • Subgraph pruning (dimming)    • Violet Glimmer (AI Pre-light)
                                        │
                                        ▼
                               [Contextual HUD Whisperer]
                                • 240x48px Micro-Chip above Node
                                • Line 1: Realtime Telemetry Fact
                                • Line 2: Advisory AI Whisper
```

## Что делает

### Given: scanner выполняет сканирование эндпоинта
**When:** scanner Spider или Active Scan посылает запросы к Juice Shop.
**Then:**
- Ребро между сценарием и нодой scanner на графе загорается `Cyan Slow-Mo Pulse` (#00F0FF).
- Скорость светового импульса пропорциональна latency (быстрый ответ = 0.6s, долгий ответ = 3.5s slow-mo).
- Неактивные ветки графа (например, Selenium Grid или Auth Vault) приглушаются до `opacity: 0.25`.
- В слоте активного шага парящей формы пульсирует бирюзовый LED (`◉ RUN`).

### Given: Шаг сценария завершился
**When:** Live Diary фиксирует `step.completed`.
**Then:**
- LED-фонарик в слоте шага вспыхивает изумрудным (`● OK`, #10B981) на 2 секунды, затем переходит в спокойный статический режим.
- Если шаг упал — рубиновый стробоскоп (`✖ FAIL`, #EF4444) + подсветка лога ошибки.
- Следующий шаг в очереди кратковременно подсвечивается фиолетовым отблеском (`◌ PRE`, #A855F7) на основе предсказания Qwen3.

### Given: Модель зафиксировала аномалию на активном узле
**When:** Qwen3 обнаруживает подозрительный паттерн ответа.
**Then:**
- Над нодой всплывает компактный чип HUD Whisperer (240 × 48 px):
  ```text
  [scanner Active Scan · 14.8s · 982 URLs]
  💡 Обнаружен паттерн Blind SQLi на /rest/products/search (параметр q)
  ```
- Клик по чипу открывает детальный дамп в боковой панели.

## Этапы реализации

### Этап 1: Reactive LED Matrix в слотах шагов (Flash, 3 часа)
- Компонент `StepLanternLed.tsx` в `cosmo/src/studio/graph/`.
- Интеграция в `.kdt-graph-category-slots` и строки 32-строчного конструктора.
- 4 канонических состояния: Emerald, Amber, Crimson, Violet.
- CSS-анимации пульсации и свечения согласно Design System.

**DoD:** Слоты шагов динамически меняют цвет и анимацию при получении событий из Live SSE.

### Этап 2: SVG/Canvas Photon Trails на рёбрах (Flash, 4 часа)
- Расширение `GraphWaveOverlay.tsx` или добавление `GraphTelemetryOverlay.tsx`.
- Рендеринг кривых Безье со `stroke-dashoffset` анимацией вдоль активных рёбер.
- Адаптивная кинетика: скорость пропорциональна времени ответа сервера.
- Затухание неактивных веток графа (`Smart Subgraph Pruning`).

**DoD:** При старте сканирования световой луч бежит от сценария к scanner-ноде с физически обоснованной скоростью.

### Этап 3: Contextual HUD Whisperer (Flash, 3 часа)
- Компонент `NodeHudWhisperer.tsx` (240 × 48 px, glassmorphism).
- Автоматическое позиционирование над активной нодой графа.
- Двухстрочный вывод: Телеметрия фактов + AI-интерпретация.
- Клик-навигация к исходному свидетельству (Evidence Drawer).

**DoD:** HUD-чип плавно появляется над активным узлом и не мешает панорамированию/зуму канваса.

### Этап 4: Backend Telemetry Event Bus (Boss, 2 часа)
- Эмиттер легковесных событий телеметрии в `orchestrator/utils/live_server.py`.
- События: `telemetry.step_start`, `telemetry.step_end`, `telemetry.edge_pulse`, `telemetry.ai_whisper`.
- Строгий контракт без блокировки основного пайплайна сканирования.

**DoD:** SSE-стрим `:8767/api/diary` транслирует нормализованные события телеметрии с latency < 50ms.

## Out of scope

- Чат-боты и диалоговые окна на канвасе.
- Автоматическое вмешательство в ход исполнения без клика оператора.
- Тяжелые 3D WebGL движки (всё строится на 2D Canvas + CSS GPU transforms).

## Технические требования

- Палитра: строго по Design System (#00F0FF, #A855F7, #F59E0B, #10B981, #EF4444).
- 0 FPS / 0% CPU overhead при простое (Canvas Idle Detection).
- Fail-closed: если AI выключен, LED-фонари работают по детерминированным событиям, а AI Pre-light скрывается.

**Добавлено/поправлено: Gemini — Spatial Telemetry & Cybernetic Canvas Design System, 20 августа 2026.**
