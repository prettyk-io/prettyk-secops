/**
 * WR-TEST-3: StepLanternLed — 6 состояний LED
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StepLanternLed, type StepLedState } from './StepLanternLed';

const states: StepLedState[] = ['queued', 'running', 'success', 'warning', 'failure', 'predicted'];

describe('StepLanternLed', () => {
  it('рендерит все 6 состояний без ошибок', () => {
    for (const state of states) {
      const { container } = render(<StepLanternLed state={state} />);
      expect(container.querySelector('span')).toBeTruthy();
    }
  });

  it('queued — opacity 0.3, серый цвет', () => {
    const { container } = render(<StepLanternLed state="queued" />);
    const span = container.querySelector('span')!;
    expect(span.style.opacity).toBe('0.3');
    expect(span.style.backgroundColor).toBe('rgb(71, 85, 105)'); // #475569
  });

  it('running — cyan pulse, boxShadow glow', () => {
    const { container } = render(<StepLanternLed state="running" />);
    const span = container.querySelector('span')!;
    expect(span.style.opacity).toBe('1');
    expect(span.style.backgroundColor).toBe('rgb(0, 240, 255)');
    expect(span.style.boxShadow).toContain('#00F0FF');
    expect(span.style.animation).toContain('pk-led-pulse-running');
  });

  it('success — emerald, flash → static', () => {
    const { container } = render(<StepLanternLed state="success" />);
    const span = container.querySelector('span')!;
    expect(span.style.backgroundColor).toBe('rgb(16, 185, 129)');
    expect(span.style.animation).toContain('pk-led-flash-green');
  });

  it('warning — amber breathing', () => {
    const { container } = render(<StepLanternLed state="warning" />);
    const span = container.querySelector('span')!;
    expect(span.style.backgroundColor).toBe('rgb(245, 158, 11)');
    expect(span.style.animation).toContain('pk-led-breath-amber');
  });

  it('failure — crimson, 3x strobe', () => {
    const { container } = render(<StepLanternLed state="failure" />);
    const span = container.querySelector('span')!;
    expect(span.style.backgroundColor).toBe('rgb(239, 68, 68)');
    expect(span.style.animation).toContain('pk-led-strobe-red');
  });

  it('predicted — violet pre-light blink', () => {
    const { container } = render(<StepLanternLed state="predicted" />);
    const span = container.querySelector('span')!;
    expect(span.style.backgroundColor).toBe('rgb(168, 85, 247)');
    expect(span.style.animation).toContain('pk-led-prelight');
    expect(span.style.boxShadow).toContain('#A855F7');
  });

  it('принимает кастомный size', () => {
    const { container } = render(<StepLanternLed state="running" size={20} />);
    const span = container.querySelector('span')!;
    expect(span.style.width).toBe('20px');
    expect(span.style.height).toBe('20px');
  });

  it('дефолтный size = 10', () => {
    const { container } = render(<StepLanternLed state="queued" />);
    const span = container.querySelector('span')!;
    expect(span.style.width).toBe('10px');
    expect(span.style.height).toBe('10px');
  });

  it('aria-label равен state', () => {
    const { container } = render(<StepLanternLed state="success" />);
    expect(container.querySelector('[aria-label="success"]')).toBeTruthy();
  });
});