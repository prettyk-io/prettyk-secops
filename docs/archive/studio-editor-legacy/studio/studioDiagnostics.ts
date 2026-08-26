/**
 * Wire/MethodId-диагностика полотна Редактора.
 * Модули сюда не входят: их текст не обязан переводиться в `component|action|…`.
 */
import { readSecurityStrings } from '../app/appSecurityContext';
import type { KeywordCatalog } from '../keywords/catalog';
import {
  analyzeConstructor,
  type ConstructorDiagnostic,
  flattenConstructorText,
} from '../keywords/constructor';
import type { StudioTab } from './studioTabs';
import { moduleIndexFromTabId } from './studioTabs';
import { AUTH_MODULE_TYPE, moduleRecordAt } from './studioModules';

/** JSON Pointer полотна data-модуля. */
export function isDataModuleEditorPath(path: string): boolean {
  return path.includes('/data_storage_fields/editor');
}

export function isAuthModuleEditorPath(path: string): boolean {
  return path.includes('/auth_fields/constructor');
}

/** Вкладка модуля (`module:N`) — вне wire-контракта. */
export function isStudioModuleTab(tab: StudioTab | undefined): boolean {
  return tab !== undefined && moduleIndexFromTabId(tab.id) !== undefined;
}

/** Активная вкладка — auth-модуль (validate через /api/validate/auth-module). */
export function isAuthStudioConstructorTab(
  formData: unknown,
  tab: StudioTab | undefined,
): boolean {
  if (!tab) {
    return false;
  }
  if (isAuthModuleEditorPath(tab.path)) {
    return true;
  }
  const idx = moduleIndexFromTabId(tab.id);
  if (idx === undefined) {
    return false;
  }
  return moduleRecordAt(formData, idx)?.module_type === AUTH_MODULE_TYPE;
}

/** Полотно без языка pk-constructor: модули → plaintext. */
export function isPlainStudioConstructorTab(
  _formData: unknown,
  tab: StudioTab | undefined,
): boolean {
  if (!tab || tab.kind === 'resource') {
    return false;
  }
  return isStudioModuleTab(tab) || isDataModuleEditorPath(tab.path);
}

function allowedExtraFromForm(formData: unknown): string {
  return readSecurityStrings(formData).allowedExtraDomains;
}

function baseUrlFromForm(formData: unknown): string {
  return readSecurityStrings(formData).baseUrl;
}

/**
 * Маркеры Monaco для активного полотна.
 * Модули — всегда []: analyzeConstructor / `|` к ним не применяем.
 */
export function studioTabWireDiagnostics(
  formData: unknown,
  tab: StudioTab | undefined,
  text: string,
  catalog: KeywordCatalog,
  knownVariables: readonly string[] = [],
): ConstructorDiagnostic[] {
  if (!tab || tab.kind === 'resource' || isStudioModuleTab(tab)) {
    return [];
  }
  const wireText = flattenConstructorText(text);
  if (wireText.length === 0) {
    return [];
  }
  return analyzeConstructor(wireText, catalog, {
    knownVariables,
    allowedExtraDomains: allowedExtraFromForm(formData),
    baseUrl: baseUrlFromForm(formData),
  });
}
