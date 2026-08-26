/**
 * PK-WB-C1/C2/C3 — Commit Engine: immutable revisions, domain normalization,
 * and typed semantic change sets.
 *
 * C1: createCommit / listCommits / getCommit — immutable revision records
 * C2: normalizeWired — stable identity, field-order noise removal
 * C3: computeSemanticDiff — typed ADD_STEP / REMOVE_STEP / MODIFY_STEP / etc.
 */

// ---------------------------------------------------------------------------
// C1 — Immutable Commit Records
// ---------------------------------------------------------------------------

export interface CommitRecord {
  /** Устойчивый идентификатор ревизии (8-символьный hex хеш контента). */
  commitId: string;
  /** Хеш родительского коммита (null для первого). */
  parentHash: string | null;
  /** Полный хеш контента (wired + resources + message + timestamp). */
  contentHash: string;
  /** Сообщение оператора при фиксации. */
  message: string;
  /** ID оператора (из сессии / persAuth). */
  author: string;
  /** ISO-8601 timestamp создания. */
  timestamp: string;
  /** Зафиксированный wired (неизменяемый снимок). */
  wired: unknown;
  /** Зафиксированные ресурсы (неизменяемый снимок). */
  resources: Record<string, string>;
  /** Хеш для provenance-проверки: можно пересчитать и сравнить. */
  provenance: string;
}

export interface CommitStore {
  version: 1;
  commits: Record<string, CommitRecord[]>;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * djb2-like хеш строки — детерминированный и быстрый.
 * Не криптографический, но достаточен для обнаружения изменений.
 */
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function shortHash(input: string): string {
  return djb2(input).slice(0, 8);
}

/**
 * Полный хеш контента: wired + resources + message + timestamp.
 * Используется для commitId и contentHash.
 */
export function computeContentHash(
  wired: unknown,
  resources: Record<string, string>,
  message: string,
  timestamp: string,
): string {
  const payload = JSON.stringify({ w: wired, r: resources, m: message, t: timestamp });
  return djb2(payload);
}

/**
 * Хеш provenance: контент + родитель. Используется для цепочки доверия.
 */
function computeProvenanceHash(
  contentHash: string,
  parentHash: string | null,
  author: string,
  timestamp: string,
): string {
  const payload = JSON.stringify({ ch: contentHash, ph: parentHash, au: author, ts: timestamp });
  return djb2(payload);
}

// ---------------------------------------------------------------------------
// Store (in-memory + optional localStorage)
// ---------------------------------------------------------------------------

const COMMIT_STORE_KEY = 'pk.commits.v1';

let store: CommitStore = { version: 1, commits: {} };

function readStore(): CommitStore {
  try {
    const raw = localStorage.getItem(COMMIT_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CommitStore;
      if (parsed?.version === 1 && typeof parsed.commits === 'object') {
        return parsed;
      }
    }
  } catch {
    /* fall back to empty store */
  }
  return { version: 1, commits: {} };
}

function persistStore(): void {
  try {
    localStorage.setItem(COMMIT_STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
}

/** Инициализировать store из localStorage. */
export function initCommitStore(): void {
  store = readStore();
}

// ---------------------------------------------------------------------------
// C1 — createCommit / listCommits / getCommit
// ---------------------------------------------------------------------------

/**
 * Создать immutable ревизию.
 * Возвращает CommitRecord. Мутирует store (push в массив для checkId).
 */
export function createCommit(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
  opts: {
    message: string;
    author: string;
    timestamp?: string;
  },
): CommitRecord {
  const ts = opts.timestamp ?? new Date().toISOString();
  const normalized = normalizeWired(wired);
  const contentHash = computeContentHash(normalized, resources, opts.message, ts);
  const parentHash = getLatestParentHash(checkId);

  const commitId = shortHash(contentHash + ts);
  const provenance = computeProvenanceHash(contentHash, parentHash, opts.author, ts);

  const commit: CommitRecord = {
    commitId,
    parentHash,
    contentHash,
    message: opts.message,
    author: opts.author,
    timestamp: ts,
    wired: normalized,
    resources: { ...resources },
    provenance,
  };

  if (!store.commits[checkId]) {
    store.commits[checkId] = [];
  }
  store.commits[checkId].push(commit);
  persistStore();

  return commit;
}

function getLatestParentHash(checkId: string): string | null {
  const commits = store.commits[checkId];
  if (!commits || commits.length === 0) return null;
  return commits[commits.length - 1]!.contentHash;
}

/**
 * Получить список всех ревизий для чека (от старых к новым).
 */
export function listCommits(checkId: string): CommitRecord[] {
  return (store.commits[checkId] ?? []).slice();
}

/**
 * Получить конкретную ревизию по commitId.
 */
export function getCommit(checkId: string, commitId: string): CommitRecord | undefined {
  return (store.commits[checkId] ?? []).find((c) => c.commitId === commitId);
}

/**
 * Получить последнюю ревизию.
 */
export function getLatestCommit(checkId: string): CommitRecord | undefined {
  const commits = store.commits[checkId];
  if (!commits || commits.length === 0) return undefined;
  return commits[commits.length - 1];
}

/**
 * Проверить целостность цепочки provenance для всех ревизий чека.
 */
export function verifyProvenanceChain(checkId: string): boolean {
  const commits = store.commits[checkId];
  if (!commits || commits.length === 0) return true;

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]!;
    const expectedContent = computeContentHash(c.wired, c.resources, c.message, c.timestamp);
    if (expectedContent !== c.contentHash) return false;

    const expectedProvenance = computeProvenanceHash(
      c.contentHash,
      c.parentHash,
      c.author,
      c.timestamp,
    );
    if (expectedProvenance !== c.provenance) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// C2 — Domain Normalization
// ---------------------------------------------------------------------------

/**
 * Нормализовать wired для сравнения:
 * - рекурсивная сортировка ключей объектов (убирает шум перестановок полей)
 * - стабильные ID для сущностей (не зависят от порядка в массиве)
 *
 * ВАЖНО: НЕ мутирует исходный объект. Возвращает глубокую копию.
 */
export function normalizeWired(wired: unknown): unknown {
  if (wired === null || wired === undefined) return wired;

  if (Array.isArray(wired)) {
    return wired.map((item) => normalizeWired(item));
  }

  if (typeof wired === 'object') {
    const obj = wired as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    // Sort keys alphabetically for stable serialization
    const sortedKeys = Object.keys(obj).sort();

    for (const key of sortedKeys) {
      let value = obj[key];

      // Don't normalize inside constructor text (the DSL itself is user-authored,
      // order matters — it's line-based code)
      if (key === 'constructor' || key === 'content' || key === 'body') {
        result[key] = value;
        continue;
      }

      result[key] = normalizeWired(value);
    }

    return result;
  }

  return wired;
}

/**
 * Stable entity identity: детерминированный ключ для сущности
 * не зависящий от индекса в массиве. Использует scenario_name,
 * page key, import as-name, fuzzer title.
 */
export function stableEntityId(
  entity: Record<string, unknown>,
  fallbackIndex: number,
): string {
  // Сценарии идентифицируются по scenario_name
  if (entity.scenario_name && typeof entity.scenario_name === 'string') {
    return `scenario:${entity.scenario_name}`;
  }
  // Страницы — по первому ключу из title/path/key
  if (entity.title && typeof entity.title === 'string') {
    return `page:${entity.title}`;
  }
  if (entity.path && typeof entity.path === 'string') {
    return `page:${entity.path}`;
  }
  // Импорты — по as
  if (entity.as && typeof entity.as === 'string') {
    return `import:${entity.as}`;
  }
  // Фаззеры — по title/name
  if (entity.title && typeof entity.title === 'string') {
    return `fuzzer:${entity.title}`;
  }
  if (entity.name && typeof entity.name === 'string') {
    return `fuzzer:${entity.name}`;
  }
  // Падение на индекс
  return `entity:${fallbackIndex}`;
}

/**
 * Нормализовать массив сущностей (сценарии, страницы, импорты, фаззеры):
 * строит стабильный identity map для сравнения без зависимости от порядка.
 *
 * Возвращает Record<entityId, normalizedEntity>.
 */
export function normalizeEntityArray(
  arr: unknown[],
  kind: string,
): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  arr.forEach((item, idx) => {
    const entity = item as Record<string, unknown>;
    const id = stableEntityId(entity, idx);
    map[id] = entity;
  });
  return map;
}

// ---------------------------------------------------------------------------
// C3 — Typed Semantic Change Set
// ---------------------------------------------------------------------------

export type ChangeKind =
  | 'ADD_STEP'
  | 'REMOVE_STEP'
  | 'MODIFY_STEP'
  | 'RENAME_ENTITY'
  | 'MOVE_STEP'
  | 'ADD_SCENARIO'
  | 'REMOVE_SCENARIO'
  | 'MODIFY_REGULATION'
  | 'MODIFY_RESOURCE'
  | 'ADD_RESOURCE'
  | 'REMOVE_RESOURCE';

export interface SemanticChange {
  kind: ChangeKind;
  entityId: string;
  label: string;
  path?: string;
  before?: string | null;
  after?: string | null;
}

/**
 * Вычислить типизированный change set между двумя нормализованными wired-снимками.
 *
 * Сравнивает:
 * 1. Сценарии (по scenario_name): добавлен/удалён, шаги внутри,
 *    constructor внутри шагов.
 * 2. Страницы (по ключу): добавлена/удалена, constructor.
 * 3. Модули данных / импорты (по as): добавлены/удалены, content.
 * 4. Фаззеры (по title/name): добавлены/удалены, constructor.
 * 5. Регламент (meta, infrastructure, security_configuration): изменён.
 * 6. Ресурсы: добавлены/удалены/изменены.
 */
export function computeSemanticDiff(
  prevWired: unknown,
  nextWired: unknown,
  prevResources?: Record<string, string>,
  nextResources?: Record<string, string>,
): SemanticChange[] {
  const changes: SemanticChange[] = [];

  const prev = normalizeWired(prevWired) as Record<string, unknown>;
  const next = normalizeWired(nextWired) as Record<string, unknown>;

  const prevSuites = (prev?.test_suites ?? {}) as Record<string, unknown>;
  const nextSuites = (next?.test_suites ?? {}) as Record<string, unknown>;

  // ── Scenarios ──
  const prevScenarios = (Array.isArray(prevSuites.scenarios) ? prevSuites.scenarios : []) as Record<string, unknown>[];
  const nextScenarios = (Array.isArray(nextSuites.scenarios) ? nextSuites.scenarios : []) as Record<string, unknown>[];

  const prevScenarioMap = normalizeEntityArray(prevScenarios, 'scenario');
  const nextScenarioMap = normalizeEntityArray(nextScenarios, 'scenario');

  const allScenarioIds = new Set([...Object.keys(prevScenarioMap), ...Object.keys(nextScenarioMap)]);

  for (const id of allScenarioIds) {
    const prevSc = prevScenarioMap[id];
    const nextSc = nextScenarioMap[id];

    if (!prevSc && nextSc) {
      changes.push({
        kind: 'ADD_SCENARIO',
        entityId: id,
        label: String(nextSc.scenario_name || id),
      });
      continue;
    }
    if (prevSc && !nextSc) {
      changes.push({
        kind: 'REMOVE_SCENARIO',
        entityId: id,
        label: String(prevSc.scenario_name || id),
      });
      continue;
    }
    if (!prevSc || !nextSc) continue;

    // Check scenario rename
    const prevName = String(prevSc.scenario_name || '');
    const nextName = String(nextSc.scenario_name || '');
    if (prevName !== nextName) {
      changes.push({
        kind: 'RENAME_ENTITY',
        entityId: id,
        label: nextName,
        before: prevName,
        after: nextName,
      });
    }

    // Compare steps
    const prevSteps = (Array.isArray(prevSc.steps) ? prevSc.steps : []) as Record<string, unknown>[];
    const nextSteps = (Array.isArray(nextSc.steps) ? nextSc.steps : []) as Record<string, unknown>[];

    const maxSteps = Math.max(prevSteps.length, nextSteps.length);
    for (let si = 0; si < maxSteps; si++) {
      const prevStep = prevSteps[si];
      const nextStep = nextSteps[si];

      if (!prevStep && nextStep) {
        changes.push({
          kind: 'ADD_STEP',
          entityId: id,
          label: `${nextName}: step ${si + 1}`,
          path: `/${si}/steps`,
        });
        continue;
      }
      if (prevStep && !nextStep) {
        changes.push({
          kind: 'REMOVE_STEP',
          entityId: id,
          label: `${prevName}: step ${si + 1}`,
          path: `/${si}/steps`,
        });
        continue;
      }
      if (!prevStep || !nextStep) continue;

      const prevConstructor = String(prevStep.constructor || '');
      const nextConstructor = String(nextStep.constructor || '');

      if (prevConstructor !== nextConstructor) {
        changes.push({
          kind: 'MODIFY_STEP',
          entityId: id,
          label: `${nextName}: step ${si + 1}`,
          path: `/${si}/steps/${si}/constructor`,
          before: prevConstructor,
          after: nextConstructor,
        });
      }
    }
  }

  // Post-processing: detect RENAME when constructor matches across ADD+REMOVE
  const scenarioAdds = changes.filter((c) => c.kind === 'ADD_SCENARIO');
  const scenarioRemoves = changes.filter((c) => c.kind === 'REMOVE_SCENARIO');

  for (const add of scenarioAdds) {
    const addSc = nextScenarioMap[add.entityId];
    if (!addSc) continue;

    for (const rem of scenarioRemoves) {
      const remSc = prevScenarioMap[rem.entityId];
      if (!remSc) continue;

      const addSteps = addSc.steps as unknown[] | undefined;
      const remSteps = remSc.steps as unknown[] | undefined;

      const addConstr = String(
        (addSteps?.[0] as Record<string, unknown> | undefined)?.constructor ?? '',
      );
      const remConstr = String(
        (remSteps?.[0] as Record<string, unknown> | undefined)?.constructor ?? '',
      );

      if (addConstr && remConstr && addConstr === remConstr) {
        // Same constructor → this is a rename, not delete+create
        const remIdx = changes.indexOf(rem);
        const addIdx = changes.indexOf(add);
        if (remIdx >= 0 && addIdx >= 0) {
          changes[remIdx] = {
            kind: 'RENAME_ENTITY',
            entityId: rem.entityId,
            label: add.label,
            before: rem.label,
            after: add.label,
          };
          changes.splice(addIdx, 1);
        }
        break;
      }
    }
  }

  // ── Pages ──
  const prevPages = (prevSuites.pages ?? {}) as Record<string, Record<string, unknown>>;
  const nextPages = (nextSuites.pages ?? {}) as Record<string, Record<string, unknown>>;

  const allPageIds = new Set([...Object.keys(prevPages), ...Object.keys(nextPages)]);

  for (const pageId of allPageIds) {
    const prevPage = prevPages[pageId];
    const nextPage = nextPages[pageId];

    if (prevPage && !nextPage) {
      changes.push({
        kind: 'REMOVE_STEP',
        entityId: `page:${pageId}`,
        label: `Page: ${pageId}`,
      });
      continue;
    }
    if (!prevPage && nextPage) {
      changes.push({
        kind: 'ADD_STEP',
        entityId: `page:${pageId}`,
        label: `Page: ${pageId}`,
      });
      continue;
    }
    if (!prevPage || !nextPage) continue;

    const prevConstructor = String(prevPage.constructor || '');
    const nextConstructor = String(nextPage.constructor || '');

    if (prevConstructor !== nextConstructor) {
      changes.push({
        kind: 'MODIFY_STEP',
        entityId: `page:${pageId}`,
        label: `Page: ${pageId}`,
        before: prevConstructor,
        after: nextConstructor,
      });
    }
  }

  // ── Data modules (imports) ──
  const prevImports = (Array.isArray(prevSuites.imports) ? prevSuites.imports : []) as Record<string, unknown>[];
  const nextImports = (Array.isArray(nextSuites.imports) ? nextSuites.imports : []) as Record<string, unknown>[];

  const prevImportMap = normalizeEntityArray(prevImports, 'import');
  const nextImportMap = normalizeEntityArray(nextImports, 'import');

  const allImportIds = new Set([...Object.keys(prevImportMap), ...Object.keys(nextImportMap)]);

  for (const impId of allImportIds) {
    const prevImp = prevImportMap[impId];
    const nextImp = nextImportMap[impId];

    if (prevImp && !nextImp) {
      changes.push({
        kind: 'REMOVE_STEP',
        entityId: impId,
        label: `Import: ${impId}`,
      });
      continue;
    }
    if (!prevImp && nextImp) {
      changes.push({
        kind: 'ADD_STEP',
        entityId: impId,
        label: `Import: ${impId}`,
      });
      continue;
    }
    if (!prevImp || !nextImp) continue;

    const prevContent = String(prevImp.content || '');
    const nextContent = String(nextImp.content || '');

    if (prevContent !== nextContent) {
      changes.push({
        kind: 'MODIFY_STEP',
        entityId: impId,
        label: `Import: ${impId}`,
        before: prevContent,
        after: nextContent,
      });
    }
  }

  // ── Fuzzers ──
  const prevFuzzers = (Array.isArray(prevSuites.fuzzers) ? prevSuites.fuzzers : []) as Record<string, unknown>[];
  const nextFuzzers = (Array.isArray(nextSuites.fuzzers) ? nextSuites.fuzzers : []) as Record<string, unknown>[];

  const prevFuzzerMap = normalizeEntityArray(prevFuzzers, 'fuzzer');
  const nextFuzzerMap = normalizeEntityArray(nextFuzzers, 'fuzzer');

  const allFuzzerIds = new Set([...Object.keys(prevFuzzerMap), ...Object.keys(nextFuzzerMap)]);

  for (const fzId of allFuzzerIds) {
    const prevFz = prevFuzzerMap[fzId];
    const nextFz = nextFuzzerMap[fzId];

    if (prevFz && !nextFz) {
      changes.push({
        kind: 'REMOVE_STEP',
        entityId: fzId,
        label: `Fuzzer: ${fzId}`,
      });
      continue;
    }
    if (!prevFz && nextFz) {
      changes.push({
        kind: 'ADD_STEP',
        entityId: fzId,
        label: `Fuzzer: ${fzId}`,
      });
      continue;
    }
    if (!prevFz || !nextFz) continue;

    const prevConstructor = String(prevFz.constructor || '');
    const nextConstructor = String(nextFz.constructor || '');

    if (prevConstructor !== nextConstructor) {
      changes.push({
        kind: 'MODIFY_STEP',
        entityId: fzId,
        label: `Fuzzer: ${fzId}`,
        before: prevConstructor,
        after: nextConstructor,
      });
    }
  }

  // ── Regulation (meta, infrastructure, security_configuration) ──
  const prevMeta = JSON.stringify(prev.meta ?? {});
  const nextMeta = JSON.stringify(next.meta ?? {});
  const prevInfra = JSON.stringify(prev.infrastructure ?? {});
  const nextInfra = JSON.stringify(next.infrastructure ?? {});
  const prevSec = JSON.stringify(prev.security_configuration ?? {});
  const nextSec = JSON.stringify(next.security_configuration ?? {});

  if (prevMeta !== nextMeta) {
    changes.push({
      kind: 'MODIFY_REGULATION',
      entityId: 'regulation',
      label: 'Meta',
      before: prevMeta,
      after: nextMeta,
    });
  }
  if (prevInfra !== nextInfra) {
    changes.push({
      kind: 'MODIFY_REGULATION',
      entityId: 'regulation',
      label: 'Infrastructure',
      before: prevInfra,
      after: nextInfra,
    });
  }
  if (prevSec !== nextSec) {
    changes.push({
      kind: 'MODIFY_REGULATION',
      entityId: 'regulation',
      label: 'Security Configuration',
      before: prevSec,
      after: nextSec,
    });
  }

  // ── Resources ──
  if (prevResources && nextResources) {
    const allResIds = new Set([
      ...Object.keys(prevResources),
      ...Object.keys(nextResources),
    ]);

    for (const resId of allResIds) {
      const prevRes = prevResources[resId];
      const nextRes = nextResources[resId];

      if (prevRes === undefined && nextRes !== undefined) {
        changes.push({
          kind: 'ADD_RESOURCE',
          entityId: resId,
          label: `Resource: ${resId}`,
          after: nextRes,
        });
      } else if (prevRes !== undefined && nextRes === undefined) {
        changes.push({
          kind: 'REMOVE_RESOURCE',
          entityId: resId,
          label: `Resource: ${resId}`,
          before: prevRes,
        });
      } else if (prevRes !== nextRes) {
        changes.push({
          kind: 'MODIFY_RESOURCE',
          entityId: resId,
          label: `Resource: ${resId}`,
          before: prevRes,
          after: nextRes,
        });
      }
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function __resetCommitStoreForTests(): void {
  store = { version: 1, commits: {} };
  try {
    localStorage.removeItem(COMMIT_STORE_KEY);
  } catch {
    /* ignore */
  }
}

export function __getRawCommitStoreForTests(): CommitStore {
  return store;
}