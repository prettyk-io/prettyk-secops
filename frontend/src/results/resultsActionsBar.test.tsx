// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultsActionsBar } from './resultsActionsBar';

afterEach(() => {
  cleanup();
});

describe('ResultsActionsBar act button', () => {
  const base = {
    packageEnabled: true,
    actEnabled: true,
    savePackageIcon: 'pkg.png',
    downloadActIcon: 'act.png',
    onSavePackage: vi.fn(),
    onDownloadAct: vi.fn(),
  };

  it('does not mount act button when actDisplayed is false', () => {
    render(<ResultsActionsBar {...base} actDisplayed={false} />);
    expect(screen.queryByTestId('results-download-act')).toBeNull();
    expect(screen.getByTestId('results-save-package')).toBeTruthy();
  });

  it('mounts muted act button when displayed but not enabled', () => {
    render(<ResultsActionsBar {...base} actDisplayed actEnabled={false} />);
    const btn = screen.getByTestId('results-download-act');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.className).toMatch(/muted/);
  });

  it('enables act button when displayed and enabled', () => {
    render(<ResultsActionsBar {...base} actDisplayed actEnabled />);
    const btn = screen.getByTestId('results-download-act');
    expect(btn.getAttribute('aria-disabled')).toBe('false');
  });
});
