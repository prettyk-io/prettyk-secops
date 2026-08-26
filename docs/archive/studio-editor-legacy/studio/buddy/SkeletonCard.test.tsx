// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SkeletonCard } from './SkeletonCard';
import type { SkeletonData } from './adapters';

const skeleton: SkeletonData = {
  intent: 'Покупка товара в 1 клик',
  pages: [
    { id: 'p1', title: 'Каталог товаров', path: '/products', included: true },
    { id: 'p2', title: 'Админка', path: '/admin', included: false, assumption: true },
  ],
  scenarios: [
    {
      id: 's1',
      title: 'Покупка',
      steps: [{ id: 'st1', dsl: 'Open /products', included: true }],
    },
  ],
};

describe('SkeletonCard (BUD-7)', () => {
  afterEach(cleanup);

  it('рендерит страницы с чекбоксами и сценарий', () => {
    render(<SkeletonCard skeleton={skeleton} />);
    expect(screen.getByText('Извлечённая структура')).toBeTruthy();
    expect(screen.getByDisplayValue('Каталог товаров')).toBeTruthy();
    expect(screen.getByText('/products')).toBeTruthy();
    expect(screen.getByText('Open /products')).toBeTruthy();
  });

  it('toggle page вызывает onTogglePage', () => {
    const onToggle = vi.fn();
    render(<SkeletonCard skeleton={skeleton} onTogglePage={onToggle} />);
    fireEvent.click(screen.getByLabelText('Включить Каталог товаров'));
    expect(onToggle).toHaveBeenCalledWith('p1');
  });

  it('rename page вызывает onRenamePage', () => {
    const onRename = vi.fn();
    render(<SkeletonCard skeleton={skeleton} onRenamePage={onRename} />);
    fireEvent.change(screen.getByDisplayValue('Каталог товаров'), { target: { value: 'Новое' } });
    expect(onRename).toHaveBeenCalledWith('p1', 'Новое');
  });

  it('toggle step вызывает onToggleStep', () => {
    const onToggleStep = vi.fn();
    render(<SkeletonCard skeleton={skeleton} onToggleStep={onToggleStep} />);
    fireEvent.click(screen.getByLabelText('Включить шаг Open /products'));
    expect(onToggleStep).toHaveBeenCalledWith('s1', 'st1');
  });

  it('assumption страница помечена знаком ?', () => {
    const { container } = render(<SkeletonCard skeleton={skeleton} />);
    expect(container.querySelector('[title="Предположение модели"]')).toBeTruthy();
  });
});
