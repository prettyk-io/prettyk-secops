/**
 * Unit harness для Monaco providers (ED0): model + context без Studio/Playwright.
 */
import * as monaco from 'monaco-editor';
import type { KeywordCatalog } from '../keywords/catalog';
import { keywordCatalog } from '../keywords/catalog';
import { setConstructorContext } from './constructorLanguage';
import { PRETTYK_LANGUAGE_ID } from './prettykLanguage';

export type ProviderHarnessContext = {
  catalog?: KeywordCatalog;
  variables?: readonly string[];
  pageIds?: readonly string[];
  formData?: unknown;
};

let languageReady = false;

/** Stub worker — vitest/node не грузит ?worker из setupMonaco. */
function ensureMonacoEnvironment(): void {
  if (globalThis.MonacoEnvironment) {
    return;
  }
  globalThis.MonacoEnvironment = {
    getWorker() {
      return {
        postMessage() {
          /* noop */
        },
        terminate() {
          /* noop */
        },
        addEventListener() {
          /* noop */
        },
        removeEventListener() {
          /* noop */
        },
        dispatchEvent() {
          return false;
        },
        onerror: null,
        onmessage: null,
        onmessageerror: null,
      } as unknown as Worker;
    },
  };
}

export function ensurePrettykLanguageRegistered(): typeof monaco {
  ensureMonacoEnvironment();
  if (!languageReady) {
    if (!monaco.languages.getLanguages().some((lang) => lang.id === PRETTYK_LANGUAGE_ID)) {
      monaco.languages.register({ id: PRETTYK_LANGUAGE_ID });
    }
    languageReady = true;
  }
  return monaco;
}

export function withConstructorContext(ctx: ProviderHarnessContext = {}): void {
  setConstructorContext({
    catalog: ctx.catalog ?? keywordCatalog,
    variables: ctx.variables ?? [],
    pageIds: ctx.pageIds ?? [],
    formData: ctx.formData,
  });
}

/** Создаёт model prettyk; caller обязан dispose. */
let harnessModelSeq = 0;

export function createPrettykModel(
  text: string,
  uriPath?: string,
): monaco.editor.ITextModel {
  ensurePrettykLanguageRegistered();
  harnessModelSeq += 1;
  const path =
    uriPath ??
    `pk://test/${String(Date.now())}-${String(harnessModelSeq)}.pk`;
  return monaco.editor.createModel(text, PRETTYK_LANGUAGE_ID, monaco.Uri.parse(path));
}

export function positionAt(
  _model: monaco.editor.ITextModel,
  line: number,
  column: number,
): monaco.Position {
  // model unused: API mirrors Monaco Position factory for tests
  return new monaco.Position(line, column);
}

export { monaco };
