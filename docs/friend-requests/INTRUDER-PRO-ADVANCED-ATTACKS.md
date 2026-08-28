# FRIEND-REQUEST: INTRUDER-PRO — Продвинутые режимы атаки (Pitchfork & Cluster-Bomb)

> **Статус:** `lane: ready`  
> **Дата:** 17 августа 2026  
> **Авторы:** Boss (Bro 40% + Flash 60%)  
> **Профиль:** `secops-lab-pure` (Default Коробка)  
> **Контекст:** Эволюция CD-7 (собственный фаззер) — от простого Sniper к полной Burp Intruder-семантике.

---

## 1. Проблема и Ценность

Фаззер `CorpusFuzzer` из CD-7 поддерживал только **sniper-режим** (один набор пейлоадов, по очереди в каждую позицию). Для глубокого пентеста этого мало — нужны мультипозиционные атаки:

- **Battering Ram** — один пейлоад одновременно во все позиции.
- **Pitchfork** — свой список на каждую позицию, итерация параллельно.
- **Cluster Bomb** — декартово произведение всех списков (комбинаторный взрыв).

Цель — расширить Python-движок (`orchestrator/corpus/fuzzer.py`) и TS-движок (`studioFuzzEngine.ts`) до полной Burp-семантики, с UI-селектором режимов и мульти-словарями в Studio.

---

## 2. Реализованный скоуп (As-Built)

### Python Backend (Bro):
- **`orchestrator/corpus/fuzzer.py`**:
  * `generate_mutations(mode, payload_sets)` — поддержка `sniper`, `battering_ram`, `pitchfork`, `cluster_bomb`.
  * Хелперы `_positions()`, `_apply_payload()`, `_per_position_sets()`.
  * `_pitchfork_mutations` — параллельная итерация, короткий набор зацикливается на последнем.
  * `_cluster_bomb_mutations` — декартово произведение с лимитом `count`.
  * `_battering_ram_mutations` — один пейлоад во все позиции.
- **Тесты:** `orchestrator/tests/test_fuzzer.py` — **18/18 passed** (+6 новых: battering_ram, pitchfork с/без наборов, cluster_bomb декартово + лимит, default sniper).

### TS Engine (Flash):
- **`cosmo/src/studio/fuzzing/studioFuzzEngine.ts`**:
  * `buildAttackRequests(baseMethod, baseUrl, positions, payloadSets, mode)` — Burp-семантика: sniper (N×P), ram (P), pitchfork (параллельная итерация с фолбэком на оригинал), cluster bomb (декартово с лимитом 50k).
  * `computeTotalRequests(mode, positions, payloadSets)` — подсчёт до старта.
  * `ATTACK_MODES` — мета-данные 4 режимов (🎯 Sniper, 🔨 Battering Ram, 🍴 Pitchfork, 💣 Cluster Bomb).
  * `PAYLOAD_PRESETS` — 5 быстрых пресетов словарей (SQLi, XSS/SSTI, Path Traversal, Admin Logins, Boundary).
  * `splitReflectionHighlight` — подсветка отражённого пейлоада в ответе.
  * `applyPayloadToTarget` — хелпер подстановки в query/body.

### Studio UI (Flash):
- **`cosmo/src/studio/fuzzing/StudioFuzzPanel.tsx`**:
  * `Select<AttackMode>` с 4 режимами и тултипами.
  * Мультиселект позиций (mode="multiple").
  * Вкладки Payload Set 1..N для Pitchfork/Cluster Bomb.
  * Кнопки быстрой загрузки пресетов.
  * Счётчик запросов `computeTotalRequests`.
  * Фильтры: 5xx/аномалии, Diff > 0, медленные (>1s).
  * Подсветка отражения в Raw Response.

---

## 3. Верификация и Тесты

- **Python:** `test_fuzzer.py` — **18/18 passed**.
- **TypeScript:** `studioFuzzEngine.test.ts` — **16/16 passed** (buildAttackRequests 4 режима + computeTotalRequests + buildFuzzRequests + executeFuzzRequest).
- **StudioFuzzPanel.test.tsx** — **6/6 passed** (рендеринг заголовка, кнопки, плейсхолдер, пейлоады).
- **Всего:** **40 тестов** зелёные.
- `tsc --noEmit` — 0 ошибок.

---

## 4. Стены и ограничения

- Cluster bomb ограничен 50 000 запросов (safety valve).
- Маркерный режим (`§payload§` / `{MASK}`) не расширен на pitchfork/cluster_bomb (только sniper).
- Payload Sets в UI — текстовые поля (не файловые загрузчики).
- `docs/wired.json` не менялся.
- Стили: тёмная тема, скругления 5–6px, JetBrains Mono для кода.