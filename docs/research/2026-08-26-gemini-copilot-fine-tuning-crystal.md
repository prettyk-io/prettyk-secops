# Gemini Domain-Tuned Advisory Core — Refinement Crystal

> **Статус:** `refine / crystallized` — Phase 2 Planning Pipeline (Gemini Keeper Output)  
> **Дата:** 26 августа 2026  
> **Источник:** 3-раундовый research Luna (`docs/research/2026-08-26-gemini-copilot-fine-tuning-concept.md`)  
> **Цель:** превратить cloud Gemini из generic-драйвера в доменного супер-консультанта для non-AirGap  
> **Профиль:** non-AirGap only (AirGap → Local Qwen / Deterministic Core)

---

## 1. Refine (Очистка гипотез)

- LoRA/QLoRA не работают на закрытом managed Gemini — только Vertex AI managed endpoint/revision.
- RL / Preference Tuning — отложены. Старт строго с Supervised Fine-Tuning (SFT).
- AI Studio — песочница для экспериментов. Продуктовый контур — только Vertex AI.
- Tuned Gemini — не третий провайдер, а **revision внутри Gemini provider**.

---

## 2. Crystallize (Триада)

$$
\text{Tuned Gemini (Поведение)} + \text{RAG (Актуальный Контекст)} + \text{Deterministic Core (Закон и Evidence)}
$$

Поток: `Intent → Deterministic Pre-Flight → Local RAG/Context Bus → Tuned Gemini Advisor → Deterministic Gatekeeper → Workspace Change`.

### Железные каноны:
- **Zero-Secret Invariant:** только synthetic/sanitized данные.
- **Fail-Closed Budget Guard:** 1.5× multiplier, soft/hard лимиты, честный fallback.
- **Evidence-Only Grounding:** без ссылки на Step Evidence ID — не подтверждено.

---

## 3. Design Insights (UX)

- Admin: карточка Gemini с переключателем Standard / Tuned Revision, полями Region, Revision ID, Dataset Hash, Budget Gauge.
- Buddy: provenance-бейджи (`[ 🟣 Tuned v1.2 ]`, `[ 🔵 Generic ]`, `[ 🟢 Qwen ]`, `[ ⚪ Deterministic ]`).
- Семантическая разметка: факт (сплошная линия + evidence ref), гипотеза (курсив + плашка).

---

## 4. Partitioning (4 стрима)

| Stream | ID | Суть |
|---|---|---|
| **1** | `ML-DATA` | Data Curation & Sanitization Pipeline — CLI, redact, JSONL для 6 task families |
| **2** | `ML-EVAL` | Side-by-Side Benchmark & Regression Harness — 50+ frozen сценариев, метрики |
| **3** | `ML-ROUTING` | Vertex AI Tuned Client & Admin Matrix Card — endpoint, Budget Guard, fallback |
| **4** | `ML-UX` | Buddy Advisory & Provenance — бейджи, факт/гипотеза, pre-approval gate |

---

## 5. Supply Forward

Передано Boss (DeepSeek Pro) для нарезки бэклога с GWT Acceptance Criteria.
Копипаста: 4 карточки с контрактами, AirGap isolation, TypeScript/Python, fail-closed budget.