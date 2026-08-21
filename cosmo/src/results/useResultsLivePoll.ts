/**
 * Live poll meta/hooks for Results workspace — вынесено из ResultsWorkspace (S3776).
 */
import { useEffect, useRef, useState } from 'react';
import { LAB_RUN_STATUS_URL, LIVE_HOOKS_URL, LIVE_META_URL } from '../api/apiBase';
import { syncActiveCheckRunFromLive } from '../checks/checkRunFromLive';
import { bindAwaitStartHandler } from './awaitStartBus';
import type { LaunchFault } from './launchUi';
import { pipelineStatusFromMeta } from './pipelineVerdict';
import { clearResultsHooks } from './postResultsHooks';
import { advanceLivePoll } from './resultsLivePollAdvance';
import type { LiveMetaSnapshot, ResultsHooksSnapshot } from './types';

const EMPTY_HOOKS: ResultsHooksSnapshot = { allure: null, dojo: null };

const POLL_IDLE_MS = 2_000;
const POLL_HOT_MS = 800;
const START_WAIT_MS = 45_000;
const RUN_TIMEOUT_MS = 45 * 60_000;

export type LabRunPhase = 'idle' | 'running' | 'finished' | string;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useResultsLivePoll(): {
  meta: LiveMetaSnapshot | null;
  hooks: ResultsHooksSnapshot | null;
  launchFault: LaunchFault | null;
  awaitingStart: boolean;
  labRunPhase: LabRunPhase | null;
  beginAwaitingRestart: () => void;
} {
  const [meta, setMeta] = useState<LiveMetaSnapshot | null>(null);
  const [hooks, setHooks] = useState<ResultsHooksSnapshot | null>(null);
  const [launchFault, setLaunchFault] = useState<LaunchFault | null>(null);
  const [awaitingStart, setAwaitingStart] = useState(false);
  const [labRunPhase, setLabRunPhase] = useState<LabRunPhase | null>(null);

  const runningSinceRef = useRef<number | null>(null);
  const awaitStartSinceRef = useRef<number | null>(null);
  const awaitingStartRef = useRef(false);
  const hotPollRef = useRef(false);
  const pollBusyRef = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const refreshStatus = async () => {
      if (pollBusyRef.current) {
        return;
      }
      pollBusyRef.current = true;
      try {
        const [nextMeta, nextHooks, nextLab] = await Promise.all([
          fetchJson<LiveMetaSnapshot>(LIVE_META_URL),
          fetchJson<ResultsHooksSnapshot>(LIVE_HOOKS_URL),
          fetchJson<{ phase?: string }>(LAB_RUN_STATUS_URL),
        ]);
        setMeta(nextMeta);
        setHooks(nextHooks);
        setLabRunPhase(
          typeof nextLab?.phase === 'string' ? nextLab.phase : null,
        );
        // NAV-RUN: History runs[] from Live meta (active check only)
        syncActiveCheckRunFromLive(nextMeta);
        const pipe = pipelineStatusFromMeta(nextMeta);
        const tick = advanceLivePoll(
          pipe.verdict,
          nextMeta,
          Date.now(),
          {
            runningSince: runningSinceRef.current,
            awaitStartSince: awaitStartSinceRef.current,
            awaitingStart: awaitingStartRef.current,
          },
          RUN_TIMEOUT_MS,
          START_WAIT_MS,
        );
        runningSinceRef.current = tick.refs.runningSince;
        awaitStartSinceRef.current = tick.refs.awaitStartSince;
        awaitingStartRef.current = tick.refs.awaitingStart;
        setAwaitingStart(tick.refs.awaitingStart);
        hotPollRef.current =
          tick.hot || String(nextLab?.phase || '').toLowerCase() === 'running';
        setLaunchFault(tick.launchFault);
      } finally {
        pollBusyRef.current = false;
      }
    };
    refreshRef.current = refreshStatus;

    const scheduleNext = () => {
      window.clearTimeout(timer);
      const ms =
        hotPollRef.current || awaitingStartRef.current ? POLL_HOT_MS : POLL_IDLE_MS;
      timer = window.setTimeout(() => {
        void (async () => {
          if (cancelled) {
            return;
          }
          await refreshStatus();
          if (!cancelled) {
            scheduleNext();
          }
        })();
      }, ms);
    };

    void (async () => {
      await refreshStatus();
      if (!cancelled) {
        scheduleNext();
      }
    })();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const beginAwaitingRestart = () => {
    setLaunchFault(null);
    // Сразу серые тайлы + lock скачивания; Live clear — async.
    setHooks(EMPTY_HOOKS);
    void clearResultsHooks();
    runningSinceRef.current = null;
    awaitStartSinceRef.current = Date.now();
    awaitingStartRef.current = true;
    setAwaitingStart(true);
    hotPollRef.current = true;
    void refreshRef.current();
  };

  useEffect(() => {
    bindAwaitStartHandler(beginAwaitingRestart);
    return () => bindAwaitStartHandler(null);
  });

  return {
    meta,
    hooks,
    launchFault,
    awaitingStart,
    labRunPhase,
    beginAwaitingRestart,
  };
}
