# Studio Stack — канон фронтенд-зависимостей

> **CANON** — hub topic. Slice: **22 августа 2026** (2FA sealed: утверждён стек PrettyK Studio, ход на shadcn/ui + Tailwind v4 + React Flow; antd — legacy).
>
> Документ-источник: [`../future-design-vision.md`](../future-design-vision.md). Это narrative-версия горизонта. Настоящий файл — machine-канон решений.

---

## 1. База (immutable, не обсуждается)

| Слой | Зависимость | Версия (lock) | Лицензия | Комментарий |
|---|---|---|---|---|
| Runtime | `react`, `react-dom` | 18.3.1 | MIT | Не обновлять на 19 в рамках редизайна |
| Бандлер | `vite` | 8.1.5 | MIT | Стабильная линия |
| Язык | `typescript` | 6.0.3 | Apache-2.0 | |
| Редактор кода | `monaco-editor`, `@monaco-editor/react` | 0.56.0 / 4.7.0 | MIT | Безальтернативен. Web Workers, keep-alive |
| Глобальное состояние | `zustand` | 5.0.15 | MIT | Единый store: тема, панели, UI-команды |
| Command palette | `cmdk` | 1.1.1 | MIT | |
| Virtual list | `@tanstack/react-virtual` | 3.14.9 | MIT | |
| Тесты | `vitest`, `@playwright/test` | 4.x / 1.62 | MIT | |
| Entity-граф | Самописный SVG | — | — | `studio/graph/` (16 файлов). Не трогать. Отвечает за обзорный граф проекта (категории, связи сущностей). |

---

## 2. Новые зависимости (утверждены, 2FA)

| Слой | Зависимость | Лицензия | Статус | Комментарий |
|---|---|---|---|---|
| **Canvas-редактор** | `@xyflow/react` (React Flow v12) | MIT | **Установлен** | Smoke: `ScenarioCanvas.tsx`, 7 нод, custom node, minimap, controls. Роут `#/canvas`. |
| **UI-примитивы** | `shadcn/ui` (Radix UI) | MIT | **Установлен** | `components.json`, `src/lib/utils.ts`, Button, Input. Tailwind v4 + dark theme. |
| **Admin-контур** | `@mui/material` + `@mui/x-data-grid` + `@mui/icons-material` | MIT | **установлено** | Зона `src/admin/` (Findings/Runs/Overview, Evidence) и `src/design-admin/`. Двухконтурная стилистика: MUI — админка, shadcn/Radix — Studio. |
| **Стилизация** | `tailwindcss` v4 | MIT | **Установлен** | Плагин `@tailwindcss/vite`, файл `src/tailwind.css`, CSS-переменные shadcn. |

---

## 3. Зависимости на потом (gate не пройден)

| Слой | Кандидат | Когда |
|---|---|---|
| Серверное состояние | TanStack Query | После стабилизации API-слоя |
| Plots / Charts | Recharts (MIT) | При миграции с `@ant-design/plots`. Пока plots остаются с antd |
| React 19 | — | Отдельная задача, не смешивать с редизайном |

---

## 4. Что НЕ добавляем

| Отклонено | Причина |
|---|---|
| Jotai (второй state-слой) | Zustand + внутренний store React Flow покрывают потребности. Добавить только при доказанной проблеме лишних перерисовок |
| Mantine, HeroUI, NextUI | Уступают shadcn/ui в контроле над кодом |
| Cytoscape.js, G6 | React Flow — лучшая модель для React-нодного редактора |
| CSS Modules | Tailwind v4 + custom properties дают больше продуктивности |

---

## 5. Миграция с antd

antd (`5.29.3`) + Pro Components + Plots — **legacy-слой**.

Принципы миграции:
- новый Studio-shell на shadcn/ui + Tailwind появляется рядом, а не вместо;
- существующие страницы не переписываются ради чистоты дерева;
- antd вытесняется по одной поверхности за раз;
- `--pk-*` design tokens — мост между старой и новой системой;
- keep-alive для Monaco сохраняется.

---

## 6. Лицензии и airgap

Все новые зависимости — MIT. Перед первым релизом коробки с новым стеком:
- зафиксированный `package-lock.json`;
- `license inventory` по всему дереву;
- SBOM;
- локальный кэш npm-пакетов;
- проверка `vite build` + `vite preview` без доступа к интернету.

---

## 7. Стоп-гейты (перед массовой миграцией)

- [x] React Flow smoke: `ScenarioCanvas.tsx`, 7 нод, drag, zoom, minimap, custom nodes. Роут `#/canvas`.
- [x] shadcn/ui + Tailwind: Button, Input, шапка, сайдбар, инспектор, консоль в `StudioV2`. Роут `#/studio-v2`.
- [x] Step Deck Node (SC-4): капсульная нода сценария, сворачивание/разворачивание, счётчик шагов.
- [x] Pill-Based Step Row (SC-5): пилюли действия/стратегии/значения, drag-перестановка, LED-индикатор.
- [x] Two-Way Wired Synchronizer (SC-6): Pill UI ↔ DSL ↔ Wired JSON, `useScenarioDeckWire`.
- [x] Step Debug (SC-7): кнопка ▶, эндпоинт `/api/run/step`, валидация конструктора.
- [x] CDP Browser Pane (SC-8): `browser_service.py` (status/navigate/screenshot/highlight/eval), `BrowserPanel.tsx`, вкладка «Браузер» в правой панели StudioV2, синхронизация клик-на-строке → подсветка элемента.
- [ ] War Room (WR-1…8): код сдан. proper test: запуск с реальным прогоном, SSE-телеметрия, визуальная проверка 5 фаз.
- [ ] Золотая user journey: открыть Studio → граф → браузер → записать действие → запустить.
- [ ] Стили, визуальная полировка, default theme. Без этого в канон не закрывать.

---

*22 августа 2026. Обитель. Канон.*