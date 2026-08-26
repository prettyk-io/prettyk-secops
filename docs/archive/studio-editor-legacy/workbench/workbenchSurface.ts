/**
 * WorkbenchSurface — глобальная проекция CheckWorkspace.
 *
 * `[ Студия | Редактор ]` переключает не источник данных, а активную
 * поверхность одной рабочей области:
 *   - 'studio' — StudioWorkspace (канонический визуальный Action Hub);
 *   - 'editor' — EditorWorkbench (Monaco DSL Authoring Workbench).
 *
 * Обе поверхности читают/пишут один `formData` (single source of truth).
 * localStorage хранит только UI-предпочтение, не бизнес-данные.
 */

export type WorkbenchSurface = 'studio' | 'editor';

export const WORKBENCH_SURFACE_STORAGE_KEY = 'pk-workbench-surface';

export function readWorkbenchSurface(): WorkbenchSurface {
  if (typeof window === 'undefined') {
    return 'studio';
  }
  const stored = window.localStorage.getItem(WORKBENCH_SURFACE_STORAGE_KEY);
  return stored === 'editor' ? 'editor' : 'studio';
}

export function persistWorkbenchSurface(surface: WorkbenchSurface): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(WORKBENCH_SURFACE_STORAGE_KEY, surface);
}
