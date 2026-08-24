/**
 * CD-9b + INTRUDER-PRO: smoke-тест панели фаззинга.
 * @vitest-environment jsdom
 */
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StudioFuzzPanel } from './StudioFuzzPanel';

afterEach(() => {
  cleanup();
});

function fuzzerFormData(): unknown {
  return {
    test_suites: {
      fuzzers: [
        {
          id: 'search_q',
          label: 'search_q',
          algorithm: 'sniper',
          targets: [
            {
              url: 'http://juice-shop:3000/rest/products/search?q=apple',
              method: 'GET',
              corpus: 'auto',
            },
          ],
        },
      ],
    },
  };
}

describe('StudioFuzzPanel', () => {
  it('рендерит заголовок и кнопку запуска', () => {
    render(<StudioFuzzPanel formData={fuzzerFormData()} />);
    expect(screen.getAllByText(/Фаззинг/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Запустить пачку').length).toBeGreaterThan(0);
  });

  it('пустой formData → заголовок и плейсхолдер целей', () => {
    render(<StudioFuzzPanel formData={{ test_suites: {} }} />);
    expect(screen.getAllByText(/Фаззинг/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Запустить пачку').length).toBeGreaterThan(0);
  });

  it('поле пейлоадов предзаполнено дефолтным набором', () => {
    render(<StudioFuzzPanel formData={fuzzerFormData()} />);
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).toBeDefined();
    expect(ta.value).toContain('<script>alert(1)</script>');
  });

  it('показывает селектор режима атаки и счётчик запросов', () => {
    render(<StudioFuzzPanel formData={fuzzerFormData()} />);
    expect(screen.getByText(/Sniper/)).toBeDefined();
    expect(screen.getByText(/запросов:/)).toBeDefined();
  });

  it('показывает кнопки пресетов словарей', () => {
    render(<StudioFuzzPanel formData={fuzzerFormData()} />);
    expect(screen.getByText('SQL Injection')).toBeDefined();
    expect(screen.getByText('XSS/SSTI')).toBeDefined();
    expect(screen.getByText('Path Traversal')).toBeDefined();
    expect(screen.getByText('Admin Logins')).toBeDefined();
    expect(screen.getByText('Boundary Numbers')).toBeDefined();
  });

  it('клик по пресету заполняет textarea', () => {
    render(<StudioFuzzPanel formData={fuzzerFormData()} />);
    fireEvent.click(screen.getByText('SQL Injection'));
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toContain("' OR '1'='1");
  });

  it('отображает поля ввода Grep Match и Grep Extract', () => {
    render(<StudioFuzzPanel formData={fuzzerFormData()} />);
    expect(screen.getByPlaceholderText(/Grep Match/)).toBeDefined();
    expect(screen.getByPlaceholderText(/Grep Extract/)).toBeDefined();
  });
});
