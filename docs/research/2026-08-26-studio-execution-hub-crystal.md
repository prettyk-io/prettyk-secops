# Studio Execution Hub — Refinement Crystal

> **Статус:** `refine / crystallized` — Phase 2 Planning Pipeline (Keeper Output)  
> **Дата:** 26 августа 2026  
> **Источник:** raw concept `docs/research/2026-08-26-studio-execution-hub-concept.md`  
> **Каноны-якоря:** `sanctuary/pure/monitor-hub.md` · `studio-hub.md` · `studio-stack.md`  
> **Профиль:** `secops-lab-pure`

---

## 1. Refine (Очистка гипотез)

- Smooth Rewind — не видеоплеер и не WebGL с нуля. Это state-replay над evidence-snapshots с CSS-переходами. WebGL — только для War Zone и только при падении DOM ниже 30fps.
- View 3 (Deep Forensics) — разбито на фазы: trace-заголовок + grep (сейчас) vs SSH/Splunk-коннектор (отдельный продукт).
- War Zone ≠ Canvas ≠ BrowserPanel. Три разные поверхности.
- Monitor `:8767` остаётся для внешнего доступа и headless. Studio потребляет тот же SSE через внутренний WS-мост.

---

## 2. Crystallize (Три фазы Studio)

```
AUTHORING → EXECUTION → FORENSICS
  Canvas     View 1     View 3
  Explorer   View 2     Rewind
  Editor    Controls    Trace
```

Поток: `Runtime → Live Server SSE → Internal WS Bridge → View 1/2/3`.

Каноны: один SSE-источник, Execution блокирует Authoring, Evidence-First Rewind, плавность = `requestAnimationFrame` + CSS transitions.

---

## 3. Design Insights

- Top Bar: `[Authoring] [⚡ Execution] [🔍 Forensics]`.
- View 1: step tree + structured log + alert/evidence feeds.
- View 2: 25/25/50 лейаут, Recharts-телеметрия, SVG War Zone, 60fps.
- View 3: таймлайн + AI-grep + trace-результаты.
- Rewind Bar: `⏪ ⏮ ▶/⏸ ⏭ ⏩`, анимированные переходы, War Zone reverse replay.

---

## 4. Partitioning (5 стримов)

| Stream | ID | Суть |
|---|---|---|
| **1** | `EXEC-LIVE-BRIDGE` | WS-мост Studio ↔ Live, единый event bus |
| **2** | `MONITOR-NATIVE-VIEW` | View 1: step tree, structured log, alert/evidence feeds |
| **3** | `WAR-ROOM-TELEMETRY` | View 2: Recharts, LED-индикаторы, 60fps War Zone |
| **4** | `SMOOTH-REWIND-ENGINE` | State-replay над evidence-snapshots, cross-view |
| **5** | `TRACE-CONNECTOR-SHELL` | View 3: Trace header, grep, AI-assist, foundation |

---

## 5. Supply Forward

Передано Boss (DeepSeek Pro) — 5 карточек с GWT, стек React/shadcn/ui, каноны monitor-hub/studio-hub/studio-stack.