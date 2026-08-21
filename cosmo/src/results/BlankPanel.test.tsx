// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { BlankPanel } from './BlankPanel';

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
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

describe('BlankPanel component', () => {
  beforeEach(() => {
    cleanup();
  });
  const mockFormData = {
    regulation: {
      assessment_purpose: 'Аттестация ИБ',
      target_url: 'https://bank.local/app',
    },
    test_suites: {
      smoke: {
        title: 'Smoke suite',
      },
    },
  };

  it('renders inline blank preview with hash tag and action buttons', () => {
    render(
      <ConfigProvider locale={ruRU}>
        <BlankPanel
          kind="act"
          formData={mockFormData}
          open={true}
        />
      </ConfigProvider>,
    );

    expect(screen.getByTestId('results-blank-panel')).toBeTruthy();
    expect(screen.getByTestId('blank-hash-tag')).toBeTruthy();
    expect(screen.getByTestId('blank-print-btn')).toBeTruthy();
    expect(screen.getByTestId('blank-download-btn')).toBeTruthy();
    expect(screen.getByTestId('blank-preview-iframe')).toBeTruthy();
    expect(screen.getByText(/Отпечаток:/i)).toBeTruthy();
  });

  it('handles print button click', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <ConfigProvider locale={ruRU}>
        <BlankPanel
          kind="act"
          formData={mockFormData}
          open={true}
        />
      </ConfigProvider>,
    );

    const printBtn = screen.getByTestId('blank-print-btn');
    fireEvent.click(printBtn);

    printSpy.mockRestore();
  });
});
