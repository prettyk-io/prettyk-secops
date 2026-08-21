// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LabWorkspace } from './LabWorkspace';

afterEach(() => {
  cleanup();
});

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    App: {
      useApp: () => ({
        message: {
          success: vi.fn(),
          error: vi.fn(),
          warning: vi.fn(),
          info: vi.fn(),
        },
      }),
    },
  };
});

describe('LabWorkspace', () => {
  it('рендерит заголовок Burp Killer / Lab, визард и сайдбар', () => {
    render(<LabWorkspace onBackHome={vi.fn()} />);
    // Заголовок
    expect(screen.getByText(/BURP KILLER \/ LAB/i)).not.toBeNull();
    // Шаги визарда в Steps-баре (antd Steps рендерит title в div)
    expect(screen.getAllByText(/Цель/).length).toBeGreaterThanOrEqual(1);
    // Табы режимов
    expect(screen.getByText(/Single Attack/i)).not.toBeNull();
    // Сайдбар с evolve-заглушками
    expect(screen.getByText(/История/)).not.toBeNull();
    expect(screen.getByText(/Шаблоны/)).not.toBeNull();
    expect(screen.getByText(/Настройки/)).not.toBeNull();
  });

  it('содержит кнопки навигации визарда', () => {
    render(<LabWorkspace onBackHome={vi.fn()} />);
    expect(screen.getByText(/Назад/)).not.toBeNull();
    expect(screen.getByText(/Далее/)).not.toBeNull();
  });
});