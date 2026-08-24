# Design Workbench — дизайнерский верстак PrettyK

> **Sanctuary. Satellite / Service-needs.** Не канон ядра, не бэклог.  
> Внутренний полигон дизайн-системы для продуктового дизайнера и инженерной команды PrettyK.  
> Срез: **23 августа 2026**.  
> **Статус:** `satellite / service-needs` (2FA sealed). Чистый `shadcn/ui + Tailwind v4`.

---

## 1. Что это

Интерактивный одностраничный полигон (**`#/design-playground`**) — живая лаборатория визуального стиля и компонентных паттернов PrettyK SecOps Suite.  
Позволяет дизайнеру и фронтенд-инженерам в реальном времени:
- Переключать 8 глобальных дизайн-пресетов (Cyber Neon, Vapor Glassmorphism, Neubrutalism, Minimalist Underline, Soft Pill, Terminal CLI, Gradient Stroke, Dense Enterprise).
- Мгновенно менять 16 цветовых тем (Cyber, Zinc, Slate, Noir, Emerald, Crimson, Amber, Ocean, Rose, Stone, Mono, Indigo, Teal, Solar, Gold, Frost Light) через live CSS variables.
- Применять 12 наборов формы и анимации компонентов (Component Style Packs: Sharp, Pill, Neubrutalism, Glassmorphism, Minimal, Chunky, Elevated, Glitch, Organic, Retro, Liquid, Precision).
- Исследовать мульти-стилевой движок иконок (140+ векторных Lucide-ассетов в 8 начертаниях: Outline, Duotone, Neon Glow, Glass Pod, Neubrutalism, Gradient, Terminal, Gold).
- Тестировать компоненты во всех состояниях (Normal, Hover, Focus-visible, Disabled, Loading) и 3 режимах плотности (Compact / Comfortable / Spacious).
- Изучать 12 специализированных SecOps-инпутов (OTP Grid, Protocol Addons, Shortcut Badges, Steppers, Monospace DSL).
- Прототипировать боевые SecOps-формы и экспериментировать в интерактивной песочнице Tailwind Workshop.

**Точка входа:** кнопка в подвале HomePage → `#/design-playground`.

---

## 2. Архитектура верстака (4 рабочих пространства)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Home] [pretty< DESIGN WORKBENCH] [SecOps 2026]         [Stage Canvas ▾] [Preset ▾]    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [🎨 Theme Studio]  [🧩 Component Catalog]  [🛡️ SecOps Patterns]  [⚡ Tailwind Workshop]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Пространство | Что содержит | Назначение |
|---|---|---|---|
| **1** | **Theme Studio** | 16 Color Themes · 12 Shape & Motion Packs · Brandbook & Gradients · Typography & Wordmarks · Spacing & Depth · Multi-Style Icon Gallery (140+ иконок в 8 стилях) | Единый пульт визуального стиля, дизайн-токенов и ассетов |
| **2** | **Component Catalog** | Core Matrix (15 примитивов с переключателем плотности и стресс-тестом) · Input Particles (12 SecOps-инпутов) · Buttons & Switches (8 специализированных контролов) | Авторитетная витрина всех базовых компонентов платформы |
| **3** | **SecOps Patterns** | Live Suites: Target & Scope Configurator, Attack Matrix Radio Cards, OWASP Vulnerability Checkbox Cards, Execution Sliders (Workers/RPS), Wordlist Dropzone, Live Launch Simulation | Прототипирование реальных рабочих форм сканирования |
| **4** | **Tailwind Workshop** | Designer-First Toolkit (Figma 1:1 token bridge, design in constraints), Designer Resources & Tutorials (Figma Kits, DesignCourse, Tailwind Play v4), Cheat Sheet Tables, Interactive Live Sandbox | Мост между дизайном (Figma) и кодом (Tailwind v4), быстрое прототипирование |

---

## 3. Ключевая механика воркбенча

- **Batch Style Morph:** выбор любого из 8 пресетов мгновенно перестраивает форму, рамки, свечения и анимации компонентов на всем полигоне.
- **Zero Antd:** 100% чистый код на нативных `shadcn/ui` и `@radix-ui` примитивах + Tailwind v4.
- **Zero Copy-Drift:** сниппеты копируются прямо в формате рабочего кода платформы.
