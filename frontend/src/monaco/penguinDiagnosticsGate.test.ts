// @vitest-environment jsdom
/**
 * RUN-GATE-MARKERS: регресс-тесты гейта запуска.
 *
 * Корень рецидива: `collectAllMonacoDiagnostics` сканировал ВСЕ модели Monaco,
 * поэтому stale-маркер скрытой keep-mounted панели блокировал Run при чистом
 * текущем документе. Контракт гейта: скоуп — модели ВИДИМЫХ редакторов;
 * fallback (без `editor.getEditors`) — зарегистрированная модель; без неё —
 * legacy-скан всех.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type * as monacoNs from 'monaco-editor';

import {
  GATE_MARKER_OWNERS,
  clearGateMarkersForModel,
  collectAllMonacoDiagnostics,
  collectGateDiagnostics,
  resetActiveGateModelForTests,
  setActiveGateModel,
} from './penguinDiagnosticsGate';

interface FakeMarker {
  owner: string;
  severity: number;
  message: string;
  startLineNumber: number;
}

interface FakeModel {
  uri: { toString(): string; path: string };
}

interface FakeDom {
  isConnected: boolean;
  offsetParent: unknown;
  getBoundingClientRect(): { width: number; height: number };
}

interface FakeEditor {
  getDomNode(): FakeDom | null;
  getModel(): FakeModel | null;
}

function makeModel(path: string): FakeModel {
  return { uri: { path, toString: () => `inmemory://${path}` } };
}

/** Редактор с видимым/скрытым DOM (hidden-панель keep-mounted = offsetParent null). */
function makeEditor(model: FakeModel | null, visible: boolean): FakeEditor {
  return {
    getModel: () => model,
    getDomNode: () => ({
      isConnected: true,
      offsetParent: visible ? {} : null,
      getBoundingClientRect: () =>
        visible ? { width: 800, height: 400 } : { width: 0, height: 0 },
    }),
  };
}

function makeHarness(opts: { editors?: FakeEditor[] } = {}) {
  const models: FakeModel[] = [];
  const store = new Map<unknown, FakeMarker[]>(); // key: uri-объект модели
  let markersFn: (resource: unknown) => FakeMarker[] = (resource) => store.get(resource) ?? [];

  const uriOf = (model: unknown): unknown =>
    (model as FakeModel)?.uri ?? model;

  const api = {
    editor: {
      getModels: () => models,
      getModelMarkers: (opts2: { resource: unknown }) => markersFn(opts2.resource),
      setModelMarkers: (model: unknown, owner: string, markers: FakeMarker[]) => {
        const key = uriOf(model);
        const rest = (store.get(key) ?? []).filter((m) => m.owner !== owner);
        store.set(key, [...rest, ...markers]);
      },
      ...(opts.editors ? { getEditors: () => opts.editors } : {}),
    },
  };

  return {
    monaco: api as unknown as typeof monacoNs,
    register(model: FakeModel) {
      models.push(model);
      store.set(model.uri, []);
      return model as unknown as monacoNs.editor.ITextModel;
    },
    addMarker(model: FakeModel, marker: FakeMarker) {
      const key = uriOf(model);
      store.set(key, [...(store.get(key) ?? []), marker]);
    },
    markersOf(model: FakeModel) {
      return store.get(model.uri) ?? [];
    },
    breakMarkers(fn: (resource: unknown) => FakeMarker[]) {
      markersFn = fn;
    },
  };
}

function gateMarker(over: Partial<FakeMarker> = {}): FakeMarker {
  return {
    owner: 'pk-constructor',
    severity: 4,
    message: 'warning text',
    startLineNumber: 3,
    ...over,
  };
}

beforeEach(() => {
  resetActiveGateModelForTests();
});

describe('RUN-GATE-MARKERS: legacy-скан (без зарегистрированного скоупа)', () => {
  it('собирает маркеры severity>=warning только гейтовых owners', () => {
    const h = makeHarness();
    const clean = h.register(makeModel('clean'));
    const dirty = h.register(makeModel('dirty'));
    h.addMarker(dirty, gateMarker({ message: 'deprecated', startLineNumber: 7 }));
    h.addMarker(dirty, gateMarker({ owner: 'pk-sugar-diagnostics', severity: 8 })); // не гейтовый
    h.addMarker(dirty, gateMarker({ severity: 3 })); // ниже порога
    void clean;

    const diags = collectAllMonacoDiagnostics(h.monaco);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      path: 'dirty',
      line: 7,
      message: 'deprecated',
      owner: 'pk-constructor',
    });
  });

  it('collectGateDiagnostics без инициализации скоупа = legacy-скан', () => {
    const h = makeHarness();
    const dirty = h.register(makeModel('dirty'));
    h.addMarker(dirty, gateMarker());

    expect(collectGateDiagnostics(h.monaco)).toHaveLength(1);
  });
});

describe('RUN-GATE-MARKERS: скоуп активной модели', () => {
  it('stale-маркер НЕактивной модели не блокирует гейт (фантомная модалка исключена)', () => {
    const h = makeHarness();
    const active = h.register(makeModel('active'));
    const stale = h.register(makeModel('stale'));
    h.addMarker(stale, gateMarker({ owner: 'security-diagnostics', severity: 8, message: 'phantom' }));

    setActiveGateModel(active);

    expect(collectGateDiagnostics(h.monaco)).toEqual([]);
  });

  it('маркер активной модели блокирует как раньше', () => {
    const h = makeHarness();
    const active = h.register(makeModel('active'));
    h.addMarker(active, gateMarker({ message: 'real issue', severity: 8 }));

    setActiveGateModel(active);

    const diags = collectGateDiagnostics(h.monaco);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ message: 'real issue', owner: 'pk-constructor' });
  });

  it('инициализированный, но пустой скоуп (документ закрыт/чек сменён) — не блокирует', () => {
    const h = makeHarness();
    const other = h.register(makeModel('other'));
    h.addMarker(other, gateMarker(owner_placeholder()));

    const active = h.register(makeModel('active'));
    setActiveGateModel(active);
    setActiveGateModel(null);

    expect(collectGateDiagnostics(h.monaco)).toEqual([]);
  });

  it('disposed-модель в скоупе не роняет гейт (пустой результат)', () => {
    const h = makeHarness();
    const active = h.register(makeModel('active'));
    setActiveGateModel(active);
    h.breakMarkers(() => {
      throw new Error('model is disposed');
    });

    expect(collectGateDiagnostics(h.monaco)).toEqual([]);
  });
});

describe('RUN-GATE-MARKERS: скоуп видимых редакторов (основной путь)', () => {
  it('карточный регресс: stale-маркер скрытой панели не блокирует при чистой видимой', () => {
    const visibleModel = makeModel('visible-doc');
    const hiddenModel = makeModel('hidden-stale');
    const h = makeHarness({
      editors: [makeEditor(visibleModel, true), makeEditor(hiddenModel, false)],
    });
    h.register(visibleModel);
    h.register(hiddenModel);
    h.addMarker(hiddenModel, gateMarker({ message: 'stale phantom', severity: 8 }));

    expect(collectGateDiagnostics(h.monaco)).toEqual([]);
  });

  it('маркер видимой модели блокирует (даже без зарегистрированного скоупа)', () => {
    const visibleModel = makeModel('visible-dirty');
    const h = makeHarness({ editors: [makeEditor(visibleModel, true)] });
    h.register(visibleModel);
    h.addMarker(visibleModel, gateMarker({ message: 'real issue', severity: 8 }));

    const diags = collectGateDiagnostics(h.monaco);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ path: 'visible-dirty', message: 'real issue' });
  });

  it('все редакторы скрыты (results-вьюха) — маркеры моделей не блокируют', () => {
    const a = makeModel('a');
    const b = makeModel('b');
    const h = makeHarness({ editors: [makeEditor(a, false), makeEditor(b, false)] });
    h.register(a);
    h.register(b);
    h.addMarker(a, gateMarker());

    expect(collectGateDiagnostics(h.monaco)).toEqual([]);
  });

  it('несколько видимых редакторов — union моделей (Студия + Редактор)', () => {
    const studio = makeModel('studio');
    const workbench = makeModel('workbench');
    const h = makeHarness({
      editors: [makeEditor(studio, true), makeEditor(workbench, true)],
    });
    h.register(studio);
    h.register(workbench);
    h.addMarker(workbench, gateMarker({ message: 'wb issue' }));

    const diags = collectGateDiagnostics(h.monaco);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ path: 'workbench', message: 'wb issue' });
  });

  it('один документ в двух видимых редакторах — маркеры не дублируются', () => {
    const shared = makeModel('shared');
    const h = makeHarness({
      editors: [makeEditor(shared, true), makeEditor(shared, true)],
    });
    h.register(shared);
    h.addMarker(shared, gateMarker());

    expect(collectGateDiagnostics(h.monaco)).toHaveLength(1);
  });

  it('видимый редактор без модели не роняет гейт; маркер соседа виден', () => {
    const dirty = makeModel('dirty');
    const broken: FakeEditor = { getModel: () => null, getDomNode: () => null };
    const h = makeHarness({
      editors: [broken, makeEditor(null, true), makeEditor(dirty, true)],
    });
    h.register(dirty);
    h.addMarker(dirty, gateMarker());

    expect(collectGateDiagnostics(h.monaco)).toHaveLength(1);
  });

  it('getEditors пуст (редакторы не смонтированы) — не legacy: маркеры не блокируют', () => {
    const h = makeHarness({ editors: [] });
    const m = h.register(makeModel('m'));
    h.addMarker(m, gateMarker());

    expect(collectGateDiagnostics(h.monaco)).toEqual([]);
  });
});

describe('RUN-GATE-MARKERS: очистка stale-маркеров', () => {
  it('clearGateMarkersForModel снимает маркеры всех гейтовых owners', () => {
    const h = makeHarness();
    const model = h.register(makeModel('doc'));
    for (const owner of GATE_MARKER_OWNERS) {
      h.addMarker(model, gateMarker({ owner }));
    }
    h.addMarker(model, gateMarker({ owner: 'pk-sugar-diagnostics' }));
    expect(h.markersOf(model)).toHaveLength(GATE_MARKER_OWNERS.length + 1);

    clearGateMarkersForModel(h.monaco, model as unknown as monacoNs.editor.ITextModel);

    const rest = h.markersOf(model);
    expect(rest.map((m) => m.owner)).toEqual(['pk-sugar-diagnostics']);
  });
});

function owner_placeholder(): Partial<FakeMarker> {
  return { owner: 'prettyk-diagnostics' };
}