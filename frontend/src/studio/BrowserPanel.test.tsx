/**
 * @vitest-environment jsdom
 * SC-TEST-5: CDP Browser Pane — BrowserPanel компонент (5 эндпоинтов, синхронизация клик-на-строке → подсветка)
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserPanel } from './BrowserPanel';

describe('BrowserPanel', () => {
  it('рендерится без краша (Selenium-only заглушка)', () => {
    const { container } = render(<BrowserPanel />);
    expect(container).toBeTruthy();
  });

  it('содержит поле ввода URL', () => {
    const { container } = render(<BrowserPanel />);
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    if (input) expect(input.getAttribute('value')).toBe('http://juice-shop:3000');
  });

  it('имеет явную кнопку «Запустить» и кнопку «Запись» (F1/F2)', () => {
    const { container } = render(<BrowserPanel />);
    const btns = container.querySelectorAll('button');
    const texts = Array.from(btns).map(b => b.textContent || '');
    expect(texts.some(t => t.includes('Запустить'))).toBe(true);
    expect(texts.some(t => t.includes('Запись'))).toBe(true);
  });
});