/**
 * Deep-link в Live-монитор конкретного инстанса проверки.
 * В unified PW-AIRGAP кука летает во всех запросах — bind-токен избыточен.
 *
 * MONITOR-DEEPLINK-FRESH: никаких «первых из массива».
 * Выбор рана:
 *   1) свежий `running` (стартовал не более RUN_FRESH_MINUTES минут назад и
 *      принадлежит этому чеку) — самый свежий;
 *   2) иначе последний терминальный ран чека (success/failed) по свежести;
 *   3) иначе Live home.
 * «Вечные running»-зомби (без свежего старта) и чужие раны не выбираются.
 *
 * MONITOR-ENTRY-LINK-TRUTH: вход в монитор ведёт к прогону с артефактами.
 * Среди завершённых выбирается **последний ран, у которого реально есть что
 * смотреть** (журнал `events_total > 0` или запись `recording ready` — Live API
 * статусов); вычищенный/пустой ран (факт: run-ca2ec2bfeba1) не становится
 * тупиком: `resolveMonitorTarget` пропускает его и берёт свежий живой
 * (факт: run-733048e82c72), иначе — Live home.
 */
import { getCheck } from '../checks/checksStore';
import { LIVE_BASE, LIVE_HOME } from '../api/apiBase';
import type { CheckRunRef } from '../checks/types';

/** «Живой» ран: running не старше N минут (N зафиксировано в отчёте карточки). */
export const RUN_FRESH_MINUTES = 15;

const MS_PER_MINUTE = 60_000;

/** Свежесть рана: ended_at → started_at; невалидные/отсутствующие — null. */
function timestampOf(run: CheckRunRef): number | null {
  for (const raw of [run.ended_at, run.started_at]) {
    if (!raw) continue;
    const ts = Date.parse(raw);
    if (!Number.isNaN(ts)) return ts;
  }
  return null;
}

/**
 * Принадлежность чеку — строгая (MONITOR-DEEPLINK-LIVE-CLIENT).
 *
 * Ран считается раном проверки только с доказанным штампом `check_id`.
 * Unscoped-записи (без штампа) и чужие раны для ссылки не годятся: ни
 * «открытый активный чек», ни «первый из массива» не делают ран своим —
 * иначе ссылка уводит на чужой/неустановленный прогон (факт: 114a).
 */
function belongsToCheck(run: CheckRunRef, checkId: string | null | undefined): boolean {
  if (!checkId) return true;
  return run.check_id === checkId;
}

function isTerminal(run: CheckRunRef): boolean {
  return run.status === 'success' || run.status === 'failed';
}

/** Свежие running раны (сорт по свежести, самый свежий — первый). */
function freshestRunning(own: readonly CheckRunRef[], nowMs: number): CheckRunRef | undefined {
  const fresh = own
    .filter((r) => r.status === 'running')
    .map((r) => ({ run: r, ts: timestampOf(r) }))
    .filter(
      (x): x is { run: CheckRunRef; ts: number } =>
        x.ts !== null && nowMs - x.ts <= RUN_FRESH_MINUTES * MS_PER_MINUTE,
    )
    .sort((a, b) => b.ts - a.ts);
  return fresh[0]?.run;
}

/** Терминалы по свежести (со таймстампами), затем legacy без таймстампов. */
function orderedTerminals(own: readonly CheckRunRef[]): CheckRunRef[] {
  const withTs = own
    .filter(isTerminal)
    .map((r) => ({ run: r, ts: timestampOf(r) }))
    .filter((x): x is { run: CheckRunRef; ts: number } => x.ts !== null)
    .sort((a, b) => b.ts - a.ts)
    .map((x) => x.run);
  const legacy = own.filter((r) => isTerminal(r) && timestampOf(r) === null);
  return [...withTs, ...legacy];
}

/** URL монитора для конкретного рана (плюс чек-контекст). */
function urlFor(runId: string, checkId: string | null | undefined): string {
  const params = new URLSearchParams({ run_id: runId });
  if (checkId) {
    params.set('check_id', checkId);
  }
  return `${LIVE_HOME}?${params.toString()}`;
}

/** Отбор рана для ссылки. `nowMs` параметризован для тестов. */
export function pickMonitorRun(
  runs: readonly CheckRunRef[],
  checkId: string | null | undefined,
  nowMs: number = Date.now(),
): CheckRunRef | undefined {
  const own = runs.filter((r) => belongsToCheck(r, checkId));

  const freshest = freshestRunning(own, nowMs);
  if (freshest) {
    return freshest;
  }

  const terminals = orderedTerminals(own);
  if (terminals.length > 0) {
    return terminals[0];
  }
  return undefined;
}

/** URL монитора: `?run_id=&check_id=` для свежего/последнего run инстанса; иначе Live home. */
export function buildMonitorUrl(
  checkId: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  const instance = checkId ? getCheck(checkId) : undefined;
  const runs = instance?.runs ?? [];
  const picked = pickMonitorRun(runs, checkId, nowMs);
  const runId = picked?.run_id ?? '';
  if (!runId) {
    return LIVE_HOME;
  }
  return urlFor(runId, checkId);
}

// ── MONITOR-ENTRY-LINK-TRUTH: доступность артефактов ─────────────────────

/** Доступность артефактов рана (Live API статусов). */
export interface RunArtifacts {
  /** События журнала рана (`/api/journal?run_id=` → events_total). */
  journalEvents: number;
  /** Готова ли запись (`/api/recording/status` → ready). */
  recordingReady: boolean;
}

/** Доступность артефактов по Live API; недоступность API → «нет подтверждения» (0/false). */
export async function fetchRunArtifacts(
  runId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RunArtifacts | null> {
  const rid = (runId || '').trim();
  if (!rid) return null;
  const query = `run_id=${encodeURIComponent(rid)}&t=${Date.now()}`;
  let journalEvents = 0;
  let recordingReady = false;
  try {
    const res = await fetchImpl(`${LIVE_BASE}/api/journal?${query}`, { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { events_total?: unknown };
      const n = Number(body?.events_total);
      journalEvents = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
  } catch {
    /* Live недоступен — артефакты не подтверждены */
  }
  try {
    const res = await fetchImpl(`${LIVE_BASE}/api/recording/status?${query}`, { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { ready?: unknown };
      recordingReady = body?.ready === true;
    }
  } catch {
    /* Live недоступен — артефакты не подтверждены */
  }
  return { journalEvents, recordingReady };
}

/** Есть ли у рана что смотреть: журнал или запись. */
export function hasViewableArtifacts(artifacts: RunArtifacts | null | undefined): boolean {
  return !!artifacts && (artifacts.journalEvents > 0 || artifacts.recordingReady);
}

/**
 * Выбор рана с подтверждёнными артефактами (чистая функция).
 *
 * Приоритет: свежий живой running (артефакты ему не нужны — он смотрится
 * вживую) → самый свежий терминал, у которого есть журнал/запись →
 * undefined (Live home). Чужие/неscoped и вычищенные раны не выбираются.
 */
export function pickMonitorRunWithArtifacts(
  runs: readonly CheckRunRef[],
  checkId: string | null | undefined,
  artifactsByRun: ReadonlyMap<string, RunArtifacts | null | undefined>,
  nowMs: number = Date.now(),
): CheckRunRef | undefined {
  const own = runs.filter((r) => belongsToCheck(r, checkId));

  const freshest = freshestRunning(own, nowMs);
  if (freshest) {
    return freshest;
  }

  for (const candidate of orderedTerminals(own)) {
    if (hasViewableArtifacts(artifactsByRun.get(candidate.run_id))) {
      return candidate;
    }
  }
  return undefined;
}

export type MonitorTargetReason = 'live' | 'artifacts' | 'none';

export interface MonitorTarget {
  run?: CheckRunRef;
  url: string;
  reason: MonitorTargetReason;
}

/**
 * Разрешение цели «Мониторинг»: живой → последний с артефактами → Live home.
 *
 * Кандидаты-терминалы проверяются последовательно (свежий сначала) через
 * `fetchArtifacts`; первый с подтверждённым журналом/записью выигрывает.
 * Ошибка пробы = «артефакты не подтверждены» (честный пропуск), а не выбор наугад.
 */
export async function resolveMonitorTarget(
  checkId: string | null | undefined,
  fetchArtifacts: (runId: string) => Promise<RunArtifacts | null> = fetchRunArtifacts,
  nowMs: number = Date.now(),
): Promise<MonitorTarget> {
  const instance = checkId ? getCheck(checkId) : undefined;
  const runs = instance?.runs ?? [];
  const own = runs.filter((r) => belongsToCheck(r, checkId));

  const live = freshestRunning(own, nowMs);
  if (live) {
    return { run: live, url: urlFor(live.run_id, checkId), reason: 'live' };
  }

  for (const candidate of orderedTerminals(own)) {
    let artifacts: RunArtifacts | null = null;
    try {
      artifacts = await fetchArtifacts(candidate.run_id);
    } catch {
      artifacts = null;
    }
    if (hasViewableArtifacts(artifacts)) {
      return { run: candidate, url: urlFor(candidate.run_id, checkId), reason: 'artifacts' };
    }
  }
  return { url: LIVE_HOME, reason: 'none' };
}

/** URL-версия `resolveMonitorTarget` (для вызова из UI). */
export async function resolveMonitorUrl(
  checkId: string | null | undefined,
  fetchArtifacts: (runId: string) => Promise<RunArtifacts | null> = fetchRunArtifacts,
  nowMs: number = Date.now(),
): Promise<string> {
  const target = await resolveMonitorTarget(checkId, fetchArtifacts, nowMs);
  return target.url;
}
