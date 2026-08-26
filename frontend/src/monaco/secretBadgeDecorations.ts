/**
 * PK-EC-10: Secret Badge Decorations — lock icon in Monaco gutter for Секрет lines.
 *
 * Given: Monaco содержит строки с `Секрет $x = ...`.
 * When: редактор загружен / текст изменён.
 * Then:
 *   - в gutter строки — 🔒 иконка (inline SVG glyph margin)
 *   - при клике на иконку — tooltip с именем секрета и статусом маскировки
 *   - decoration обновляется при каждом изменении текста
 *
 * Совместимо с существующим redactSecrets.ts (не дублирует логику маскировки,
 * только визуальный индикатор).
 */
import type { editor, IDisposable } from 'monaco-editor';

const SECRET_DECORATION_KEY = 'pk-secret-badge';

/** SVG lock иконка (12×12, встраиваемая через glyph margin). */
const LOCK_ICON_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="12" viewBox="0 0 10 12" fill="none">
    <rect x="1" y="5" width="8" height="7" rx="1" fill="rgba(168,85,247,0.8)" />
    <path d="M3 5V3a2 2 0 114 0v2" stroke="rgba(168,85,247,0.8)" stroke-width="1.5" fill="none" />
  </svg>`;

/** Регулярка для строки `Секрет $name` (начало строки или после { · ; · пробел). */
const SECRET_LINE_RE = /(?:^|[{;]|\s)\s*(Секрет)\s+\$(\w+)/;

interface SecretLineInfo {
  line: number;    // 1-based
  name: string;    // имя переменной ($foo)
}

/** Находит все строки с Секрет в тексте. */
export function findSecretLines(text: string): SecretLineInfo[] {
  const lines = text.split('\n');
  const out: SecretLineInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = SECRET_LINE_RE.exec(line);
    if (match) {
      out.push({ line: i + 1, name: match[2] ?? '?' });
    }
  }
  return out;
}

/**
 * Привязывает secret-badge decorations к Monaco editor.
 * Возвращает disposable (вызвать dispose при размонтировании).
 */
export function bindSecretBadgeDecorations(
  ed: editor.IStandaloneCodeEditor,
): IDisposable {
  let decorationIds: string[] = [];
  const model = ed.getModel();

  const apply = () => {
    const m = model ?? ed.getModel();
    if (!m) return;

    const secrets = findSecretLines(m.getValue());
    const newDecorations: editor.IModelDeltaDecoration[] = secrets.map((s) => ({
      range: {
        startLineNumber: s.line,
        startColumn: 1,
        endLineNumber: s.line,
        endColumn: 1,
      },
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'pk-secret-badge-glyph',
        glyphMarginHoverMessage: {
          value: `**Секрет $${s.name}**  \nМаскировка: **ВКЛ**  \nСекретное значение не отображается в редакторе и логах.`,
        },
        inlineClassName: 'pk-secret-badge-line',
      },
    }));

    decorationIds = ed.deltaDecorations(decorationIds, newDecorations);
  };

  apply();

  const contentSub = ed.onDidChangeModelContent(apply);
  const modelSub = ed.onDidChangeModel(() => {
    // Re-bind после смены модели
  });

  return {
    dispose() {
      decorationIds = ed.deltaDecorations(decorationIds, []);
      contentSub.dispose();
      modelSub.dispose();
    },
  };
}