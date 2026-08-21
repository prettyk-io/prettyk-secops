/**
 * Смещение в тексте → строка:столбец (1-based), как в Monaco.
 */

export type LineCol = { line: number; column: number };

export function offsetToLineCol(text: string, offset: number): LineCol {
  const safe = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < safe; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lastNl = i;
    }
  }
  return { line, column: safe - lastNl };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function testSuitesRecord(data: unknown): Record<string, unknown> | undefined {
  return asRecord(asRecord(data)?.test_suites);
}

function stringField(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function idFromArrayRow(
  rows: unknown,
  index: number,
  fallback: string,
  nameKeys: string[],
): string | undefined {
  if (!Array.isArray(rows) || !Number.isFinite(index) || !rows[index]) {
    return undefined;
  }
  const row = asRecord(rows[index]);
  if (!row) {
    return fallback;
  }
  return stringField(row, ...nameKeys) ?? fallback;
}

function objectIdFromScenarios(data: unknown, parts: string[]): string | undefined {
  const scenIdx = parts.indexOf('scenarios');
  if (scenIdx < 0) {
    return undefined;
  }
  const index = Number(parts[scenIdx + 1]);
  const scenarios = testSuitesRecord(data)?.scenarios;
  return idFromArrayRow(scenarios, index, `scenarios[${String(index)}]`, [
    'scenario_name',
    'id',
    'title',
  ]);
}

function objectIdFromModules(data: unknown, parts: string[]): string | undefined {
  const moduleIdx = parts.indexOf('test_data_constructor');
  if (moduleIdx < 0) {
    return undefined;
  }
  const index = Number(parts[moduleIdx + 1]);
  const modules = testSuitesRecord(data)?.test_data_constructor;
  return idFromArrayRow(modules, index, `module[${String(index)}]`, [
    'id',
    'module_type',
    'title',
  ]);
}

/** Подпись объекта из JSON-path конструктора + formData. */
export function objectIdFromConstructorPath(data: unknown, path: string): string {
  const parts = path.split('/').filter(Boolean);
  const pagesIdx = parts.indexOf('pages');
  if (pagesIdx >= 0 && parts[pagesIdx + 1]) {
    return parts[pagesIdx + 1]!;
  }
  const fromScenario = objectIdFromScenarios(data, parts);
  if (fromScenario) {
    return fromScenario;
  }
  const fromModule = objectIdFromModules(data, parts);
  if (fromModule) {
    return fromModule;
  }
  return path;
}

export function formatDiagLocation(line?: number, column?: number): string {
  if (line == null || line < 1) {
    return '?:?';
  }
  return `${String(line)}:${String(column != null && column >= 1 ? column : 1)}`;
}
