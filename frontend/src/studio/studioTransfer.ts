/**
 * IMPX-2: extract/merge editor-блоков между проверками.
 * Работает с legacy formData (test_suites.*) — тем же форматом, что студийные мутаторы.
 */
import { readEditorFolders, type EditorFolder } from './studioFolders';

/* ── Types ── */

export interface EditorBlocks {
  /** pages → Record<id, body> (полная копия test_suites.pages) */
  pages: Record<string, unknown>;
  /** scenarios → копия массива test_suites.scenarios */
  scenarios: unknown[];
  /** modules → копия test_suites.test_data_constructor */
  modules: unknown[];
  /** fuzzers → копия test_suites.fuzzers */
  fuzzers: unknown[];
  /** resources → копия test_suites.imports */
  resources: unknown[];
  /** folders → полный слепок editor_folders */
  folders: { pages: EditorFolder[]; scenarios: EditorFolder[]; modules: EditorFolder[]; fuzzers: EditorFolder[]; resources: EditorFolder[] };
}

export interface MergeReport {
  /** Сколько сущностей каждого типа добавилось (пропущенные дубли не считаются) */
  added: { pages: number; scenarios: number; modules: number; fuzzers: number; resources: number };
}

/* ── Helpers ── */

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

function shallowCopy(v: unknown): unknown {
  if (Array.isArray(v)) return [...v];
  if (v && typeof v === 'object') return { ...(v as Record<string, unknown>) };
  return v;
}

/* ── Extract ── */

/**
 * Извлекает editor-блоки из formData.
 * Возвращает глубокую копию — source formData не мутируется.
 */
export function extractEditorBlocks(formData: unknown): EditorBlocks {
  const suites = asRecord(asRecord(formData)?.test_suites) ?? {};
  return {
    pages: deepCopyPages(suites.pages),
    scenarios: safeArrayCopy(suites.scenarios),
    modules: safeArrayCopy(suites.test_data_constructor),
    fuzzers: safeArrayCopy(suites.fuzzers),
    resources: safeArrayCopy(suites.imports),
    folders: readEditorFolders(formData),
  };
}

function deepCopyPages(raw: unknown): Record<string, unknown> {
  const src = asRecord(raw) ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    out[key] = shallowCopy(value);
  }
  return out;
}

function safeArrayCopy(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => shallowCopy(item));
}

/* ── Merge ── */

/**
 * Вливает блоки из source в target formData.
 * Дубли определяются по:
 *   - pages: ключ (python-id)
 *   - scenarios: scenario_name
 *   - modules: id
 *   - fuzzers: id
 *   - resources: as
 *   - folders: id папки в секции
 *
 * Возвращает { data: merged formData, report }. Target не мутируется.
 */
export function mergeEditorBlocks(
  targetFormData: unknown,
  blocks: EditorBlocks,
): { data: unknown; report: MergeReport } {
  const root = { ...(asRecord(targetFormData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };

  const report: MergeReport = {
    added: { pages: 0, scenarios: 0, modules: 0, fuzzers: 0, resources: 0 },
  };

  // ── Pages ──
  const existingPages = asRecord(suites.pages) ?? {};
  const mergedPages: Record<string, unknown> = { ...existingPages };
  for (const [key, value] of Object.entries(blocks.pages)) {
    if (!(key in mergedPages)) {
      mergedPages[key] = shallowCopy(value);
      report.added.pages += 1;
    }
  }
  suites.pages = mergedPages;

  // ── Scenarios ──
  const existingScenarios: unknown[] = Array.isArray(suites.scenarios) ? suites.scenarios as unknown[] : [];
  const existingNames = new Set(
    existingScenarios
      .map((s) => { const r = asRecord(s); return typeof r?.scenario_name === 'string' ? r.scenario_name : ''; })
      .filter(Boolean),
  );
  const mergedScenarios = [...existingScenarios];
  for (const scenario of blocks.scenarios) {
    const name = typeof asRecord(scenario)?.scenario_name === 'string'
      ? (asRecord(scenario) as Record<string, unknown>).scenario_name as string
      : '';
    if (!name || existingNames.has(name)) continue;
    mergedScenarios.push(shallowCopy(scenario));
    existingNames.add(name);
    report.added.scenarios += 1;
  }
  suites.scenarios = mergedScenarios;

  // ── Modules (test_data_constructor) ──
  const existingModules: unknown[] = Array.isArray(suites.test_data_constructor)
    ? suites.test_data_constructor as unknown[] : [];
  const existingModuleIds = new Set(
    existingModules
      .map((m) => { const r = asRecord(m); return typeof r?.id === 'string' ? r.id : ''; })
      .filter(Boolean),
  );
  const mergedModules = [...existingModules];
  for (const mod of blocks.modules) {
    const id = typeof asRecord(mod)?.id === 'string' ? asRecord(mod)!.id as string : '';
    if (!id || existingModuleIds.has(id)) continue;
    mergedModules.push(shallowCopy(mod));
    existingModuleIds.add(id);
    report.added.modules += 1;
  }
  suites.test_data_constructor = mergedModules;

  // ── Fuzzers ──
  const existingFuzzers: unknown[] = Array.isArray(suites.fuzzers) ? suites.fuzzers as unknown[] : [];
  const existingFuzzerIds = new Set(
    existingFuzzers
      .map((f) => { const r = asRecord(f); return typeof r?.id === 'string' ? r.id : ''; })
      .filter(Boolean),
  );
  const mergedFuzzers = [...existingFuzzers];
  for (const fuzzer of blocks.fuzzers) {
    const id = typeof asRecord(fuzzer)?.id === 'string' ? asRecord(fuzzer)!.id as string : '';
    if (!id || existingFuzzerIds.has(id)) continue;
    mergedFuzzers.push(shallowCopy(fuzzer));
    existingFuzzerIds.add(id);
    report.added.fuzzers += 1;
  }
  suites.fuzzers = mergedFuzzers;

  // ── Resources (imports) ──
  const existingImports: unknown[] = Array.isArray(suites.imports) ? suites.imports as unknown[] : [];
  const existingAs = new Set(
    existingImports
      .map((imp) => {
        if (typeof imp === 'string') {
          // fallback: stem из path
          const slash = Math.max(imp.lastIndexOf('/'), imp.lastIndexOf('\\'));
          const leaf = slash >= 0 ? imp.slice(slash + 1) : imp;
          const dot = leaf.lastIndexOf('.');
          return dot > 0 ? leaf.slice(0, dot) : leaf;
        }
        const r = asRecord(imp);
        return typeof r?.as === 'string' ? r.as : '';
      })
      .filter(Boolean),
  );
  const mergedImports = [...existingImports];
  for (const resource of blocks.resources) {
    const as = getResourceAs(resource);
    if (!as || existingAs.has(as)) continue;
    mergedImports.push(shallowCopy(resource));
    existingAs.add(as);
    report.added.resources += 1;
  }
  suites.imports = mergedImports;

  // ── Folders ──
  suites.editor_folders = mergeFolders(
    asRecord(suites.editor_folders) ?? {},
    blocks.folders,
  );

  return {
    data: { ...root, test_suites: suites },
    report,
  };
}

function getResourceAs(resource: unknown): string {
  if (typeof resource === 'string') {
    const slash = Math.max(resource.lastIndexOf('/'), resource.lastIndexOf('\\'));
    const leaf = slash >= 0 ? resource.slice(slash + 1) : resource;
    const dot = leaf.lastIndexOf('.');
    return dot > 0 ? leaf.slice(0, dot) : leaf;
  }
  const r = asRecord(resource);
  return typeof r?.as === 'string' ? r.as : '';
}

function mergeFolders(
  existingRaw: Record<string, unknown>,
  incoming: EditorBlocks['folders'],
): Record<string, unknown> {
  const sections = ['pages', 'scenarios', 'modules', 'fuzzers', 'resources'] as const;
  const out: Record<string, unknown> = {};

  for (const section of sections) {
    const existing: EditorFolder[] = Array.isArray(existingRaw[section])
      ? (existingRaw[section] as unknown[]).map(readFolderSafe).filter(Boolean) as EditorFolder[]
      : [];
    const existingIds = new Set(existing.map((f) => f.id));

    const merged = [...existing];
    for (const folder of incoming[section]) {
      if (existingIds.has(folder.id)) continue;
      merged.push({ ...folder, members: [...folder.members] });
      existingIds.add(folder.id);
    }

    out[section] = merged.map((f) => ({
      id: f.id,
      title: f.title,
      members: [...new Set(f.members)],
    }));
  }

  return out;
}

function readFolderSafe(value: unknown): EditorFolder | undefined {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string') return undefined;
  const id = raw.id.trim();
  const title = raw.title.trim();
  if (!id || !title) return undefined;
  const members = Array.isArray(raw.members)
    ? raw.members.filter((m): m is string => typeof m === 'string' && m.length > 0)
    : [];
  return { id, title, members: [...new Set(members)] };
}

/* ── Preview helper ── */

/**
 * Считает количество блоков каждого типа в исходной проверке.
 * Для UI-превью в StudioImportDialog — «в проверке X: 3 страницы, 1 сценарий, …».
 */
export function countBlocks(blocks: EditorBlocks): {
  pages: number;
  scenarios: number;
  modules: number;
  fuzzers: number;
  resources: number;
} {
  return {
    pages: Object.keys(blocks.pages).length,
    scenarios: blocks.scenarios.length,
    modules: blocks.modules.length,
    fuzzers: blocks.fuzzers.length,
    resources: blocks.resources.length,
  };
}

/* ── Selection (для StudioImportDialog) ── */

/** Какие типы блоков пользователь хочет импортировать. */
export interface BlockSelection {
  pages: boolean;
  scenarios: boolean;
  modules: boolean;
  fuzzers: boolean;
  resources: boolean;
}

export const ALL_BLOCKS_SELECTED: BlockSelection = {
  pages: true,
  scenarios: true,
  modules: true,
  fuzzers: true,
  resources: true,
};

/** Оставить в blocks только выбранные типы (папки фильтруются по секциям). */
export function selectBlocks(blocks: EditorBlocks, selection: BlockSelection): EditorBlocks {
  return {
    pages: selection.pages ? blocks.pages : {},
    scenarios: selection.scenarios ? blocks.scenarios : [],
    modules: selection.modules ? blocks.modules : [],
    fuzzers: selection.fuzzers ? blocks.fuzzers : [],
    resources: selection.resources ? blocks.resources : [],
    folders: {
      pages: selection.pages ? blocks.folders.pages : [],
      scenarios: selection.scenarios ? blocks.folders.scenarios : [],
      modules: selection.modules ? blocks.folders.modules : [],
      fuzzers: selection.fuzzers ? blocks.folders.fuzzers : [],
      resources: selection.resources ? blocks.folders.resources : [],
    },
  };
}

/** То, что StudioImportDialog отдаёт в App для вливания в текущую проверку. */
export interface ImportBlocksPayload {
  blocks: EditorBlocks;
  /** Содержимое импортируемых ресурсов (as → text), если есть. */
  resourceContents?: Record<string, string>;
}
