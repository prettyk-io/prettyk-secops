/**
 * Реестр CheckInstance в localStorage + миграция legacy draft.
 */

import { redactSecretsForDraft } from '../utils/redact';
import { currentUserId } from '../shell/persAuth';
import { serializeCheckBuffer } from './closeGuard';
import {
  CHECK_RUNS_MAX,
  CHECKS_ACTIVE_KEY,
  CHECKS_STORAGE_KEY,
  type CheckInstance,
  type CheckRunRef,
  type CheckRunStatus,
  type CheckStatus,
  type CheckView,
  type ChecksStoreSnapshot,
} from './types';

function checkStatusFromRunStatus(runStatus: CheckRunStatus): CheckStatus | undefined {
  if (runStatus === 'running') {
    return 'running';
  }
  if (runStatus === 'success') {
    return 'completed';
  }
  if (runStatus === 'failed') {
    return 'failed';
  }
  return undefined;
}

/** Содержимое сущности: только оно двигает updated_at. */
export function entityContentFingerprint(
  item: Pick<CheckInstance, 'title' | 'status' | 'wired' | 'resource_contents'>,
): string {
  return [
    item.title,
    item.status,
    serializeCheckBuffer(item.wired, item.resource_contents ?? {}),
  ].join('\u0000');
}

let lastIso = '';

/**
 * Монотонная ISO-метка времени. Гарантирует, что два изменения в рамках одной
 * миллисекунды получат строго растущие `updated_at` (иначе «newer updated_at»
 * в mergeChecksSnapshots ломается, а тест на «содержимое двигает updated_at»
 * флапает на ms-разрешении Date).
 */
function nowIso(): string {
  const iso = new Date().toISOString();
  if (iso <= lastIso) {
    lastIso = new Date(new Date(lastIso).getTime() + 1).toISOString();
    return lastIso;
  }
  lastIso = iso;
  return iso;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `chk_${Date.now().toString(36)}_${hex}`;
  }
  return `chk_${Date.now().toString(36)}_${performance.now().toString(36).replace(/\./g, '')}`;
}

function readRaw(): string | undefined {
  try {
    return window.localStorage.getItem(CHECKS_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeRaw(value: string): void {
  try {
    window.localStorage.setItem(CHECKS_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function emptySnapshot(): ChecksStoreSnapshot {
  return { version: 1, items: [] };
}

function parseSnapshot(raw: string | undefined): ChecksStoreSnapshot {
  if (!raw) {
    return emptySnapshot();
  }
  try {
    const parsed = JSON.parse(raw) as ChecksStoreSnapshot;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) {
      return emptySnapshot();
    }
    return parsed;
  } catch {
    return emptySnapshot();
  }
}

type PersistHook = (snapshot: ChecksStoreSnapshot) => void;

let persistHook: PersistHook | null = null;

/** NAV-API: optional push hook (wired from checksRemote). */
export function setChecksPersistHook(hook: PersistHook | null): void {
  persistHook = hook;
}

function persist(snapshot: ChecksStoreSnapshot): void {
  writeRaw(JSON.stringify(snapshot));
  try {
    persistHook?.(snapshot);
  } catch {
    /* ignore remote sync errors */
  }
}

/** Current snapshot. */
export function readChecksSnapshot(): ChecksStoreSnapshot {
  return parseSnapshot(readRaw());
}

/**
 * Merge two registries by check_id: keep the side with newer updated_at.
 * Equal timestamps → prefer local (caller order: local first, then remote).
 */
export function mergeChecksSnapshots(
  local: ChecksStoreSnapshot,
  remote: ChecksStoreSnapshot,
): ChecksStoreSnapshot {
  const byId = new Map<string, CheckInstance>();
  for (const item of local.items) {
    if (item?.check_id) {
      byId.set(item.check_id, item);
    }
  }
  for (const item of remote.items) {
    if (!item?.check_id) {
      continue;
    }
    const prev = byId.get(item.check_id);
    if (!prev || item.updated_at > prev.updated_at) {
      byId.set(item.check_id, item);
    }
  }
  return { version: 1, items: Array.from(byId.values()) };
}

/** Apply remote snapshot merged into local; returns whether items changed. */
export function applyMergedRemoteSnapshot(remote: ChecksStoreSnapshot): boolean {
  const local = readChecksSnapshot();
  const merged = mergeChecksSnapshots(local, remote);
  const before = JSON.stringify(local.items);
  const after = JSON.stringify(merged.items);
  if (before === after) {
    return false;
  }
  // Write without re-entrancy into remote push of the same pull.
  writeRaw(JSON.stringify(merged));
  return true;
}

function titleFromWired(wired: unknown, fallback: string): string {
  if (wired && typeof wired === 'object') {
    const meta = (wired as { meta?: { name?: string; target?: string } }).meta;
    const name = meta?.name?.trim();
    if (name) {
      return name;
    }
    const target = meta?.target?.trim();
    if (target) {
      return target;
    }
  }
  return fallback;
}

export function listChecks(): CheckInstance[] {
  const items = parseSnapshot(readRaw()).items;
  return [...items].sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1));
}

export function getCheck(checkId: string): CheckInstance | undefined {
  return parseSnapshot(readRaw()).items.find((item) => item.check_id === checkId);
}

export function setActiveCheckId(checkId: string | null): void {
  try {
    if (checkId === null) {
      window.localStorage.removeItem(CHECKS_ACTIVE_KEY);
    } else {
      window.localStorage.setItem(CHECKS_ACTIVE_KEY, checkId);
    }
  } catch {
    /* ignore */
  }
}

export function getActiveCheckId(): string | null {
  try {
    return window.localStorage.getItem(CHECKS_ACTIVE_KEY);
  } catch {
    return null;
  }
}

export type CreateCheckInput = {
  wired: unknown;
  resource_contents?: Record<string, string>;
  title?: string;
  status?: CheckStatus;
  view?: CheckView;
};

export function createCheck(input: CreateCheckInput): CheckInstance {
  const ts = nowIso();
  const owner = currentUserId() ?? 'legacy';
  const item: CheckInstance = {
    check_id: newId(),
    title: input.title ?? titleFromWired(input.wired, `Проверка ${ts.slice(0, 10)}`),
    status: input.status ?? 'draft',
    created_at: ts,
    updated_at: ts,
    last_opened_at: ts,
    wired: redactSecretsForDraft(input.wired),
    resource_contents: input.resource_contents ?? {},
    view: input.view ?? 'form',
    runs: [],
    owner_user_id: owner,
  };
  const snapshot = parseSnapshot(readRaw());
  snapshot.items.push(item);
  persist(snapshot);
  setActiveCheckId(item.check_id);
  return item;
}

export type UpdateCheckPatch = {
  wired?: unknown;
  resource_contents?: Record<string, string>;
  title?: string;
  status?: CheckStatus;
  view?: CheckView;
  last_opened_at?: string;
};

/**
 * Явное «Сохранить»: пишет entity и ставит status ready (Черновик → Подготовлен).
 * Даже без правок содержимого — status меняется.
 */
export function saveCheckPrepared(
  checkId: string,
  input: {
    wired: unknown;
    resource_contents?: Record<string, string>;
    view?: CheckView;
  },
): CheckInstance | undefined {
  return updateCheck(checkId, {
    wired: input.wired,
    resource_contents: input.resource_contents,
    view: input.view,
    status: 'ready',
  });
}

export function updateCheck(checkId: string, patch: UpdateCheckPatch): CheckInstance | undefined {
  const snapshot = parseSnapshot(readRaw());
  const index = snapshot.items.findIndex((item) => item.check_id === checkId);
  if (index < 0) {
    return undefined;
  }
  const prev = snapshot.items[index];
  if (!prev) {
    return undefined;
  }
  const next: CheckInstance = {
    check_id: prev.check_id,
    title: patch.title ?? prev.title,
    status: patch.status ?? prev.status,
    created_at: prev.created_at,
    updated_at: prev.updated_at,
    last_opened_at: patch.last_opened_at ?? prev.last_opened_at,
    wired:
      patch.wired !== undefined ? redactSecretsForDraft(patch.wired) : prev.wired,
    resource_contents: patch.resource_contents ?? prev.resource_contents,
    view: patch.view ?? prev.view,
    runs: prev.runs,
    owner_user_id: prev.owner_user_id,
  };
  if (entityContentFingerprint(prev) !== entityContentFingerprint(next)) {
    next.updated_at = nowIso();
  }
  snapshot.items[index] = next;
  persist(snapshot);
  return next;
}

/** Открытие: не трогает updated_at. */
export function touchOpened(checkId: string): void {
  const snapshot = parseSnapshot(readRaw());
  const index = snapshot.items.findIndex((item) => item.check_id === checkId);
  if (index < 0) {
    return;
  }
  const prev = snapshot.items[index];
  if (!prev) {
    return;
  }
  snapshot.items[index] = { ...prev, last_opened_at: nowIso() };
  persist(snapshot);
}

/** Удалить instance (история). */
export function deleteCheck(checkId: string): boolean {
  const snapshot = parseSnapshot(readRaw());
  const before = snapshot.items.length;
  snapshot.items = snapshot.items.filter((c) => c.check_id !== checkId);
  if (snapshot.items.length === before) {
    return false;
  }
  persist(snapshot);
  if (getActiveCheckId() === checkId) {
    setActiveCheckId(null);
  }
  return true;
}

/** Удалить draft без runs; иначе false (discard при закрытии). */
export function deleteDraftCheck(checkId: string): boolean {
  const item = getCheck(checkId);
  if (!item || item.runs.length > 0 || item.status !== 'draft') {
    return false;
  }
  return deleteCheck(checkId);
}

export function replacecheckWired(
  checkId: string,
  wired: unknown,
  resource_contents: Record<string, string>,
): CheckInstance | undefined {
  return updateCheck(checkId, { wired, resource_contents });
}

/**
 * NAV-RUN: upsert run by run_id (newest first), optionally set check.status.
 * Bumps updated_at when run list or check status changes.
 */
export function upsertCheckRun(
  checkId: string,
  run: CheckRunRef,
  opts?: { syncCheckStatus?: boolean },
): CheckInstance | undefined {
  const rid = (run.run_id || '').trim();
  if (!rid) {
    return undefined;
  }
  const snapshot = parseSnapshot(readRaw());
  const index = snapshot.items.findIndex((item) => item.check_id === checkId);
  if (index < 0) {
    return undefined;
  }
  const prev = snapshot.items[index];
  if (!prev) {
    return undefined;
  }
  const prevRuns = Array.isArray(prev.runs) ? [...prev.runs] : [];
  const existingIdx = prevRuns.findIndex((r) => r.run_id === rid);
  const owner =
    run.owner_user_id ||
    prev.owner_user_id ||
    currentUserId() ||
    'legacy';
  const merged: CheckRunRef =
    existingIdx >= 0
      ? {
          ...prevRuns[existingIdx],
          ...run,
          run_id: rid,
          started_at: run.started_at ?? prevRuns[existingIdx]?.started_at,
          owner_user_id: run.owner_user_id || prevRuns[existingIdx]?.owner_user_id || owner,
        }
      : { ...run, run_id: rid, owner_user_id: owner };

  let nextRuns: CheckRunRef[];
  if (existingIdx >= 0) {
    nextRuns = [...prevRuns];
    nextRuns[existingIdx] = merged;
  } else {
    nextRuns = [merged, ...prevRuns];
  }
  if (nextRuns.length > CHECK_RUNS_MAX) {
    nextRuns = nextRuns.slice(0, CHECK_RUNS_MAX);
  }

  let nextStatus = prev.status;
  if (opts?.syncCheckStatus !== false) {
    const derived = checkStatusFromRunStatus(merged.status);
    if (derived) {
      nextStatus = derived;
    }
  }

  const runsChanged = JSON.stringify(prevRuns) !== JSON.stringify(nextRuns);
  const statusChanged = nextStatus !== prev.status;
  const next: CheckInstance = {
    ...prev,
    status: nextStatus,
    runs: nextRuns,
    updated_at: runsChanged || statusChanged ? nowIso() : prev.updated_at,
  };
  snapshot.items[index] = next;
  persist(snapshot);
  return next;
}

/** Тест/отладка: очистить реестр. */
export function __resetChecksStoreForTests(): void {
  try {
    window.localStorage.removeItem(CHECKS_STORAGE_KEY);
    window.localStorage.removeItem(CHECKS_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
