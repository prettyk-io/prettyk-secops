// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CopilotDock, CopilotRail } from './CopilotDock';

describe('CopilotDock (BUD-6)', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('схлопнутый → 36px рельс с LED и кнопкой развернуть', () => {
    const toggle = vi.fn();
    render(<CopilotDock phase="thinking" expanded={false} onToggleExpanded={toggle} title="Buddy" />);
    expect(screen.getByTestId('buddy-rail')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Развернуть Buddy'));
    expect(toggle).toHaveBeenCalled();
  });

  it('развёрнутый → док с заголовком и детьми', () => {
    render(
      <CopilotDock phase="idle" expanded onToggleExpanded={vi.fn()} title="Buddy">
        <div data-testid="child-widget">x</div>
      </CopilotDock>,
    );
    expect(screen.getByTestId('buddy-dock')).toBeTruthy();
    expect(screen.getByTestId('child-widget')).toBeTruthy();
    expect(screen.getByText('Buddy')).toBeTruthy();
  });

  it('LED-фазы: thinking=фиолетовый пульс, waiting=amber, error=crimson', () => {
    const { container } = render(<CopilotRail phase="waiting" onToggleExpanded={vi.fn()} title="t" />);
    const led = container.querySelector('span[aria-label="ждёт ответа"]') as HTMLElement;
    expect(led).toBeTruthy();
    expect(led.style.background).toBe('rgb(245, 158, 11)');
  });
});
