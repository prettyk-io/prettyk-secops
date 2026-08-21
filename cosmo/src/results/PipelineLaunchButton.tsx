/**
 * Кнопка старта пайпа в шапке Studio: Старт ↔ ожидание.
 * По любому выходу снова idle и доступна для нового тапа.
 */

import { useEffect, useState } from 'react';
import { Button } from 'antd';
import { LAB_RUN_STATUS_URL, LIVE_META_URL } from '../api/apiBase';
import { headerPipelineDisplay } from './headerPipelineDisplay';
import { pipelineIconForVerdict, pipelineIconHint } from './pipelineIcons';
import { pipelineStatusFromMeta, type PipelineVerdict } from './pipelineVerdict';
import type { LiveMetaSnapshot } from './types';

const POLL_MS = 1_000;

export type PipelineLaunchButtonProps = {
  /** После penguin-OK: стартовать пайп (playground /api/run/start). */
  onStart: () => void | Promise<void>;
  starting?: boolean;
};

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

export function PipelineLaunchButton({
  onStart,
  starting = false,
}: PipelineLaunchButtonProps): React.JSX.Element {
  const [ciVerdict, setCiVerdict] = useState<PipelineVerdict>('idle');
  const [labPhase, setLabPhase] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const [meta, lab] = await Promise.all([
        fetchJson<LiveMetaSnapshot>(LIVE_META_URL),
        fetchJson<{ phase?: string }>(LAB_RUN_STATUS_URL),
      ]);
      if (cancelled) {
        return;
      }
      const status = pipelineStatusFromMeta(
        meta ? (meta as unknown as Record<string, unknown>) : null,
      );
      setCiVerdict(status.verdict);
      setLabPhase(typeof lab?.phase === 'string' ? lab.phase : null);
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const { busy, display } = headerPipelineDisplay({
    starting,
    labPhase,
    ciVerdict,
  });
  const icon = pipelineIconForVerdict(display);
  const hint = busy ? 'Ожидание…' : pipelineIconHint('idle');

  return (
    <Button
      type="text"
      className={`pk-header-pipeline pk-header-pipeline--${display}${
        busy ? ' pk-header-pipeline--busy' : ''
      }`}
      aria-label={hint}
      data-testid="pipeline-launch"
      data-verdict={display}
      disabled={busy}
      onClick={() => {
        if (busy) {
          return;
        }
        void onStart();
      }}
      icon={<img className="pk-header-pipeline-icon" src={icon} alt="" />}
    />
  );
}
