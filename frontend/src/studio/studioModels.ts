/**
 * Индустриальный контракт документов Студии: Monaco ITextModel + стабильный path/Uri.
 * Tab chrome и дерево — снаружи; текст/undo/viewState — в model.
 */
import type { editor, Uri } from 'monaco-editor';
import type * as MonacoNS from 'monaco-editor';
import type { StudioTab, StudioTabId } from './studioTabs';
import { moduleTabId, pageTabId, scenarioTabId } from './studioTabs';

export type MonacoApi = typeof MonacoNS;

/** Совпадает с PRETTYK_LANGUAGE_ID; без импорта setup (monaco DOM) в unit-тестах. */
const PRETTYK_LANGUAGE_ID = 'prettyk';

/** Виртуальный path для monaco-react `path` / Uri.parse. */
export function modelPathForTab(tab: StudioTab): string | undefined {
  if (tab.kind === 'resource') {
    return undefined;
  }
  if (tab.id.startsWith('page:')) {
    const id = tab.id === 'page:__empty__' ? '__empty__' : tab.id.slice('page:'.length);
    return `pk://suite/pages/${encodeURIComponent(id)}.pk`;
  }
  const scenario = /^scenario:(\d+)$/.exec(tab.id);
  if (scenario) {
    return `pk://suite/scenarios/${scenario[1]!}.pk`;
  }
  const mod = /^module:(\d+)$/.exec(tab.id);
  if (mod) {
    return `pk://suite/modules/${mod[1]!}.pk`;
  }
  return undefined;
}

/** `pk://suite/pages|modules|scenarios/…` → tab id (для go-to-definition opener). */
export function tabIdFromSuiteModelUri(uri: { toString(): string }): StudioTabId | undefined {
  const raw = uri.toString().split(/[?#]/, 1)[0] ?? '';
  const page = /^pk:\/\/suite\/pages\/(.+)\.pk$/i.exec(raw);
  if (page?.[1] !== undefined) {
    return pageTabId(decodeURIComponent(page[1]));
  }
  const mod = /^pk:\/\/suite\/modules\/(\d+)\.pk$/i.exec(raw);
  if (mod?.[1] !== undefined) {
    return moduleTabId(Number(mod[1]));
  }
  const scenario = /^pk:\/\/suite\/scenarios\/(\d+)\.pk$/i.exec(raw);
  if (scenario?.[1] !== undefined) {
    return scenarioTabId(Number(scenario[1]));
  }
  return undefined;
}

export function modelUri(monaco: MonacoApi, path: string): Uri {
  return monaco.Uri.parse(path);
}

export function getStudioModel(monaco: MonacoApi, path: string): editor.ITextModel | null {
  return monaco.editor.getModel(modelUri(monaco, path));
}

/** Создать model, если ещё нет. */
export function ensureStudioModel(
  monaco: MonacoApi,
  path: string,
  value: string,
  languageId: string = PRETTYK_LANGUAGE_ID,
): editor.ITextModel {
  const existing = getStudioModel(monaco, path);
  if (existing) {
    if (existing.getLanguageId() !== languageId) {
      monaco.editor.setModelLanguage(existing, languageId);
    }
    return existing;
  }
  return monaco.editor.createModel(value, languageId, modelUri(monaco, path));
}

export function disposeStudioModel(monaco: MonacoApi, path: string | undefined): void {
  if (!path) {
    return;
  }
  getStudioModel(monaco, path)?.dispose();
}

/** Внешний formData → model (не затирать, если уже совпадает). */
export function pushTextToModel(
  monaco: MonacoApi,
  path: string,
  text: string,
  languageId: string = PRETTYK_LANGUAGE_ID,
): void {
  const model = getStudioModel(monaco, path);
  if (!model) {
    ensureStudioModel(monaco, path, text, languageId);
    return;
  }
  if (model.getLanguageId() !== languageId) {
    monaco.editor.setModelLanguage(model, languageId);
  }
  if (model.getValue() !== text) {
    model.setValue(text);
  }
}

export function readModelText(monaco: MonacoApi, path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  return getStudioModel(monaco, path)?.getValue();
}
