# BRAND-VIDEO: фоновое видео бренда на LoginPage и HomePage

> **CANON** — hub topic. Slice: **15 августа 2026** (2FA: зачисление из friend-request).
> As-built: `cosmo/src/shell/BrandVideo.tsx` + `public/media/login-bg.webm`.
> Реестр: [`INDEX.md`](INDEX.md).

## Тезис

На LoginPage и HomePage — фоновое брендовое видео `login-bg.webm` (loop, mute, cover), часть коробочного identity. Видео восстановлено из legacy при переходе VNEXT.

## As-built якорь

- `cosmo/public/media/login-bg.webm` — скопирован из `legacy/frontend/public/media/`.
- `cosmo/src/shell/BrandVideo.tsx` — компонент `<video>` с overlay (opacity адаптивно по теме).
- `cosmo/src/styles.css` — `.pk-brand-video` + `.pk-brand-video-overlay`.
- `LoginPage.tsx` — `<BrandVideo />` вставлен, контент с `zIndex: 2`.
- `HomePage.tsx` — `<BrandVideo />` вставлен, хедер с `backdropFilter: blur(8px)`.

## Честная «не обещаем»

- Видео взято как есть из legacy (22 MB webm). Оптимизация / сжатие / CDN — отдельным шагом.
- В будущем может понадобиться light-вариант видео, preload-стратегия, poster-кадр.
- Дозреет до FRIEND «Коробочный бренд» (Wordmark + BrandVideo — два столпа одного identity).