/**
 * Локальная инициализация Monaco: без CDN.
 *
 * @monaco-editor/react по умолчанию грузит редактор с jsdelivr. Здесь loader принудительно
 * переключается на экземпляр monaco-editor из node_modules, а воркеры подключаются
 * ?worker-импортами Vite, поэтому сборка работает в airgap-контуре.
 *
 * Подсветка: PrettyK / WireK токены через setMonarchTokensProvider + defineTheme.
 * PrettyK → prettykLanguage.ts; WireK → CONSTRUCTOR_TOKENS ниже.
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import { allMonacoBundles } from '../theme/monacoThemes';
import {
  PRETTYK_LANGUAGE_CONFIG,
  PRETTYK_LANGUAGE_ID,
  PRETTYK_TOKENS,
} from './prettykLanguage';
export { PRETTYK_LANGUAGE_ID };

/** WireK / pipe-строка `component|action|args`. */
export const CONSTRUCTOR_LANGUAGE_ID = 'pk-constructor';
export const LIGHT_THEME_ID = 'pk-light';
export const DARK_THEME_ID = 'pk-dark';
export { PK_UNICODE_HIGHLIGHT } from './unicodeHighlight';

let initialized = false;

const CONSTRUCTOR_TOKENS: monaco.languages.IMonarchLanguage = {
  tokenizer: {
    root: [
      [/\|/, { token: 'delimiter.pk', next: '@action' }],
      [/[^|]+/, 'pk.component'],
    ],
    action: [
      [/\|/, { token: 'delimiter.pk', next: '@args' }],
      [/[^|]+/, 'pk.action'],
    ],
    args: [
      [/\{\{[^{}|]*\}\}/, 'pk.variable'],
      [/\{\{/, 'pk.variable.invalid'],
      [/\|/, 'delimiter.pk'],
      [/[^|{]+/, 'pk.argument'],
      [/\{/, 'pk.argument'],
    ],
  },
};

function ensureLanguage(
  id: string,
  tokens: monaco.languages.IMonarchLanguage,
  config: monaco.languages.LanguageConfiguration,
): void {
  if (!monaco.languages.getLanguages().some((lang) => lang.id === id)) {
    monaco.languages.register({ id });
  }
  monaco.languages.setMonarchTokensProvider(id, tokens);
  monaco.languages.setLanguageConfiguration(id, config);
}

/** Регистрирует язык и темы. Идемпотентно (HMR / повторный вызов). */
export function setupMonaco(): typeof monaco {
  globalThis.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      return label === 'json' ? new JsonWorker() : new EditorWorker();
    },
  };

  ensureLanguage(CONSTRUCTOR_LANGUAGE_ID, CONSTRUCTOR_TOKENS, {
    autoClosingPairs: [{ open: '${', close: '}' }],
    surroundingPairs: [],
    wordPattern: /[^|]+/g,
  });

  ensureLanguage(PRETTYK_LANGUAGE_ID, PRETTYK_TOKENS, PRETTYK_LANGUAGE_CONFIG);

  for (const bundle of allMonacoBundles()) {
    monaco.editor.defineTheme(bundle.themeId, bundle.data);
  }

  if (!initialized) {
    loader.config({ monaco });
    initialized = true;
  }
  return monaco;
}
