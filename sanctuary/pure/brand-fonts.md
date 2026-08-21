# BRAND-FONTS: библия шрифтов (wordmark / UI / code / docs)

> **CANON** — hub topic. Slice: **16 августа 2026** (2FA: зачисление по явной просьбе владельца).
> Реестр: [`INDEX.md`](INDEX.md). Смежное: [`brand-strategy.md`](brand-strategy.md) §3 (шрифты, два зверя),
> [`brand-video.md`](brand-video.md), [`monitor-header.md`](monitor-header.md). Патчи через 2FA.

## 1. Правило одного предложения

**body ≠ wordmark.** Текст решает читаемость, wordmark — характер. Текст подбираем из готовых OFL-шрифтов,
wordmark рисует дизайнер за деньги. Буквы сами не рисуем. Связка «PrettyK» (мастербренд) + «SecOps Lab»
(дескриптор) — набрана body-шрифтом, это не второй wordmark.

## 2. Четыре категории (канон)

| Категория | Шрифт | Характер / назначение | Кириллица | Правообладатель | Лицензия |
|---|---|---|---|---|---|
| **UI / интерфейс / контролы** | **Golos UI** | neutral, узкий набор, формы, кнопки, меню | ✓ | ParaType Ltd | SIL OFL 1.1 |
| **Отчёты / длинный текст** | **Golos Text** | neutral, читаемость, body | ✓ | ParaType Ltd | SIL OFL 1.1 |
| **Docs / бланки / акты** | **PT Astra Sans** | гос-стандарт реквизитов, официальные документы | ✓ | JSC «RPA RusBITech» | SIL OFL 1.1 |
| **Code / logs / Monaco** | **JetBrains Mono** | monospace, лигатуры | ✓ | JetBrains Mono Project | SIL OFL 1.1 |

Порядок fallback в стеке UI: `Golos UI` → `Golos Text` → `Segoe UI` → `system-ui` → `sans-serif`.
Стек mono: `JetBrains Mono` → `Consolas` → `Segoe UI Mono` → `monospace`.
Стек бланков: `PT Astra Sans` → системный sans. Код в бланках: `JetBrains Mono` → системный mono.

## 3. Wordmark «PrettyK» — вне этой библии

| Путь | Цена | Риск |
|---|---|---|
| Премиум-шрифт (TypeType / Pangram Pangram / др.) | $500–5000 | EULA: logo-лицензия обычно отдельная и дороже |
| OFL + кастом-переделка буквы K | $0 + труд дизайнера | Reserved Font Name нельзя менять без разрешения |
| Леттеринг / рисованная K | максимально | максимальная цена, максимальная уникальность |

- **«SecOps Lab»** — текст body-шрифтом (Golos Text/UI), не wordmark. Товарный знак: регистрируется
  **PrettyK**, «SecOps Lab» — слишком generic, не регистрируется.
- Буква **K** — единственный акцентный элемент; делает PrettyK узнаваемым. Держится необычной, но
  не «выпендрёжной». Дизайнеру — отдельный бриф.

## 4. Формат поставки (airgap)

- **Self-host, без CDN / Google Fonts.** Всё вкомпилено в бандл (`cosmo/public/fonts/`).
- Сейчас — **TTF** (самодостаточно). Позже — **WOFF2** (пережатие, меньше вес, тот же глиф-контент).
- Каждый каталог семейства несёт `LICENSE.txt` (SIL OFL 1.1) + `COPYRIGHT.txt` (правообладатель).
- OFL 1.1: можно use / bundle / embed / redistribute, **нельзя** продавать сами файлы шрифтов.
  Требование «шрифты остаются под OFL» не распространяется на документы, созданные этими шрифтами.

## 5. Где лежит (as-built)

- `cosmo/public/fonts/{golos-text,golos-ui,jetbrains-mono,pt-astra-sans}/` — TTF + лицензии.
- `cosmo/src/styles.css` — `@font-face` для всех четырёх семейств.
- `cosmo/src/theme/tokens.ts` — `FONT_STACK` (Golos UI → Golos Text), `MONO_STACK` (JetBrains Mono).
- `cosmo/index.html` — Google Fonts удалён (Syne был мёртвый груз; JetBrains Mono теперь свой).
- `cosmo/src/results/blankHtml.ts` — PT Astra Sans (body) + JetBrains Mono (code) в скачиваемых бланках.

## 6. Честные границы

- «100% РФ» — про UI/reports/docs кириллицу (ParaType / RusBITech), а не про wordmark (там допускаем
  зарубежный премиум, если EULA позволит лого).
- Mono в стеке — JetBrains Mono, но это не «на край»: он полноправный член чарта, не запасной.
- Wordmark, слоган, лого — открытые позиции; канон фиксирует направление, не артефакты.
