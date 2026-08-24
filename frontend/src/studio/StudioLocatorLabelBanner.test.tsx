// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudioLocatorLabelBanner } from './StudioLocatorLabelBanner';

describe('StudioLocatorLabelBanner', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('accept writes label→locator into constructor via onAccept', async () => {
    const onAccept = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          locator_label_last: {
            status: 'ok',
            label: 'Войти',
            new_type: 'id',
            new_value: 'login-btn',
            score: 1,
          },
        }),
      })),
    );

    render(
      <StudioLocatorLabelBanner
        enabled
        constructorText="Нажать > Войти"
        onAccept={onAccept}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('studio-locator-label')).toBeTruthy());
    fireEvent.click(screen.getByTestId('studio-locator-label-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    const next = String(onAccept.mock.calls[0]?.[0]);
    expect(next).toMatch(/login-btn/);
  });

  it('Скрыть dismisses without onAccept', async () => {
    const onAccept = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          locator_label_last: {
            status: 'ok',
            label: 'Войти',
            new_type: 'id',
            new_value: 'login-btn',
          },
        }),
      })),
    );

    render(
      <StudioLocatorLabelBanner
        enabled
        constructorText="Нажать > Войти"
        onAccept={onAccept}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('studio-locator-label')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть' }));
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.queryByTestId('studio-locator-label')).toBeNull();
  });
});

