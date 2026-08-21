// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoginPage } from './LoginPage';
import { ThemeProvider } from '../theme/ThemeProvider';
import { LocaleProvider } from '../locales';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LoginPage SSO', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('по клику показывает редирект и галочку, через 3с возвращает label', () => {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <LoginPage onSuccess={vi.fn()} />
        </LocaleProvider>
      </ThemeProvider>,
    );
    const btn = screen.getByTestId('login-sso');
    expect(btn.textContent).toContain('SSO / Blitz');
    expect((btn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(btn);
    expect(btn.textContent).toContain('Редирект на Blitz');
    expect(btn.className).toContain('pk-shell-sso-btn--ok');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('login-sso').textContent).toContain('SSO / Blitz');
    expect(screen.getByTestId('login-sso').className).not.toContain('pk-shell-sso-btn--ok');
  });
});
