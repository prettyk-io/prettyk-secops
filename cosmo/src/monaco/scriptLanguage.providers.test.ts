/**
 * @vitest-environment jsdom
 */
import './vitest.monaco-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDiagnostics, CONSTRUCTOR_MARKER_OWNER } from './constructorLanguage';
import { createPrettykCodeActionProvider, findAliasAtLine } from './prettykCodeActions';
import { extractPrettykFoldRanges } from './prettykFolding';
import {
  createPrettykDefinitionProvider,
  createPrettykDocumentHighlightProvider,
  createPrettykReferenceProvider,
  findOperationLine,
  findVarDefinition,
  findVarReferences,
  pageCallAt,
} from './prettykNavigation';
import { extractPrettykSymbols } from './prettykSymbols';
import {
  createPrettykModel,
  monaco,
  positionAt,
  withConstructorContext,
} from './providerTestHarness';
import { createPrettykCompletionProvider } from './scriptLanguage';
import { tabIdFromSuiteModelUri } from '../studio/studioModels';

const models: ReturnType<typeof createPrettykModel>[] = [];

function model(text: string, uri?: string) {
  const m = createPrettykModel(text, uri);
  models.push(m);
  return m;
}

afterEach(() => {
  while (models.length > 0) {
    models.pop()?.dispose();
  }
  for (const leftover of monaco.editor.getModels()) {
    if (leftover.uri.toString().startsWith('pk://suite/')) {
      leftover.dispose();
    }
  }
});

describe('ED0 provider harness', () => {
  it('suggests MethodId (Нажать) on empty PrettyK line', () => {
    withConstructorContext({ variables: [] });
    const m = model('');
    const provider = createPrettykCompletionProvider(monaco);
    const result = provider.provideCompletionItems(
      m,
      positionAt(m, 1, 1),
      { triggerKind: monaco.languages.CompletionTriggerKind.Invoke, triggerCharacter: undefined },
      undefined as unknown as monaco.CancellationToken,
    );
    const suggestions = (result as monaco.languages.CompletionList).suggestions;
    const labels = suggestions.map((s) => String(s.label));
    expect(labels).toContain('Нажать');
  });

  it('suggests $ variables for prefix $e after Пусть', () => {
    withConstructorContext({ variables: ['email', 'password'] });
    const m = model('Пусть $email = x\n$e');
    const provider = createPrettykCompletionProvider(monaco);
    const result = provider.provideCompletionItems(
      m,
      positionAt(m, 2, 3),
      {
        triggerKind: monaco.languages.CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: 'e',
      },
      undefined as unknown as monaco.CancellationToken,
    );
    const suggestions = (result as monaco.languages.CompletionList).suggestions;
    expect(suggestions.map((s) => s.label)).toContain('email');
    expect(suggestions.every((s) => s.label === 'email' || s.label === 'password')).toBe(true);
  });

  it('applyDiagnostics sets error marker on model', () => {
    const m = model('bad|line');
    applyDiagnostics(monaco, m, [
      { severity: 'error', message: 'тест marker', start: 0, end: 3 },
    ]);
    const markers = monaco.editor.getModelMarkers({ resource: m.uri });
    const ours = markers.filter((mk) => mk.owner === CONSTRUCTOR_MARKER_OWNER);
    expect(ours.length).toBeGreaterThanOrEqual(1);
    expect(ours[0]?.message).toBe('тест marker');
    expect(ours[0]?.severity).toBe(monaco.MarkerSeverity.Error);
  });

  it('does not stretch a logical marker across padded canvas lines', () => {
    const m = model('От\n\n\n');
    applyDiagnostics(monaco, m, [
      { severity: 'error', message: 'неполный шаг', start: 0, end: 2 },
    ]);
    const marker = monaco.editor
      .getModelMarkers({ resource: m.uri })
      .find((item) => item.owner === CONSTRUCTOR_MARKER_OWNER);
    expect(marker?.startLineNumber).toBe(1);
    expect(marker?.endLineNumber).toBe(1);
    expect(marker?.endColumn).toBe(3);
  });
});

describe('ED1 Outline symbols', () => {
  it('extracts Пусть, page-call, block, MethodId call', () => {
    const text = [
      'Пусть $email = a',
      'login.Войти',
      'Если $ok',
      '  Нажать кнопка',
      'Цикл 3',
      '  Лог шаг',
    ].join('\n');
    const symbols = extractPrettykSymbols(text);
    expect(symbols.some((s) => s.kind === 'variable' && s.name === '$email')).toBe(true);
    expect(symbols.some((s) => s.kind === 'pageCall' && s.name === 'login.Войти')).toBe(true);
    expect(symbols.some((s) => s.kind === 'block' && s.name === 'Если')).toBe(true);
    expect(symbols.some((s) => s.kind === 'call' && s.name === 'Нажать')).toBe(true);
  });
});

describe('ED2 Definition / References', () => {
  it('finds Пусть definition and references for $email', () => {
    const text = 'Пусть $email = a\nЛог $email\nНажать ${email}';
    const def = findVarDefinition(text, 'email');
    expect(def?.isDeclaration).toBe(true);
    expect(def?.line).toBe(1);
    const refs = findVarReferences(text, 'email');
    expect(refs).toHaveLength(3);
  });

  it('finds Пусть / Секрет inside Цикл / Операция segments', () => {
    const text = [
      'Цикл 2 { Пусть $x = 1 }',
      'Операция Заполнить { Секрет $token = "a" }',
    ].join('\n');
    expect(findVarDefinition(text, 'x')?.line).toBe(1);
    expect(findVarDefinition(text, 'token')?.line).toBe(2);
  });

  it('definition provider jumps to Пусть; references list uses', () => {
    const m = model('Пусть $email = a\nЛог $email');
    const defProvider = createPrettykDefinitionProvider(monaco);
    const def = defProvider.provideDefinition(
      m,
      positionAt(m, 2, 6),
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.Location;
    expect(def.range.startLineNumber).toBe(1);

    const refProvider = createPrettykReferenceProvider();
    const refs = refProvider.provideReferences(
      m,
      positionAt(m, 1, 8),
      { includeDeclaration: true },
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.Location[];
    expect(refs).toHaveLength(2);

    const hlProvider = createPrettykDocumentHighlightProvider();
    const highlights = hlProvider.provideDocumentHighlights(
      m,
      positionAt(m, 2, 6),
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.DocumentHighlight[];
    expect(highlights).toHaveLength(2);
  });

  it('pageCallAt splits register vs Заполнить', () => {
    const line = 'register.Заполнить';
    expect(pageCallAt(line, 3)?.target).toBe('page');
    expect(pageCallAt(line, 10)?.target).toBe('op');
    expect(pageCallAt(line, 10)?.op).toBe('Заполнить');
  });

  it('findOperationLine matches Операция Заполнить', () => {
    const hit = findOperationLine('Операция Заполнить {\n  Нажать ok\n}', 'Заполнить');
    expect(hit?.line).toBe(1);
    expect(hit?.startColumn).toBe('Операция '.length + 1);
  });

  it('page-call definition finds op in page model', () => {
    withConstructorContext({ pageIds: ['login'] });
    const page = model('Войти\n  Нажать ok', 'pk://suite/pages/login.pk');
    void page;
    const scenario = model('login.Войти', 'pk://suite/scenarios/0.pk');
    const defProvider = createPrettykDefinitionProvider(monaco);
    const def = defProvider.provideDefinition(
      scenario,
      positionAt(scenario, 1, 3),
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.Location;
    expect(def.uri.toString()).toContain('pages/login');
    expect(def.range.startLineNumber).toBe(1);
  });

  it('register.Заполнить jumps to Операция (both halves) via formData model', () => {
    withConstructorContext({
      pageIds: ['register'],
      formData: {
        test_suites: {
          pages: {
            register: {
              constructor: 'Операция Заполнить {\n  Нажать ok\n}\n',
            },
          },
        },
      },
    });
    const scenario = model('register.Заполнить', 'pk://suite/scenarios/0.pk');
    const defProvider = createPrettykDefinitionProvider(monaco);
    const onPage = defProvider.provideDefinition(
      scenario,
      positionAt(scenario, 1, 3),
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.Location;
    expect(tabIdFromSuiteModelUri(onPage.uri)).toBe('page:register');
    expect(onPage.range.startLineNumber).toBe(1);

    const onOp = defProvider.provideDefinition(
      scenario,
      positionAt(scenario, 1, 12),
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.Location;
    expect(tabIdFromSuiteModelUri(onOp.uri)).toBe('page:register');
    expect(onOp.range.startLineNumber).toBe(1);
    expect(onOp.range.startColumn).toBe('Операция '.length + 1);
  });

  it('jumps to global Пусть on page / module, not other scenarios', () => {
    withConstructorContext({
      pageIds: ['register'],
      formData: {
        test_suites: {
          pages: {
            register: { constructor: 'Пусть $shared = 1\n' },
          },
          test_data_constructor: [{ id: 'mod', constructor: 'Секрет $modSecret = "x"\n' }],
          scenarios: [
            { name: 'a', steps: [{ constructor: 'Пусть $localOnly = 1\n' }] },
            { name: 'b', steps: [{ constructor: 'Лог $localOnly\n' }] },
          ],
        },
      },
    });
    const scenarioB = model('Лог $shared\nЛог $modSecret\nЛог $localOnly', 'pk://suite/scenarios/1.pk');
    const defProvider = createPrettykDefinitionProvider(monaco);

    const shared = defProvider.provideDefinition(
      scenarioB,
      positionAt(scenarioB, 1, 7),
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.Location;
    expect(tabIdFromSuiteModelUri(shared.uri)).toBe('page:register');

    const modSecret = defProvider.provideDefinition(
      scenarioB,
      positionAt(scenarioB, 2, 8),
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.Location;
    expect(tabIdFromSuiteModelUri(modSecret.uri)).toBe('module:0');

    const localMiss = defProvider.provideDefinition(
      scenarioB,
      positionAt(scenarioB, 3, 8),
      undefined as unknown as monaco.CancellationToken,
    );
    expect(localMiss).toBeNull();
  });

  it('jumps to Пусть for ОбойтиСтраницы $data_module 1', () => {
    const text = 'Пусть $data_module = тест\nОбойтиСтраницы $data_module 1';
    const m = model(text);
    const defProvider = createPrettykDefinitionProvider(monaco);
    const def = defProvider.provideDefinition(
      m,
      positionAt(m, 2, 18),
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.Location;
    expect(def.range.startLineNumber).toBe(1);
  });
});

describe('ED3 CodeAction alias → канон', () => {
  it('detects НажатьКнопку → Нажать and provides edit', () => {
    const hit = findAliasAtLine('НажатьКнопку #css', 1);
    expect(hit?.canonical).toBe('Нажать');
    const m = model('НажатьКнопку #css');
    const provider = createPrettykCodeActionProvider();
    const result = provider.provideCodeActions(
      m,
      new monaco.Range(1, 1, 1, 1),
      {
        markers: [],
        only: undefined,
        trigger: monaco.languages.CodeActionTriggerType.Invoke,
      },
      undefined as unknown as monaco.CancellationToken,
    ) as monaco.languages.CodeActionList;
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.title).toContain('Нажать');
    const edit = result.actions[0]?.edit?.edits[0] as {
      textEdit?: { text: string };
    };
    expect(edit.textEdit?.text).toBe('Нажать');
  });
});

describe('ED4 Folding', () => {
  it('folds indented body under Если / Цикл', () => {
    const text = ['Если $x', '  Нажать a', '  Лог b', 'Цикл 2', '  Шаг', 'Лог хвост'].join('\n');
    const ranges = extractPrettykFoldRanges(text);
    expect(ranges.some((r) => r.start === 1 && r.end === 3)).toBe(true);
    expect(ranges.some((r) => r.start === 4 && r.end === 5)).toBe(true);
  });
});
