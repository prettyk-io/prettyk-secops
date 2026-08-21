# BRAND-FONTS: библия шрифтов (wordmark / UI / code / docs)

`lane: ready` → **принят 16 авг 2026 (2FA одобрен).** Зачислен в hub как `brand-fonts.md`. См. `sanctuary/canon/brand-fonts.md`.

## Тезис

Фиксируем четыре категории шрифтов по назначению, языку, характеру и лицензии. Базовое правило:
**body ≠ wordmark.** UI/reports/docs обязаны кириллицей 100% РФ (ParaType / RusBITech), code — JetBrains Mono
(OFL), wordmark «PrettyK» — зона дизайнера (отдельно, out of scope).

Ключевое:
1. **UI + отчёты** — Golos Text (длинный текст) + Golos UI (интерфейс/контролы). ParaType, OFL 1.1.
2. **Code / logs / Monaco** — JetBrains Mono. OFL 1.1.
3. **Docs / бланки / акты** — PT Astra Sans (гос-стандарт реквизитов). RusBITech, OFL 1.1.
4. **Wordmark «PrettyK»** — зона дизайнера, позже (премиум / OFL+кастом / леттеринг, $500–5000).

Все четыре self-host (TTF, позже WOFF2), airgap-совместимо, без CDN/Google Fonts.

## As-built якорь

- `cosmo/public/fonts/{golos-text,golos-ui,jetbrains-mono,pt-astra-sans}/` — TTF + LICENSE + COPYRIGHT.
- `cosmo/src/styles.css` — `@font-face` для всех четырёх.
- `cosmo/src/theme/tokens.ts` — `FONT_STACK` (Golos UI → Golos Text), `MONO_STACK` (JetBrains Mono).
- `cosmo/index.html` — убран Google Fonts (Syne + JetBrains Mono) → self-host.
- `cosmo/src/results/blankHtml.ts` — PT Astra Sans (body) + JetBrains Mono (code) в скачиваемых бланках.

## Статус

Принят. Канон: [`brand-fonts.md`](../sanctuary/canon/brand-fonts.md). Полировка `brand-strategy.md` §3 — там же.
