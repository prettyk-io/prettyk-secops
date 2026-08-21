import { describe, expect, it } from 'vitest';
import { modelPathForTab } from './studioModels';
import type { StudioTab } from './studioTabs';

function tab(partial: Partial<StudioTab> & Pick<StudioTab, 'id' | 'kind'>): StudioTab {
  return {
    title: 't',
    language: partial.kind === 'resource' ? 'resource-form' : 'pk-constructor',
    path: '/x',
    readOnly: false,
    ...partial,
  };
}

describe('modelPathForTab', () => {
  it('строит path для page/scenario/module; resource — undefined', () => {
    expect(modelPathForTab(tab({ id: 'page:login', kind: 'constructor' }))).toBe(
      'pk://suite/pages/login.pk',
    );
    expect(modelPathForTab(tab({ id: 'scenario:0', kind: 'constructor' }))).toBe(
      'pk://suite/scenarios/0.pk',
    );
    expect(modelPathForTab(tab({ id: 'module:2', kind: 'constructor' }))).toBe(
      'pk://suite/modules/2.pk',
    );
    expect(modelPathForTab(tab({ id: 'resource:0', kind: 'resource' }))).toBeUndefined();
  });
});
