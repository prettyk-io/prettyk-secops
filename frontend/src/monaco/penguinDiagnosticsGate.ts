/**
 * Client-side diagnostics gate for the validate/penguin pipeline.
 *
 * RUN-GATE-MARKERS: гейт проверяет **модели видимых редакторов** (поверхность,
 * которую оператор видит сейчас), а не все открытые модели Monaco-инстанса.
 * Причина: вьюхи keep-mounted (`hidden`-панели, `keepCurrentModel`) — stale-
 * маркеры скрытых моделей копились и блокировали Run при чистом документе.
 *
 * Контракт `collectGateDiagnostics`:
 *   1) editor-API доступен (`monaco.editor.getEditors`) → сканируются только
 *      модели редакторов, реально видимых в DOM (offsetParent + bbox > 0);
 *      видимых редакторов нет → пусто = блокировки нет;
 *   2) editor-API нет (тесты/урезанные контуры) → fallback на модель,
 *      зарегистрированную `setActiveGateModel` (EditorWorkbench);
 *   3) скоуп не регистрировался → legacy-скан всех моделей (прежнее поведение
 *      `collectAllMonacoDiagnostics`).
 *
 * `clearGateMarkersForModel` — точечная очистка stale-маркеров гейта.
 */
import type * as monacoNs from 'monaco-editor';

export interface MarkerDiagnostic {
  path: string;
  line: number;
  message: string;
  owner: string;
}

const DIAGNOSTIC_OWNERS = [
  'prettyk-diagnostics',
  'security-diagnostics',
  'pk-constructor',
] as const;

/** Владельцы маркеров, которые участвуют в гейте (для очистки stale). */
export const GATE_MARKER_OWNERS: readonly string[] = DIAGNOSTIC_OWNERS;

const BLOCKING_SEVERITY = 4; // warning/error

function collectModelDiagnostics(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
): MarkerDiagnostic[] {
  const result: MarkerDiagnostic[] = [];
  const markers = monaco.editor.getModelMarkers({ resource: model.uri });
  for (const m of markers) {
    if ((DIAGNOSTIC_OWNERS as readonly string[]).includes(m.owner) && m.severity >= BLOCKING_SEVERITY) {
      result.push({
        path: model.uri.path,
        line: m.startLineNumber,
        message: m.message,
        owner: m.owner,
      });
    }
  }
  return result;
}

/** Legacy-скан: маркеры гейта по ВСЕМ открытым моделям (fallback/тесты). */
export function collectAllMonacoDiagnostics(
  monaco: typeof monacoNs,
): MarkerDiagnostic[] {
  const result: MarkerDiagnostic[] = [];
  for (const model of monaco.editor.getModels()) {
    result.push(...collectModelDiagnostics(monaco, model));
  }
  return result;
}

// ── RUN-GATE-MARKERS: скоуп активной модели ─────────────────────────────

let activeGateModel: monacoNs.editor.ITextModel | null = null;
let gateScopeInitialized = false;

/** Fallback-скоуп гейта (контуры без `editor.getEditors`), владелец — EditorWorkbench. */
export function setActiveGateModel(model: monacoNs.editor.ITextModel | null): void {
  activeGateModel = model;
  if (model) {
    gateScopeInitialized = true;
  }
}

export function getActiveGateModel(): monacoNs.editor.ITextModel | null {
  return activeGateModel;
}

/** Только для тестов: сбросить скоуп к «не инициализирован». */
export function resetActiveGateModelForTests(): void {
  activeGateModel = null;
  gateScopeInitialized = false;
}

/**
 * Модели редакторов, которые оператор видит сейчас. `null` — editor-API нет
 * (тесты/урезанный контур), вызывающий уходит в fallback-цепочку. Пустой массив
 * — редакторы есть, но ни один не видим (скрытые keep-mounted панели).
 */
function collectVisibleEditorModels(
  monaco: typeof monacoNs,
): monacoNs.editor.ITextModel[] | null {
  const editorApi = monaco?.editor;
  if (!editorApi || typeof editorApi.getEditors !== 'function') {
    return null;
  }
  let editors: readonly monacoNs.editor.ICodeEditor[];
  try {
    editors = editorApi.getEditors();
  } catch {
    return null;
  }
  if (!Array.isArray(editors)) {
    return null;
  }
  const models = new Map<string, monacoNs.editor.ITextModel>();
  for (const ed of editors) {
    try {
      const dom = ed.getDomNode?.();
      if (!dom || !dom.isConnected) continue;
      // display:none у hidden-панели обнуляет offsetParent; свёрнутый контейнер
      // отсекаем нулевым bbox.
      if (dom.offsetParent === null) continue;
      const rect = dom.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const model = ed.getModel?.();
      if (model && !model.isDisposed?.()) {
        models.set(model.uri.toString(), model);
      }
    } catch {
      /* редактор disposed между вызовами — пропускаем */
    }
  }
  return [...models.values()];
}

/**
 * Маркеры для гейта: модели видимых редакторов (основной путь); без editor-API
 * — зарегистрированная активная модель; без регистрации — legacy-скан всех.
 */
export function collectGateDiagnostics(
  monaco: typeof monacoNs,
): MarkerDiagnostic[] {
  const visibleModels = collectVisibleEditorModels(monaco);
  if (visibleModels !== null) {
    const result: MarkerDiagnostic[] = [];
    for (const model of visibleModels) {
      try {
        result.push(...collectModelDiagnostics(monaco, model));
      } catch {
        /* модель disposed — пропускаем */
      }
    }
    return result;
  }
  if (!gateScopeInitialized) {
    return collectAllMonacoDiagnostics(monaco);
  }
  const model = activeGateModel;
  if (!model) {
    return [];
  }
  try {
    return collectModelDiagnostics(monaco, model);
  } catch {
    // Модель disposed (сменили чек) — пустой скоуп честно = нечего блокировать.
    activeGateModel = null;
    return [];
  }
}

/** Снять все маркеры гейта с модели (гигиена при смене/закрытии документа). */
export function clearGateMarkersForModel(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
): void {
  for (const owner of DIAGNOSTIC_OWNERS) {
    try {
      monaco.editor.setModelMarkers(model, owner, []);
    } catch {
      /* модель могла быть disposed */
    }
  }
}

/** Returns true if there are blocking diagnostics that should prevent validation. */
export function hasBlockingDiagnostics(
  monaco: typeof monacoNs,
): boolean {
  return collectGateDiagnostics(monaco).length > 0;
}