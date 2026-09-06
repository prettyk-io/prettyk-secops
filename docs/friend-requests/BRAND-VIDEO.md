# BRAND-VIDEO: фоновое видео бренда на LoginPage и HomePage

`lane: ready` → **принят 15 авг 2026 (2FA одобрен).** Зачислен в hub как `CANON`. См. `brand-video.md`.

## Тезис

На LoginPage и HomePage восстанавливается фоновое брендовое видео `login-bg.webm` (loop, mute, cover), утерянное при переходе VNEXT. Видео — часть коробочного бренда, было в `legacy/frontend/public/media/login-bg.webm`.

## As-built якорь

- `cosmo/public/media/login-bg.webm` (скопирован из legacy).
- `cosmo/src/shell/BrandVideo.tsx` — компонент `<video>` с overlay (opacity адаптивно по теме).
- `cosmo/src/styles.css` — `.kdt-brand-video` + `.kdt-brand-video-overlay`.
- `LoginPage.tsx` — `<BrandVideo />` вставлен, контент с `zIndex: 2`.
- `HomePage.tsx` — `<BrandVideo />` вставлен, хедер с `backdropFilter: blur(8px)`.

## К какому FRIEND дозреет

К FRIEND «Коробочный бренд» (Wordmark + BrandVideo — два столпа одного identity). Возможно, отдельный тонкий FRIEND `BRAND-ASSETS` под видео, иконки, шрифты.

## Честная «не обещаем»

- Видео взято как есть из legacy (22 MB webm). Оптимизация / сжатие / CDN — не в этом реквесте.
- В будущем может понадобиться light-вариант видео, preload-стратегия, poster-кадр.