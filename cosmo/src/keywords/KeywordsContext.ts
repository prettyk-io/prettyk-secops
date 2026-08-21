import { createContext, useContext } from 'react';
import type * as monacoNs from 'monaco-editor';
import type { KeywordCatalog } from './catalog';

export interface KeywordsState {
  catalog: KeywordCatalog;
  /** Переменные, объявленные в текущем манифесте (save_as шагов, id контекстных объектов). */
  variables: readonly string[];
  /** id страниц test_suites.pages — CodeLens «Страница …». */
  pageIds: readonly string[];
  /** security_configuration.allowed_extra_domains — ОткрытьПоURL. */
  allowedExtraDomains: string;
  baseUrl: string;
  monaco: typeof monacoNs;
}

export const KeywordsContext = createContext<KeywordsState | undefined>(undefined);

export function useKeywords(): KeywordsState {
  const state = useContext(KeywordsContext);
  if (state === undefined) {
    throw new Error('useKeywords использован вне KeywordsContext.Provider');
  }
  return state;
}
