/**
 * Экспорт манифеста: режим A (authoring) vs B (runtime/share).
 * RK-SPLIT: runtime mode serialises to flat {regulation, editor} JSON.
 */
import { flattenConstructorsInData } from '../keywords/constructor';
import { redactWiredSecrets, REDACT_PLACEHOLDER } from './redact';

export type WiredExportMode = 'authoring' | 'runtime';

/** UI-структура (папки, fuzzer_targets) нужна только авторскому Редактору, не runtime. */
function omitEditorFolders(data: unknown): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }
  const root = data as Record<string, unknown>;
  const suites = root.test_suites;
  if (suites === null || typeof suites !== 'object' || Array.isArray(suites)) {
    return data;
  }
  const {
    editor_folders: _ef,
    folders: _f,
    fuzzer_targets: _ft,
    ...runtimeSuites
  } = suites as Record<string, unknown>;
  return { ...root, test_suites: runtimeSuites };
}

/** Полезная нагрузка JSON (без pretty-print). */
export function exportWiredPayload(
  formData: unknown,
  mode: WiredExportMode,
): unknown {
  if (mode === 'runtime') {
    // Runtime: flatten constructors + redact secrets. Raw formData already
    // matches the Pydantic Wired model. RK-SPLIT {regulation, editor} is only
    // for authoring download.
    return redactWiredSecrets(flattenConstructorsInData(omitEditorFolders(formData)));
  }
  return formData;
}

export function exportWiredJson(
  formData: unknown,
  mode: WiredExportMode,
): string {
  return `${JSON.stringify(exportWiredPayload(formData, mode), null, 2)}\n`;
}

/** Есть ли в дереве маски `***` (импорт режима B). */
export function wiredHasRedactPlaceholders(data: unknown): boolean {
  if (typeof data === 'string') {
    return data === REDACT_PLACEHOLDER;
  }
  if (Array.isArray(data)) {
    return data.some((item) => wiredHasRedactPlaceholders(item));
  }
  if (data !== null && typeof data === 'object') {
    return Object.values(data as Record<string, unknown>).some((child) =>
      wiredHasRedactPlaceholders(child),
    );
  }
  return false;
}
