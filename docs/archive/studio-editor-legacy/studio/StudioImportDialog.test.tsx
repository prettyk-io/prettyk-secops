// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StudioImportDialog } from './StudioImportDialog';
import {
  __resetChecksStoreForTests,
  createCheck,
  setActiveCheckId,
} from '../checks/checksStore';

function manifestWith({
  pages = {},
  scenarios = [],
  modules = [],
  fuzzers = [],
  resources = [],
}: {
  pages?: Record<string, unknown>;
  scenarios?: unknown[];
  modules?: unknown[];
  fuzzers?: unknown[];
  resources?: unknown[];
} = {}) {
  return {
    meta: { name: 'Test' },
    test_suites: {
      pages,
      scenarios,
      test_data_constructor: modules,
      fuzzers,
      imports: resources,
      editor_folders: { pages: [], scenarios: [], modules: [] },
    },
  };
}

afterEach(() => {
  cleanup();
  __resetChecksStoreForTests();
});

describe('StudioImportDialog', () => {
  it('показывает только другие проверки и список блоков', () => {
    // createCheck сам вызывает setActiveCheckId; явно ставим нужный в конце.
    createCheck({
      wired: manifestWith({ pages: { a: { title: 'A' } } }),
      title: 'Текущая проверка',
    });
    createCheck({
      wired: manifestWith({
        pages: { b1: { title: 'B1' }, b2: { title: 'B2' }, b3: { title: 'B3' } },
        scenarios: [{ scenario_name: 'sc_1' }],
      }),
      title: 'Источник с блоками',
    });
    const current = createCheck({ wired: manifestWith(), title: 'Ещё один draft' });
    setActiveCheckId(current.check_id);

    render(
      <StudioImportDialog
        open
        onClose={() => {}}
        onImport={() => {}}
      />,
    );

    // Текущая проверка не отображается как источник.
    expect(screen.queryByText('Ещё один draft')).toBeNull();
    // Другие проверки отображаются.
    expect(screen.getByText('Текущая проверка')).toBeTruthy();
    expect(screen.getByText('Источник с блоками')).toBeTruthy();
    // Преустановка количества блоков источника.
    expect(screen.getByText(/3 страницы, 1 сценарий/)).toBeTruthy();
  });

  it('возвращает выбранные блоки и содержимое ресурсов', () => {
    createCheck({
      wired: manifestWith({
        pages: { p1: { title: 'P1' } },
        scenarios: [{ scenario_name: 'sc_1' }],
        modules: [{ id: 'mod_1' }],
        fuzzers: [{ id: 'fz_1' }],
        resources: [{ as: 'res_1', path: 'resources/res_1.txt', kind: 'data_file' }],
      }),
      resource_contents: { res_1: 'resource-body' },
      title: 'Источник',
    });
    const current = createCheck({ wired: manifestWith(), title: 'Текущая' });
    setActiveCheckId(current.check_id);

    const onImport = vi.fn();
    render(
      <StudioImportDialog open onClose={() => {}} onImport={onImport} />,
    );

    // Выбор проверки-источника.
    fireEvent.click(screen.getByText('Источник'));

    // Снять флажки: модули, фаззеры.
    fireEvent.click(screen.getByText('Модули'));
    fireEvent.click(screen.getByText('Фаззеры'));

    fireEvent.click(screen.getByText('Импортировать'));

    expect(onImport).toHaveBeenCalledTimes(1);
    const payload = onImport.mock.calls[0]?.[0] as {
      blocks: { pages: Record<string, unknown>; scenarios: unknown[]; modules: unknown[]; fuzzers: unknown[]; resources: unknown[] };
      resourceContents?: Record<string, string>;
    };

    // pages, scenarios, resources остались выбранными (по умолчанию все).
    expect(Object.keys(payload.blocks.pages)).toEqual(['p1']);
    expect(payload.blocks.scenarios).toHaveLength(1);
    expect(payload.blocks.modules).toHaveLength(0);
    expect(payload.blocks.fuzzers).toHaveLength(0);
    expect(payload.blocks.resources).toHaveLength(1);
    expect(payload.resourceContents).toEqual({ res_1: 'resource-body' });
  });

  it('включает содержимое ресурсов при выбранном типе resources', () => {
    createCheck({
      wired: manifestWith({
        resources: [{ as: 'res_1', path: 'resources/res_1.txt', kind: 'data_file' }],
      }),
      resource_contents: { res_1: 'resource-body' },
      title: 'Источник',
    });
    const current = createCheck({ wired: manifestWith(), title: 'Текущая' });
    setActiveCheckId(current.check_id);

    const onImport = vi.fn();
    render(
      <StudioImportDialog open onClose={() => {}} onImport={onImport} />,
    );

    fireEvent.click(screen.getByText('Источник'));
    fireEvent.click(screen.getByText('Импортировать'));

    const payload = onImport.mock.calls[0]?.[0] as {
      blocks: { resources: unknown[] };
      resourceContents?: Record<string, string>;
    };
    expect(payload.blocks.resources).toHaveLength(1);
    expect(payload.resourceContents).toEqual({ res_1: 'resource-body' });
  });

  it('показывает пустое состояние без других проверок', () => {
    const current = createCheck({ wired: manifestWith(), title: 'Единственная' });
    setActiveCheckId(current.check_id);

    render(
      <StudioImportDialog open onClose={() => {}} onImport={() => {}} />,
    );

    expect(screen.getByText('Нет других проверок для импорта')).toBeTruthy();
  });
});
