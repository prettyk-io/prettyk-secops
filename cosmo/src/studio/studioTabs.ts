/**
 * Вкладки Редактора: page / scenario / module (PrettyK) / resource / fuzzer (форма).
 * Шагов в UI нет: сценарий правит constructor скрытого steps[0] (схема SoT).
 */

export type StudioTabId =
  | 'action-hub'
  | `page:${string}`
  | `scenario:${number}`
  | `module:${number}`
  | `resource:${number}`
  | `fuzzer:${number}`;

export type StudioTabKind = 'constructor' | 'resource' | 'fuzzer';

export interface StudioTab {
  id: StudioTabId;
  title: string;
  language: 'pk-constructor' | 'resource-form' | 'fuzzer-form';
  /** JSON Pointer до текстового поля (constructor/editor); для resource/fuzzer — пусто. */
  path: string;
  readOnly: boolean;
  kind: StudioTabKind;
  resourceIndex?: number;
  fuzzerIndex?: number;
}

/** Пустой ключ страницы из Формы (RJSF additionalProperties). */
export const EMPTY_PAGE_TAB_ID: StudioTabId = 'page:__empty__';

/** Невидимый черновик Action Hub (каталог по `+` / когда нет документных вкладок). */
export function actionHubDraftTab(): StudioTab {
  return {
    id: 'action-hub',
    title: ' ',
    language: 'pk-constructor',
    path: '',
    readOnly: false,
    kind: 'constructor',
  };
}

export function isDocumentStudioTab(tab: Pick<StudioTab, 'id'>): boolean {
  return tab.id !== 'action-hub';
}

export function isStudioTabId(value: string): value is StudioTabId {
  if (value === 'action-hub') {
    return true;
  }
  if (value === EMPTY_PAGE_TAB_ID) {
    return true;
  }
  if (value.startsWith('page:') && value.length > 'page:'.length) {
    return true;
  }
  if (/^scenario:\d+$/.test(value)) {
    return true;
  }
  if (/^module:\d+$/.test(value)) {
    return true;
  }
  if (/^resource:\d+$/.test(value)) {
    return true;
  }
  return /^fuzzer:\d+$/.test(value);
}

export function pageTabId(pageId: string): StudioTabId {
  return pageId.length === 0 ? EMPTY_PAGE_TAB_ID : `page:${pageId}`;
}

export function pageIdFromTabId(tabId: StudioTabId): string | undefined {
  if (!tabId.startsWith('page:')) {
    return undefined;
  }
  if (tabId === EMPTY_PAGE_TAB_ID) {
    return '';
  }
  return tabId.slice('page:'.length);
}

export function scenarioTabId(scenarioIndex: number): StudioTabId {
  return `scenario:${scenarioIndex}`;
}

export function scenarioIndexFromTabId(tabId: StudioTabId): number | undefined {
  const match = /^scenario:(\d+)$/.exec(tabId);
  return match ? Number(match[1]) : undefined;
}

/** JSON Pointer до constructor первого шага (единственный редактируемый срез сценария). */
export function scenarioConstructorPointer(scenarioIndex: number): string {
  return `/test_suites/scenarios/${String(scenarioIndex)}/steps/0/constructor`;
}

export function moduleTabId(index: number): StudioTabId {
  return `module:${index}`;
}

export function resourceTabId(index: number): StudioTabId {
  return `resource:${index}`;
}

export function fuzzerTabId(index: number): StudioTabId {
  return `fuzzer:${index}`;
}

export function moduleIndexFromTabId(tabId: StudioTabId): number | undefined {
  const match = /^module:(\d+)$/.exec(tabId);
  return match ? Number(match[1]) : undefined;
}

export function resourceIndexFromTabId(tabId: StudioTabId): number | undefined {
  const match = /^resource:(\d+)$/.exec(tabId);
  return match ? Number(match[1]) : undefined;
}

export function fuzzerIndexFromTabId(tabId: StudioTabId): number | undefined {
  const match = /^fuzzer:(\d+)$/.exec(tabId);
  return match ? Number(match[1]) : undefined;
}
