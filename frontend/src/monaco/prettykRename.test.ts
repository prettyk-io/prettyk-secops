/**
 * E1 / PK-TRM-8: rename + deprecated MethodId diagnostics.
 * @vitest-environment jsdom
 */
import './vitest.monaco-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrettykRenameProvider } from './prettykRename';
import { analyzePrettyk } from './prettykDiagnostics';
import { createPrettykModel, monaco, positionAt } from './providerTestHarness';

const models: ReturnType<typeof createPrettykModel>[] = [];

function model(text: string) {
  const m = createPrettykModel(text);
  models.push(m);
  return m;
}

afterEach(() => {
  while (models.length > 0) {
    models.pop()?.dispose();
  }
});

describe('E1 rename', () => {
  const tok = undefined as unknown as monaco.CancellationToken;

  it('renames $name and ${name} occurrences, preserving sigils', () => {
    const m = model('Пусть $email = a\nЛог $email\nНажать ${email}');
    const provider = createPrettykRenameProvider();

    const loc = provider.resolveRenameLocation?.(
      m,
      positionAt(m, 2, 6),
      tok,
    ) as monaco.languages.RenameLocation | null;
    expect(loc?.text).toBe('email');

    const result = provider.provideRenameEdits(
      m,
      positionAt(m, 2, 6),
      'login',
      tok,
    ) as monaco.languages.WorkspaceEdit | null;
    expect(result).not.toBeNull();
    const edits = result?.edits ?? [];
    expect(edits).toHaveLength(3);

    const texts = edits.map((e) => {
      const te = e as monaco.languages.IWorkspaceTextEdit;
      return {
        range: te.textEdit.range,
        text: te.textEdit.text,
      };
    });
    expect(texts.every((t) => t.text === 'login')).toBe(true);
    // Declaration on line 1: `email` after `$` (Пусть = 5 + space = 6, `$` at 7, `e` at 8).
    expect(texts[0]?.range.startLineNumber).toBe(1);
    expect(texts[0]?.range.startColumn).toBe(8);
    // `${email}` on line 3: name starts after `$` + `{`.
    expect(texts[2]?.range.startColumn).toBe(10);
  });

  it('rejects rename for undeclared variable', () => {
    const m = model('Лог $email');
    const provider = createPrettykRenameProvider();
    expect(provider.resolveRenameLocation?.(m, positionAt(m, 1, 6), tok)).toBeNull();
  });

  it('rejects rename for complex path / ENV ref', () => {
    const m = model('Пусть $user = 1\nЛог $user.email');
    const provider = createPrettykRenameProvider();
    expect(provider.resolveRenameLocation?.(m, positionAt(m, 2, 7), tok)).toBeNull();
  });
});

describe('E1 deprecated diagnostics', () => {
  it('flags legacy Утвердить* as warning', () => {
    const m = model('УтвердитьРавенство $a 1');
    const diags = analyzePrettyk(m);
    const hit = diags.find((d) => d.message.includes('Устаревший MethodId'));
    expect(hit).toBeDefined();
    expect(hit?.message).toContain('ПроверитьРавенство');
    expect(hit?.severity).toBe(4 as unknown as monaco.MarkerSeverity);
  });

  it('does not flag canonical Проверить* or non-legacy alias', () => {
    const m = model('ПроверитьРавенство $a 1\nНажатьКнопку #css');
    const diags = analyzePrettyk(m);
    expect(diags.some((d) => d.message.includes('Устаревший MethodId'))).toBe(false);
  });
});
