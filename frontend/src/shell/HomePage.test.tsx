// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { HomePage } from './HomePage';
import { ThemeProvider } from '../theme/ThemeProvider';

beforeAll(() => {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
});

function renderHome(props: Partial<Parameters<typeof HomePage>[0]> = {}) {
  const onOpenHistory = props.onOpenHistory ?? vi.fn();
  const onOpenAdmin = props.onOpenAdmin ?? vi.fn();
  const onStartFresh = props.onStartFresh ?? vi.fn();
  const onStartSetup = props.onStartSetup ?? vi.fn();
  const onStartImported = props.onStartImported ?? vi.fn();
  const onStartFromDeploy = props.onStartFromDeploy ?? vi.fn();
  return {
    onOpenHistory,
    onOpenAdmin,
    onStartFresh,
    onStartSetup,
    onStartImported,
    onStartFromDeploy,
    ...render(
      <ThemeProvider>
        <HomePage
          onOpenHistory={onOpenHistory}
          onOpenAdmin={onOpenAdmin}
          onStartFresh={onStartFresh}
          onStartSetup={onStartSetup}
          onStartImported={onStartImported}
          onStartFromDeploy={onStartFromDeploy}
          playEnter={props.playEnter}
          onEnterPlayed={props.onEnterPlayed}
          canAccessAdmin={props.canAccessAdmin}
          canimportWired={props.canimportWired}
          roleLabel={props.roleLabel}
        />
      </ThemeProvider>,
    ),
  };
}

describe('HomePage EntryPoint', () => {
  it('3 монолитные карточки: Студия, Lab, Админка (История убрана)', () => {
    const { onStartSetup, onOpenAdmin } = renderHome({ canAccessAdmin: true });
    const policies = screen.getByTestId('home-policies');
    expect(policies.getAttribute('aria-disabled')).toBeNull();

    expect(screen.getByTestId('home-initiate')).toBeTruthy();
    expect(screen.getByTestId('home-lab')).toBeTruthy();
    expect(policies).toBeTruthy();

    fireEvent.click(policies);
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('home-initiate'));
    // Switches to initiate view
    expect(screen.getByTestId('studio-modal-fresh')).toBeTruthy();
    expect(screen.getByTestId('studio-modal-history')).toBeTruthy();
    expect(screen.getByTestId('studio-modal-import')).toBeTruthy();

    fireEvent.click(screen.getByTestId('studio-modal-fresh'));
    // PURE: fresh now opens a creation modal (name, URL, browser), not setup page
    expect(screen.queryByTestId('home-initiate-view')).toBeTruthy();

    expect(screen.queryByTestId('home-history')).toBeNull();
  });

  it('expert: без Admin — 2 карточки (Студия, Lab)', () => {
    const { onOpenAdmin } = renderHome({ canAccessAdmin: false });
    expect(screen.queryByTestId('home-policies')).toBeNull();
    expect(screen.getByTestId('home-initiate')).toBeTruthy();
    expect(screen.queryByTestId('home-history')).toBeNull();
    expect(screen.getByTestId('home-lab')).toBeTruthy();
    expect(onOpenAdmin).not.toHaveBeenCalled();
  });

  it('playEnter: класс enter на stage', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    renderHome({ playEnter: true });
    expect(screen.getByTestId('home-stage').className).toContain('pk-home-stage--enter');
  });

  it('prefers-reduced-motion: enter снимается и onEnterPlayed', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    const onEnterPlayed = vi.fn();
    renderHome({ playEnter: true, onEnterPlayed });
    await vi.waitFor(() => {
      expect(onEnterPlayed).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('home-stage').className).not.toContain('pk-home-stage--enter');
  });
});
