/**
 * Results live poll state transitions (S3776).
 */
import {
  isPipelineRunning,
  shouldShowRestart,
  type LaunchFault,
} from './launchUi';
import type { PipelineVerdict } from './pipelineVerdict';

export type LivePollRefs = {
  runningSince: number | null;
  awaitStartSince: number | null;
  awaitingStart: boolean;
};

export type LivePollAdvance = {
  refs: LivePollRefs;
  hot: boolean;
  launchFault: LaunchFault | null;
};

export function advanceLivePoll(
  verdict: PipelineVerdict,
  nextMeta: unknown,
  now: number,
  refs: LivePollRefs,
  runTimeoutMs: number,
  startWaitMs: number,
): LivePollAdvance {
  if (isPipelineRunning(verdict)) {
    const runningSince = refs.runningSince ?? now;
    const timedOut = now - runningSince >= runTimeoutMs;
    return {
      refs: {
        runningSince,
        awaitStartSince: null,
        awaitingStart: false,
      },
      hot: true,
      launchFault: timedOut ? 'timeout' : null,
    };
  }

  if (shouldShowRestart(verdict, null)) {
    return {
      refs: {
        runningSince: null,
        awaitStartSince: null,
        awaitingStart: false,
      },
      hot: false,
      launchFault: null,
    };
  }

  if (!refs.awaitingStart) {
    return {
      refs: {
        runningSince: null,
        awaitStartSince: null,
        awaitingStart: false,
      },
      hot: false,
      launchFault: null,
    };
  }

  if (!nextMeta) {
    return {
      refs: {
        runningSince: null,
        awaitStartSince: null,
        awaitingStart: false,
      },
      hot: false,
      launchFault: 'start_failed',
    };
  }

  const startedAt = refs.awaitStartSince ?? now;
  if (now - startedAt >= startWaitMs) {
    return {
      refs: {
        runningSince: null,
        awaitStartSince: null,
        awaitingStart: false,
      },
      hot: false,
      launchFault: 'start_failed',
    };
  }

  return {
    refs: {
      runningSince: null,
      awaitStartSince: startedAt,
      awaitingStart: true,
    },
    hot: true,
    launchFault: null,
  };
}
