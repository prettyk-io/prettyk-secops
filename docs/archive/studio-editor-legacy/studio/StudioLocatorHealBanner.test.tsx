// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudioLocatorHealBanner } from './StudioLocatorHealBanner';

describe('StudioLocatorHealBanner', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('accept applies locator; miss replace stays silent (no onAccept)', async () => {
    const onAccept = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          locator_heal_last: {
            status: 'ok',
            old_type: 'id',
            old_value: 'login-btn',
            new_type: 'css',
            new_value: '#login',
            score: 0.9,
          },
        }),
      })),
    );

    const { rerender } = render(
      <StudioLocatorHealBanner
        enabled
        constructorText="Нажать id login-btn"
        onAccept={onAccept}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('studio-locator-heal')).toBeTruthy());
    fireEvent.click(screen.getByTestId('studio-locator-heal-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept.mock.calls[0]?.[0]).toContain('#login');

    onAccept.mockClear();
    rerender(
      <StudioLocatorHealBanner
        enabled
        constructorText="Нажать id other"
        onAccept={onAccept}
      />,
    );
    // old_value not in canvas → banner hidden (honest miss)
    await waitFor(() => {
      expect(screen.queryByTestId('studio-locator-heal')).toBeNull();
    });
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('disabled or non-ok proposal renders nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          locator_heal_last: { status: 'miss', old_value: 'x' },
        }),
      })),
    );
    const { container } = render(
      <StudioLocatorHealBanner enabled constructorText="Нажать id x" onAccept={vi.fn()} />,
    );
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="studio-locator-heal"]')).toBeNull();
  });
});
