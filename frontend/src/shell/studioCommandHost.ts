/**
 * Второй слой cmdk для Studio: Workspace регистрирует host, палитра читает.
 */
import type { HubActionId } from '../studio/StudioActionHub';

export type StudioPaletteEntityKind =
  | 'page'
  | 'scenario'
  | 'module'
  | 'fuzzer'
  | 'resource';

export type StudioPaletteEntity = {
  kind: StudioPaletteEntityKind;
  /** Уникальный ключ cmdk. */
  id: string;
  label: string;
  tabId: string;
};

export type StudioPaletteTab = {
  id: string;
  title: string;
};

export type StudioCommandHost = {
  entities: readonly StudioPaletteEntity[];
  tabs: readonly StudioPaletteTab[];
  activeTabId?: string;
  openEntity: (tabId: string) => void;
  create: (actionId: HubActionId) => void;
  switchTab: (tabId: string) => void;
  closeActiveTab: () => void;
  validate: () => void;
  baseline?: () => void;
  goToDefinition: () => void;
  goToReferences: () => void;
  peekDefinition: () => void;
  navigateBack: () => void;
  quickFix: () => void;
  showOutline: () => void;
  /** FE-ED-3 */
  gotoLine: () => void;
  selectHighlights: () => void;
};

type Listener = () => void;

let host: StudioCommandHost | null = null;
const listeners = new Set<Listener>();

export function setStudioCommandHost(next: StudioCommandHost | null): void {
  host = next;
  for (const listener of listeners) {
    listener();
  }
}

export function getStudioCommandHost(): StudioCommandHost | null {
  return host;
}

export function subscribeStudioCommandHost(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const ENTITY_KIND_LABEL: Record<StudioPaletteEntityKind, string> = {
  page: 'Модель',
  scenario: 'Сценарий',
  module: 'Модуль',
  fuzzer: 'Fuzzer',
  resource: 'Ресурс',
};
