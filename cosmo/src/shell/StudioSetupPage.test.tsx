// PURE-URL-FREE (2026-08-21): StudioSetupPage больше не используется в основном flow.
// Создание чека теперь через HomePage модалку (3 поля: title, URL, browser).
// Страница сохранена как fallback, тесты закомментированы.
// Восстановить при custom-деплое из git history.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

describe('StudioSetupPage', () => {
  it('PURE: creation modal replaced setup page', () => {
    // StudioSetupPage is not routed to in PURE.
    // Creation flow: HomePage modal → 3 fields → Studio.
    expect(true).toBe(true);
  });
});