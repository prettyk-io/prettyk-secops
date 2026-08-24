/**
 * Тесты для fields.tsx — виджеты без RJSF.
 * RK-FORM-2.
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PkSelectWidget,
  PkNumberInput,
  PkTextareaWidget,
} from './fields.tsx';

describe('PkSelectWidget', () => {
  const opts = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
  ];

  it('рендерит Select с value и options', () => {
    render(<PkSelectWidget value="a" options={opts} />);
    expect(screen.getByText('Option A')).toBeDefined();
  });

  it('disabled — вешает ant-select-disabled', () => {
    render(<PkSelectWidget value="a" options={opts} disabled />);
    const el = document.querySelector('.ant-select-disabled');
    expect(el).toBeDefined();
  });

  it('placeholder рендерится', () => {
    render(<PkSelectWidget options={opts} placeholder="Выберите" />);
    expect(screen.getByText('Выберите')).toBeDefined();
  });
});

describe('PkNumberInput', () => {
  it('рендерит число', () => {
    const { container } = render(<PkNumberInput value={42} />);
    const input = container.querySelector('.ant-input-number-input') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('42');
  });

  it('disabled — input disabled', () => {
    const { container } = render(<PkNumberInput value={0} disabled />);
    const input = container.querySelector('.ant-input-number-input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('min/max передаются', () => {
    const { container } = render(<PkNumberInput value={5} min={1} max={10} />);
    const input = container.querySelector('.ant-input-number-input') as HTMLInputElement;
    expect(input.getAttribute('aria-valuemin')).toBe('1');
    expect(input.getAttribute('aria-valuemax')).toBe('10');
  });
});

describe('PkTextareaWidget', () => {
  it('рендерит textarea со значением', () => {
    const { container } = render(<PkTextareaWidget value="hello" />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).toBeDefined();
    expect(ta.value).toBe('hello');
  });

  it('disabled делает textarea disabled', () => {
    const { container } = render(<PkTextareaWidget value="" disabled />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
  });

  it('rows передаётся', () => {
    const { container } = render(<PkTextareaWidget value="" rows={5} maxLength={100} />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.rows).toBe(5);
    expect(ta.maxLength).toBe(100);
  });
});
