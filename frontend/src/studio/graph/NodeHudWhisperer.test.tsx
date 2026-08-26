/**
 * @vitest-environment jsdom
 * WR-TEST-4: NodeHudWhisperer — две строки (факт + AI-whisper), JetBrains Mono 10px
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NodeHudWhisperer } from './NodeHudWhisperer';

afterEach(() => cleanup());

const testData = {
  fact: '200 OK · 142ms · GET /api/check',
  whisper: 'Endpoint responds normally, no anomalies detected',
  nodeTitle: 'Login Service',
};

describe('NodeHudWhisperer', () => {
  it('рендерит обе строки', () => {
    render(<NodeHudWhisperer data={testData} nodeCenterX={200} nodeCenterY={300} visible={true} />);
    expect(screen.getByText(testData.fact)).toBeTruthy();
    expect(screen.getByText(testData.whisper)).toBeTruthy();
  });

  it('строка факта — JetBrains Mono 10px', () => {
    cleanup();
    const { container } = render(<NodeHudWhisperer data={testData} nodeCenterX={200} nodeCenterY={300} visible={true} />);
    const factDivs = container.querySelectorAll('[style*="JetBrains Mono"]');
    expect(factDivs.length).toBeGreaterThan(0);
    const factEl = factDivs[0] as HTMLElement;
    expect(factEl.style.fontSize).toBe('10px');
  });

  it('строка шёпота — Inter 11px', () => {
    cleanup();
    const { container } = render(<NodeHudWhisperer data={testData} nodeCenterX={200} nodeCenterY={300} visible={true} />);
    // Первый div — JetBrains Mono (факт), второй — Inter (шёпот)
    const allDivs = container.querySelector('.pk-hud-whisperer')!.querySelectorAll('div');
    expect(allDivs.length).toBe(2);
    const whisperEl = allDivs[1] as HTMLElement;
    expect(whisperEl.style.fontFamily).toContain('Inter');
    expect(whisperEl.style.fontSize).toBe('11px');
  });

  it('visible=false — компонент не рендерится', () => {
    cleanup();
    const { container } = render(<NodeHudWhisperer data={testData} nodeCenterX={200} nodeCenterY={300} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('data=null — компонент не рендерится', () => {
    cleanup();
    const { container } = render(<NodeHudWhisperer data={null} nodeCenterX={200} nodeCenterY={300} visible={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('без onClick курсор default', () => {
    cleanup();
    const { container } = render(<NodeHudWhisperer data={testData} nodeCenterX={200} nodeCenterY={300} visible={true} />);
    const hud = container.querySelector('.pk-hud-whisperer') as HTMLElement;
    expect(hud).toBeTruthy();
    expect(hud.style.cursor).toBe('default');
  });
});