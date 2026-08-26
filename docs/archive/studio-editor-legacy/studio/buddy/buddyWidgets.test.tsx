// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ClarificationChips } from './ClarificationChips';
import { LiveDiffBanner } from './LiveDiffBanner';
import { StepRadar } from './StepRadar';
import { EvidenceMatrix } from './EvidenceMatrix';
import { LaunchpadHero } from './LaunchpadHero';
import type { Clarification, LiveDiff, StepRadarState, EvidenceMatrixView } from './adapters';

describe('ClarificationChips (BUD-7)', () => {
  afterEach(cleanup);

  it('рендерит вопрос + чипсы с хоткеями', () => {
    const c: Clarification = {
      question: 'Какой тип авторизации?',
      options: [
        { id: 'bearer', label: 'Bearer Token', hotkey: 1 },
        { id: 'form', label: 'Form Login', hotkey: 2 },
      ],
    };
    render(<ClarificationChips clarification={c} onSelect={vi.fn()} />);
    expect(screen.getByText('Какой тип авторизации?')).toBeTruthy();
    expect(screen.getByText('Bearer Token')).toBeTruthy();
    expect(screen.getByText('Form Login')).toBeTruthy();
  });

  it('клик по чипсу вызывает onSelect с id', () => {
    const onSelect = vi.fn();
    const c: Clarification = {
      question: 'q',
      options: [{ id: 'bearer', label: 'Bearer', hotkey: 1 }],
    };
    render(<ClarificationChips clarification={c} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Bearer'));
    expect(onSelect).toHaveBeenCalledWith('bearer');
  });
});

describe('LiveDiffBanner (BUD-8)', () => {
  afterEach(cleanup);

  const diff: LiveDiff = {
    title: 'Добавить сценарий',
    lines: [
      { type: 'context', text: 'Пусть $x = 1' },
      { type: 'add', text: 'Open /products' },
      { type: 'remove', text: 'Open /old' },
    ],
  };

  it('рендерит сплит-дифф с add/remove', () => {
    const { container } = render(<LiveDiffBanner diff={diff} onApply={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText('Добавить сценарий')).toBeTruthy();
    expect(screen.getByText('Open /products')).toBeTruthy();
    expect(container.querySelector('.bg-emerald-500\\/10')).toBeTruthy();
    expect(container.querySelector('.bg-red-500\\/10')).toBeTruthy();
  });

  it('Apply/Reject вызывают колбэки', () => {
    const onApply = vi.fn();
    const onReject = vi.fn();
    render(<LiveDiffBanner diff={diff} onApply={onApply} onReject={onReject} />);
    fireEvent.click(screen.getByText('Apply'));
    fireEvent.click(screen.getByText('Reject'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});

describe('StepRadar (BUD-9)', () => {
  afterEach(cleanup);

  const st: StepRadarState = {
    currentStep: 2,
    totalSteps: 4,
    stepLabel: 'Test Submit T0',
    targetUrl: 'juice-shop.local',
    status: 'running',
    telemetry: { ms: 124, memory: '42MB' },
  };

  it('показывает живой прогресс и телеметрию (не слепой спиннер)', () => {
    render(<StepRadar state={st} onTakeControl={vi.fn()} />);
    expect(screen.getByText('⚡ Buddy Run: Step 2 of 4')).toBeTruthy();
    expect(screen.getByText('Test Submit T0')).toBeTruthy();
    expect(screen.getByText(/Telemetry: 124ms/)).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('Take Control вызывает onTakeControl', () => {
    const onTake = vi.fn();
    render(<StepRadar state={st} onTakeControl={onTake} />);
    fireEvent.click(screen.getByTestId('take-control'));
    expect(onTake).toHaveBeenCalledTimes(1);
  });
});

describe('EvidenceMatrix (BUD-9)', () => {
  afterEach(cleanup);

  const m: EvidenceMatrixView = {
    pass: true,
    proven: [
      { icon: 'http', text: 'HTTP POST /api/cart → 200 OK (38ms)' },
      { icon: 'dom', text: 'DOM: span.cart-count 0 → 1' },
    ],
    advisories: ['Кнопка "Купить" не имеет стабильного T0-имени'],
  };

  it('рендерит доказательства + advisory', () => {
    render(<EvidenceMatrix matrix={m} />);
    expect(screen.getByText('HTTP POST /api/cart → 200 OK (38ms)')).toBeTruthy();
    expect(screen.getByText('DOM: span.cart-count 0 → 1')).toBeTruthy();
    expect(screen.getByText(/Кнопка "Купить" не имеет/)).toBeTruthy();
  });
});

describe('LaunchpadHero (BUD-6)', () => {
  afterEach(cleanup);

  it('submit intent вызывает onSubmitIntent и очищает', () => {
    const onSubmit = vi.fn();
    render(<LaunchpadHero onSubmitIntent={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Описание приложения'), {
      target: { value: 'SPA с каталогом' },
    });
    fireEvent.click(screen.getByTestId('launchpad-submit'));
    expect(onSubmit).toHaveBeenCalledWith('SPA с каталогом');
  });

  it('Enter отправляет intent', () => {
    const onSubmit = vi.fn();
    render(<LaunchpadHero onSubmitIntent={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Описание приложения'), { target: { value: 'test' } });
    fireEvent.keyDown(screen.getByLabelText('Описание приложения'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('test');
  });

  it('импорт-чипы вызывают onImportKind', () => {
    const onImport = vi.fn();
    render(<LaunchpadHero onSubmitIntent={vi.fn()} onImportKind={onImport} />);
    fireEvent.click(screen.getByTestId('launchpad-import-har'));
    expect(onImport).toHaveBeenCalledWith('har');
  });
});
