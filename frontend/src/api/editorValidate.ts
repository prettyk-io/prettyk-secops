/**
 * Backend-валидатор конструкторов (тот же каталог/правила, что рантайм).
 * Dev: Vite proxy /api → tools/data_playground.py :8765.
 */
import type { ConstructorDiagnostic } from '../keywords/constructor';
import {
  formatDiagLocation,
  objectIdFromConstructorPath,
  offsetToLineCol,
} from '../keywords/diagLocation';

type ApiDiag = {
  severity: 'error' | 'warning';
  message: string;
  start: number;
  end: number;
  line?: number;
  column?: number;
  wirek?: string;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status >= 500) {
    throw new Error(`editor API HTTP ${String(response.status)}`);
  }
  return (await response.json()) as T;
}

export async function validateAuthModuleBackend(
  text: string,
  moduleId = '',
  coordinateSpace: 'logical' | 'model' = 'logical',
): Promise<ConstructorDiagnostic[] | null> {
  try {
    const payload = await postJson<{ ok: boolean; diagnostics: ApiDiag[] }>(
      '/api/validate/auth-module',
      { text, module_id: moduleId },
    );
    if (!Array.isArray(payload.diagnostics)) {
      return null;
    }
    return payload.diagnostics.map((item) => {
      const start = item.start ?? 0;
      const end = item.end ?? Math.max(start, text.length);
      let line = item.line;
      let column = item.column;
      if (line == null || line < 1) {
        const loc = offsetToLineCol(text, start);
        line = loc.line;
        column = loc.column;
      }
      return {
        severity: item.severity === 'warning' ? 'warning' : 'error',
        message: `[backend] ${item.message}`,
        start,
        end,
        line,
        column,
        coordinateSpace,
      };
    });
  } catch {
    return null;
  }
}

export async function validateConstructorBackend(
  text: string,
  coordinateSpace: 'logical' | 'model' = 'logical',
): Promise<ConstructorDiagnostic[] | null> {
  try {
    const payload = await postJson<{ ok: boolean; diagnostics: ApiDiag[] }>(
      '/api/validate/constructor',
      { text },
    );
    // Fail-closed: без массива diagnostics API считаем мёртвым.
    if (!Array.isArray(payload.diagnostics)) {
      return null;
    }
    return payload.diagnostics.map((item) => {
      const start = item.start ?? 0;
      const end = item.end ?? Math.max(start, text.length);
      let line = item.line;
      let column = item.column;
      if (line == null || line < 1) {
        const loc = offsetToLineCol(text, start);
        line = loc.line;
        column = loc.column;
      }
      return {
        severity: item.severity === 'warning' ? 'warning' : 'error',
        message: `[backend] ${item.message}`,
        start,
        end,
        line,
        column,
        coordinateSpace,
      };
    });
  } catch {
    // API не запущен — остаёмся на клиентской диагностике.
    return null;
  }
}

export type ConstructorBatchFail = {
  id: string;
  path: string;
  /** id сценария / страницы, если удалось. */
  objectId: string;
  message: string;
  line?: number;
  column?: number;
};

/** Строка для списка пингвина: id · строка:столбец — сообщение. */
export function formatPenguinFailSample(fail: ConstructorBatchFail): string {
  const loc = formatDiagLocation(fail.line, fail.column);
  return `${fail.objectId}  ${loc}  —  ${fail.message}`;
}

function failFromDiag(
  meta: { id: string; path: string; text: string },
  message: string,
  diag: { start?: number; end?: number; line?: number; column?: number },
  data: unknown,
): ConstructorBatchFail {
  let line = diag.line;
  let column = diag.column;
  if ((line == null || line < 1) && typeof diag.start === 'number') {
    const loc = offsetToLineCol(meta.text, diag.start);
    line = loc.line;
    column = loc.column;
  }
  return {
    id: meta.id,
    path: meta.path,
    objectId: objectIdFromConstructorPath(data, meta.path),
    message,
    line,
    column,
  };
}

/**
 * Batch-validate всех конструкторов.
 * `null` — API недоступен (гейт не блокируем).
 */
export async function validateConstructorsBatch(
  items: readonly { id: string; path: string; text: string }[],
  data?: unknown,
): Promise<ConstructorBatchFail[] | null> {
  if (items.length === 0) {
    return [];
  }
  try {
    const payload = await postJson<{
      ok: boolean;
      results: { id?: string; ok: boolean; diagnostics: ApiDiag[] }[];
    }>('/api/validate/constructors', {
      items: items.map((item) => ({ id: item.id, text: item.text })),
    });
    // Fail-closed: кривой ответ без results → client fallback на гейте.
    if (!Array.isArray(payload.results)) {
      return null;
    }
    const byId = new Map(items.map((item) => [item.id, item]));
    const fails: ConstructorBatchFail[] = [];
    for (const result of payload.results) {
      const errors = (result.diagnostics ?? []).filter((d) => d.severity === 'error');
      if (errors.length === 0) {
        continue;
      }
      const meta = byId.get(String(result.id ?? ''));
      if (!meta) {
        continue;
      }
      const err = errors[0]!;
      fails.push(failFromDiag(meta, err.message, err, data));
    }
    return fails;
  } catch {
    return null;
  }
}

export async function validateDataScriptBackend(
  script: string,
): Promise<{ ok: boolean; diagnostics: ApiDiag[] } | null> {
  try {
    return await postJson('/api/validate/data-script', { script });
  } catch {
    return null;
  }
}

/** Клиентская диагностика → тот же формат, что batch API. */
export function batchFailFromClientDiag(
  meta: { id: string; path: string; text: string },
  diag: { message: string; start?: number; end?: number },
  data: unknown,
): ConstructorBatchFail {
  return failFromDiag(meta, diag.message, diag, data);
}
