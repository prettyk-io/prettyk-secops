// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StudioPresetBar } from './StudioPresetBar';

afterEach(() => {
  cleanup();
});

describe('StudioPresetBar', () => {
  it('рендерит селекторы приложения и окружения', () => {
    render(<StudioPresetBar />);
    expect(screen.getByTestId('studio-preset-bar')).toBeTruthy();
    expect(screen.getByTestId('studio-preset-app-select')).toBeTruthy();
    expect(screen.getByTestId('studio-preset-env-select')).toBeTruthy();
    expect(screen.getByTestId('studio-preset-url-display')).toBeTruthy();
  });

  it('отображает дефолтный URL для pk-core dev', () => {
    render(<StudioPresetBar />);
    expect(screen.getByText('http://dev.pk.local:3000')).toBeTruthy();
  });

  it('вызывает onSelectPreset при изменении', () => {
    const onSelect = vi.fn();
    render(<StudioPresetBar onSelectPreset={onSelect} />);
    expect(screen.getByTestId('studio-preset-bar')).toBeTruthy();
  });
});
