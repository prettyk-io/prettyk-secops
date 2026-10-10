import { describe, expect, it } from 'vitest';
import {
  isFormSurfaceTabId,
  resolveStudioFormSurface,
} from './studioFormSurface';

const wired = {
  test_suites: {
    fuzzers: [
      {
        id: 'juice_search_q',
        targets: [
          {
            url: 'http://juice-shop:3000/rest/products/search?q=',
            method: 'GET',
            corpus: 'intent_sqli_smoke',
          },
        ],
      },
      { id: 'juice0' },
    ],
    imports: [
      { path: 'resources/customers.txt', kind: 'data_file', as: 'customers' },
    ],
  },
};

describe('studioFormSurface (STUDIO-FUZZER-FORM-SURFACE)', () => {
  it('резолвит фаззер по fuzzer:N (поля как в легаси: id/targets/corpus)', () => {
    const surface = resolveStudioFormSurface(wired, 'fuzzer:0');
    expect(surface?.kind).toBe('fuzzer');
    if (surface?.kind !== 'fuzzer') return;
    expect(surface.index).toBe(0);
    expect(surface.value.id).toBe('juice_search_q');
    expect(surface.value.targets[0]?.corpus).toBe('intent_sqli_smoke');
  });

  it('второй фаззер чека тоже резолвится (juice0)', () => {
    const surface = resolveStudioFormSurface(wired, 'fuzzer:1');
    expect(surface?.kind).toBe('fuzzer');
    if (surface?.kind !== 'fuzzer') return;
    expect(surface.value.id).toBe('juice0');
    expect(surface.index).toBe(1);
  });

  it('резолвит ресурс по resource:N', () => {
    const surface = resolveStudioFormSurface(wired, 'resource:0');
    expect(surface?.kind).toBe('resource');
    if (surface?.kind !== 'resource') return;
    expect(surface.value.as).toBe('customers');
    expect(surface.value.path).toBe('resources/customers.txt');
  });

  it('DSL/пустой tab → null (form-surface не открываем)', () => {
    expect(resolveStudioFormSurface(wired, 'scenario:0')).toBeNull();
    expect(resolveStudioFormSurface(wired, 'page:login')).toBeNull();
    expect(resolveStudioFormSurface(wired, undefined)).toBeNull();
  });

  it('удалённая сущность → null (честное «не найдено», без фантома)', () => {
    expect(resolveStudioFormSurface(wired, 'fuzzer:9')).toBeNull();
    expect(resolveStudioFormSurface(wired, 'resource:3')).toBeNull();
    expect(resolveStudioFormSurface(undefined, 'fuzzer:0')).toBeNull();
  });

  it('isFormSurfaceTabId отличает form-surface от DSL', () => {
    expect(isFormSurfaceTabId('fuzzer:0')).toBe(true);
    expect(isFormSurfaceTabId('resource:1')).toBe(true);
    expect(isFormSurfaceTabId('scenario:0')).toBe(false);
    expect(isFormSurfaceTabId(undefined)).toBe(false);
  });
});
