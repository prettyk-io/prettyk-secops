/**
 * SANCTUARY-MAP B3 — живой мост телеметрии портов.
 *
 * Узлы с `portMeta` показывают реальный статус стенда. Честное различие:
 *   - `alive`       (2xx ответ)                    → зелёный, порт жив;
 *   - `down`        (4xx/5xx ответ)                → красный, сервис ответил, но нездоров;
 *   - `unknown`     (fetch упал: CORS/сеть/таймаут) → серый, «недоступно для проверки»;
 *   - `non-runtime` (нет portMeta)                 → нейтральный, не рантаймный.
 *
 * CORS-честность: если браузер не может достучаться до порта, мы НЕ врём «down»,
 * а честно показываем «недоступно». Опрос идёт в фоне без перезагрузки карты.
 */

import { useEffect, useState } from 'react';
import type { SanctuaryMapNode } from './systemMapModel';

export type PortHealth = 'alive' | 'down' | 'unknown' | 'non-runtime';

export interface PortStatusMap {
  [nodeId: string]: PortHealth;
}

export interface PingOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Проверить один порт. Возвращает:
 *   - 'alive' при 2xx;
 *   - 'down'  при любом другом HTTP-ответе (сервер ответил, но нездоров);
 *   - 'unknown' при выброшенной ошибке (CORS/сеть/таймаут — не можем проверить).
 */
export async function pingPort(
  healthEndpoint: string,
  opts: PingOptions = {},
): Promise<PortHealth> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 2500;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(healthEndpoint, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    return res.ok ? 'alive' : 'down';
  } catch {
    return 'unknown';
  }
}

/** Узлы, которые имеют живую привязку к порту. */
export function runtimeNodes(nodes: SanctuaryMapNode[]): SanctuaryMapNode[] {
  return nodes.filter((n) => Boolean(n.portMeta?.healthEndpoint));
}

/**
 * Реактивный опрос статусов портов. Переопрашивает все runtime-узлы каждые
 * `intervalMs`; каждый узел — независимо. Возвращает словарь nodeId → PortHealth.
 */
export function useLivePortStatus(
  nodes: SanctuaryMapNode[],
  intervalMs = 5000,
): PortStatusMap {
  const [status, setStatus] = useState<PortStatusMap>({});

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const runtimes = runtimeNodes(nodes);
      const next: PortStatusMap = {};
      await Promise.all(
        runtimes.map(async (n) => {
          const hp = n.portMeta!.healthEndpoint!;
          const health = await pingPort(hp);
          next[n.id] = health;
        }),
      );
      if (!cancelled) setStatus(next);
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [nodes, intervalMs]);

  return status;
}
