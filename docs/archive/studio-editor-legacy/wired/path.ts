/**
 * Чтение/запись по dotted-пути в плоском typed JSON.
 * Чистые функции без мутации входного объекта.
 * Порт из to-sanitize/wired/path.ts.
 */

export function getPath(state: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = state;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Возвращает новый объект с записанным значением (иммутабельно). */
export function setPath<T>(state: T, path: string, value: unknown): T {
  const parts = path.split('.');
  if (parts.length === 0) {
    return state;
  }
  const root: Record<string, unknown> =
    state !== null && typeof state === 'object'
      ? { ...(state as Record<string, unknown>) }
      : {};
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i] as string;
    const next = cur[p];
    const branch: Record<string, unknown> =
      next !== null && typeof next === 'object' && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};
    cur[p] = branch;
    cur = branch;
  }
  cur[parts[parts.length - 1] as string] = value;
  return root as T;
}
