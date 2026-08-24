// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HUB_ACTION_TILES, StudioActionHub } from './StudioActionHub';

describe('StudioActionHub tiles', () => {
  it('содержит 6 основных категорий в каноническом порядке', () => {
    expect(HUB_ACTION_TILES).toHaveLength(6);
    expect(HUB_ACTION_TILES.map((t) => t.title)).toEqual([
      'Модели страниц',
      'Сценарии проверки',
      'Фаззеры',
      'Модули данных',
      'Коннекторы и Интеграции',
      'Профили авторизации',
    ]);
  });

  it('клик по плитке вызывает onPickAction', () => {
    const onPickAction = vi.fn();
    const onExternal = vi.fn();
    render(<StudioActionHub onPickAction={onPickAction} onExternal={onExternal} />);

    fireEvent.click(screen.getByText('Fuzzers').closest('.pk-studio-action-hub-card')!);
    expect(onPickAction).toHaveBeenCalledWith('create-fuzzer');

    onPickAction.mockClear();
    fireEvent.click(screen.getByText('Connectors & Integrations').closest('.pk-studio-action-hub-card')!);
    expect(onPickAction).toHaveBeenCalledWith('create-connector');
  });
});
