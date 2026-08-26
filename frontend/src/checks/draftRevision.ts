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

import type { DraftPayload } from './draftPersistence';
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

/** Сбросить revision (при delete/clear). */
export function clearDraftRevision(checkId: string): void {
  revisionByCheckId.delete(checkId);
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
 */
export async function saveDraftRevisioned(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
  expectedRevision?: number,
): Promise<DraftRevisionResult> {
  const rev = expectedRevision ?? revisionByCheckId.get(checkId) ?? 0;

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
      const conflict: DraftConflict = {
        ok: false,
        serverRevision: body?.revision ?? rev + 1,
        theirs: body?.theirs ?? {
          wired: null,
          resource_contents: {},
          meta: { checkId, contentHash: '', savedAt: 0 },
        },
        ourRevision: rev,
      };
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
    return { ok: true, revision: nextRev };
  } catch {
    // Сеть недоступна — считаем что revision не изменился
    return { ok: true, revision: rev };
  }
}

/**
 * Обёртка над scheduleDraftSave с revision-трекингом.
 * Вызывается при автосохранении — не ждём результата, fire-and-forget.
 */
export function scheduleRevisionedSave(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
): void {
  const rev = revisionByCheckId.get(checkId) ?? 0;
  void saveDraftRevisioned(checkId, wired, resources, rev);
}

/**
 * Немедленное сохранение с revision-контролем (Ctrl+S).
 */
export async function flushDraftRevisioned(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
): Promise<DraftRevisionResult> {
  const rev = revisionByCheckId.get(checkId) ?? 0;
  return saveDraftRevisioned(checkId, wired, resources, rev);
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

function reportConflict(checkId: string, conflict: DraftConflict): void {
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
}