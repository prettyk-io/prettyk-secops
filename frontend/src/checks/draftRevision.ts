/**
 * PK-WB-S2 — Revision-aware draft protocol.
 *
 * Optimistic concurrency control поверх draftPersistence.
 * Каждое сохранение возвращает monotonically-increasing revision.
 * При конфликте клиент получает серверную версию для diff+merge.
 *
 * Протокол:
 *   PUT /api/checks/:id/draft
 *     Header: X-Draft-Revision: <expectedRevision>
 *     Body: DraftPayload
 *   → 200 { revision: <next>, ... }
 *   → 409 { conflict: true, revision: <serverRev>, theirs: DraftPayload }
 */

import {
  computeDraftHash,
  DRAFT_FLUSH_MAX_MS,
  DRAFT_SAVE_DEBOUNCE_MS,
  type DraftPayload,
} from './draftPersistence';
import { API_BASE } from '../api/apiBase';
import type { ResourceContentsMap } from '../studio/resourceContents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftSaveResult {
  ok: true;
  revision: number;
}

export interface DraftConflict {
  ok: false;
  /** Серверный revision, который конфликтует с нашим expected. */
  serverRevision: number;
  /** Черновик, сохранённый другой стороной. */
  theirs: DraftPayload;
  /** Наш revision, который мы отправили (устарел). */
  ourRevision: number;
}

export type DraftRevisionResult = DraftSaveResult | DraftConflict;

// ---------------------------------------------------------------------------
// Revision state (per checkId, in-memory)
// ---------------------------------------------------------------------------

const revisionByCheckId = new Map<string, number>();

/** Получить текущий revision для checkId (undefined = ещё не сохраняли). */
export function getDraftRevision(checkId: string): number | undefined {
  return revisionByCheckId.get(checkId);
}

/** Установить revision вручную (после fetchDraft/restore). */
export function setDraftRevision(checkId: string, revision: number): void {
  revisionByCheckId.set(checkId, revision);
}

/**
 * Адоптировать серверный revision, не понижая уже известный (monotonic).
 * DRAFT-CONFLICT-TRUTH: гонка mount-адопции и первого autosave не должна
 * откатывать revision назад (иначе следующий save = ложный 409).
 */
export function adoptDraftRevision(checkId: string, revision: number): void {
  const known = revisionByCheckId.get(checkId);
  if (known === undefined || revision > known) {
    revisionByCheckId.set(checkId, revision);
  }
}

/** Сбросить revision (при delete/clear). */
export function clearDraftRevision(checkId: string): void {
  revisionByCheckId.delete(checkId);
  lastReportedRevision.delete(checkId);
  pendingConflicts.delete(checkId);
  // DRAFT-AUTOSAVE-CADENCE: гасим отложенные/ожидающие autosave-состояния.
  const debounce = debounceTimers.get(checkId);
  if (debounce) clearTimeout(debounce);
  const max = maxTimers.get(checkId);
  if (max) clearTimeout(max);
  debounceTimers.delete(checkId);
  maxTimers.delete(checkId);
  pendingSaves.delete(checkId);
  lastSavedHashes.delete(checkId);
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function draftUrl(checkId: string): string {
  return `${API_BASE}/api/checks/${encodeURIComponent(checkId)}/draft`;
}

// ---------------------------------------------------------------------------
// Save with revision
// ---------------------------------------------------------------------------

/**
 * Отправить черновик с ожидаемым revision.
 *
 * Если expectedRevision не передан — используется текущий сохранённый revision
 * (0 для первого сохранения).
 *
 * DRAFT-CONFLICT-TRUTH:
 *   - revision неизвестна (свежая сессия) + 409 → **тихий** adopt серверной
 *     версии и один ретрай: черновик — кеш, первый контакт не «конфликт сессий»;
 *   - revision была известна и устарела (другая сессия) → **один** варнинг на
 *     эпизод (дедуп по serverRevision) + adopt → следующий save проходит.
 */
export async function saveDraftRevisioned(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
  expectedRevision?: number,
): Promise<DraftRevisionResult> {
  const known = revisionByCheckId.get(checkId);
  const revisionKnown = expectedRevision !== undefined || known !== undefined;
  const rev = expectedRevision ?? known ?? 0;

  try {
    const res = await fetch(draftUrl(checkId), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Draft-Revision': String(rev),
      },
      body: JSON.stringify({
        wired,
        resource_contents: resources,
        meta: {
          checkId,
          contentHash: '',
          savedAt: Date.now(),
        },
      }),
      keepalive: true,
    });

    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as {
        conflict?: boolean;
        revision?: number;
        theirs?: DraftPayload;
      } | null;
      const serverRevision = body?.revision ?? rev + 1;
      const conflict: DraftConflict = {
        ok: false,
        serverRevision,
        theirs: body?.theirs ?? {
          wired: null,
          resource_contents: {},
          meta: { checkId, contentHash: '', savedAt: 0 },
        },
        ourRevision: rev,
      };

      if (!revisionKnown) {
        // Свежая сессия: revision неизвестна — тихий adopt + один ретрай.
        adoptDraftRevision(checkId, serverRevision);
        return saveDraftRevisioned(checkId, wired, resources, serverRevision);
      }

      // Настоящий конфликт: adopt → следующий save разрешит (варнинг один).
      adoptDraftRevision(checkId, serverRevision);
      reportConflict(checkId, conflict);
      return conflict;
    }

    if (!res.ok) {
      return {
        ok: false,
        serverRevision: rev + 1,
        theirs: {
          wired: null,
          resource_contents: {},
          meta: { checkId, contentHash: '', savedAt: 0 },
        },
        ourRevision: rev,
      };
    }

    const body = (await res.json().catch(() => null)) as {
      revision?: number;
      ok?: boolean;
    } | null;
    const nextRev = body?.revision ?? rev + 1;
    revisionByCheckId.set(checkId, nextRev);
    // Успешное сохранение закрывает эпизод конфликта.
    pendingConflicts.delete(checkId);
    lastReportedRevision.delete(checkId);
    return { ok: true, revision: nextRev };
  } catch {
    // Сеть недоступна — считаем что revision не изменился
    return { ok: true, revision: rev };
  }
}

// ---------------------------------------------------------------------------
// DRAFT-AUTOSAVE-CADENCE: дебаунс + потолок + сериализация
// ---------------------------------------------------------------------------

/**
 * Быстрые собственные правки не должны конкурировать за одну ревизию:
 *   - дебаунс DRAFT_SAVE_DEBOUNCE_MS после последней правки (коалесцирует серию);
 *   - потолок DRAFT_FLUSH_MAX_MS: при непрерывном вводе сохраняем не реже;
 *   - dedup по computeDraftHash: ре-рендер без изменений PUT не шлёт;
 *   - один in-flight PUT на чек: следующая правка ждёт очередь и уходит
 *     с уже адоптированным revision — self-гонка не выглядит конфликтом.
 */
interface PendingRevisionedSave {
  wired: unknown;
  resources: Record<string, string>;
  hash: string;
}

const pendingSaves = new Map<string, PendingRevisionedSave>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const maxTimers = new Map<string, ReturnType<typeof setTimeout>>();
const savePromises = new Map<string, Promise<void>>();
const lastSavedHashes = new Map<string, string>();

function armDebounce(checkId: string): void {
  const existing = debounceTimers.get(checkId);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    checkId,
    setTimeout(() => {
      debounceTimers.delete(checkId);
      void runRevisionedSave(checkId);
    }, DRAFT_SAVE_DEBOUNCE_MS),
  );
}

function armMaxInterval(checkId: string): void {
  if (maxTimers.has(checkId)) return;
  maxTimers.set(
    checkId,
    setTimeout(() => {
      maxTimers.delete(checkId);
      void runRevisionedSave(checkId);
    }, DRAFT_FLUSH_MAX_MS),
  );
}

/** Сериализованный PUT: один in-flight на чек; следующий — после завершения. */
function runRevisionedSave(checkId: string): Promise<void> {
  const inFlight = savePromises.get(checkId);
  if (inFlight) return inFlight;
  const pending = pendingSaves.get(checkId);
  if (!pending) return Promise.resolve();
  pendingSaves.delete(checkId);
  const promise = (async () => {
    try {
      const result = await saveDraftRevisioned(
        checkId,
        pending.wired,
        pending.resources,
      );
      if (result.ok) lastSavedHashes.set(checkId, pending.hash);
      if (pendingSaves.has(checkId)) {
        // Правки, пришедшие во время save: гарантируем отложенный дозапуск.
        if (!debounceTimers.has(checkId)) armDebounce(checkId);
        armMaxInterval(checkId);
      }
    } finally {
      savePromises.delete(checkId);
    }
  })();
  savePromises.set(checkId, promise);
  return promise;
}

/**
 * Автосохранение с revision-трекингом: коалесцирует быстрые правки,
 * не шлёт PUT без изменений и не допускает параллельных запросов.
 * Ожидаемый revision не подставляем принудительно: пусть функция сама
 * различает «revision неизвестна» (тихий adopt) и реальный конфликт.
 */
export function scheduleRevisionedSave(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
): void {
  if (!checkId) return;
  const hash = computeDraftHash(wired, resources);
  if (hash === lastSavedHashes.get(checkId)) {
    return; // содержимое уже сохранено — не бампаем revision на каждый ре-рендер
  }
  pendingSaves.set(checkId, { wired, resources, hash });
  armDebounce(checkId);
  armMaxInterval(checkId);
}

/**
 * Немедленное сохранение с revision-контролем (Ctrl+S / header Save).
 * Явный save — источник истины: отложенные более старые правки отменяются,
 * выполняется ожидание in-flight PUT (никаких параллельных запросов) и
 * сохраняется именно актуальное содержимое.
 */
export async function flushDraftRevisioned(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
): Promise<DraftRevisionResult> {
  const hash = computeDraftHash(wired, resources);
  const debounce = debounceTimers.get(checkId);
  if (debounce) {
    clearTimeout(debounce);
    debounceTimers.delete(checkId);
  }
  const max = maxTimers.get(checkId);
  if (max) {
    clearTimeout(max);
    maxTimers.delete(checkId);
  }
  pendingSaves.delete(checkId);
  const inFlight = savePromises.get(checkId);
  if (inFlight) {
    await inFlight;
  }
  const result = await saveDraftRevisioned(checkId, wired, resources);
  if (result.ok) {
    lastSavedHashes.set(checkId, hash);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Conflict reporting (for UI merge surface)
// ---------------------------------------------------------------------------

export interface PendingConflict {
  checkId: string;
  conflict: DraftConflict;
  reportedAt: number;
}

const pendingConflicts = new Map<string, PendingConflict>();
type ConflictListener = (conflict: PendingConflict) => void;
const conflictListeners = new Set<ConflictListener>();

/** DRAFT-CONFLICT-TRUTH: последний озвученный serverRevision — дедуп эпизода. */
const lastReportedRevision = new Map<string, number>();

function reportConflict(checkId: string, conflict: DraftConflict): void {
  // Один варнинг на эпизод: повторный 409 с тем же serverRevision молчит.
  if (lastReportedRevision.get(checkId) === conflict.serverRevision) {
    return;
  }
  lastReportedRevision.set(checkId, conflict.serverRevision);
  const pending: PendingConflict = {
    checkId,
    conflict,
    reportedAt: Date.now(),
  };
  pendingConflicts.set(checkId, pending);
  for (const listener of conflictListeners) {
    try {
      listener(pending);
    } catch {
      /* ignore listener errors */
    }
  }
}

/** Подписаться на конфликты — для UI merge surface. */
export function onDraftConflict(listener: ConflictListener): () => void {
  conflictListeners.add(listener);
  return () => {
    conflictListeners.delete(listener);
  };
}

/** Получить текущий неразрешённый конфликт для checkId. */
export function getPendingConflict(checkId: string): PendingConflict | undefined {
  return pendingConflicts.get(checkId);
}

/** Разрешить конфликт (после merge) — сбрасывает pending и устанавливает revision. */
export function resolveConflict(
  checkId: string,
  resolvedRevision: number,
): void {
  pendingConflicts.delete(checkId);
  lastReportedRevision.delete(checkId);
  revisionByCheckId.set(checkId, resolvedRevision);
}

// ---------------------------------------------------------------------------
// Diff helpers (для UI merge surface)
// ---------------------------------------------------------------------------

/** Быстрое сравнение двух wired-объектов: равны ли они. */
export function wiredsAreEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Быстрое сравнение ресурсов. */
export function resourcesAreEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
}

/**
 * Простое построчное сравнение двух DSL-текстов.
 * Возвращает массив строк с маркерами: ' ' (одинаково), '-' (удалено), '+' (добавлено).
 */
export function diffDslLines(ours: string, theirs: string): Array<{ marker: ' ' | '-' | '+'; text: string }> {
  const ourLines = ours.split('\n');
  const theirLines = theirs.split('\n');
  const result: Array<{ marker: ' ' | '-' | '+'; text: string }> = [];
  const maxLen = Math.max(ourLines.length, theirLines.length);

  for (let i = 0; i < maxLen; i++) {
    const ourLine = ourLines[i] ?? '';
    const theirLine = theirLines[i] ?? '';
    if (ourLine === theirLine) {
      result.push({ marker: ' ', text: ourLine });
    } else {
      if (ourLine) result.push({ marker: '-', text: ourLine });
      if (theirLine) result.push({ marker: '+', text: theirLine });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function __resetRevisionStateForTests(): void {
  revisionByCheckId.clear();
  pendingConflicts.clear();
  conflictListeners.clear();
  lastReportedRevision.clear();
  // DRAFT-AUTOSAVE-CADENCE: состояние и таймеры автосейва не текут между тестами.
  for (const t of debounceTimers.values()) clearTimeout(t);
  for (const t of maxTimers.values()) clearTimeout(t);
  debounceTimers.clear();
  maxTimers.clear();
  pendingSaves.clear();
  savePromises.clear();
  lastSavedHashes.clear();
}