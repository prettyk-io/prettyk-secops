/**
 * useSceneGraph (F-8) — polls /api/execution/scene-graph every 2s.
 * Falls back to static default topology.
 */
import { useEffect, useState } from 'react';
import { LIVE_BASE } from '../../api/apiBase';
import { useExecutionStore } from './useExecutionStore';
import type { SceneGraph } from './types';

function defaultGraph(): SceneGraph {
  const n = (id: string, label: string, kind: SceneGraph['nodes'][0]['kind'], x: number, y: number): SceneGraph['nodes'][0] => ({
    id, label, kind, x, y, status: 'idle', health: 1,
  });
  return {
    nodes: [
      n('gw-1', 'API Gateway', 'connector', 200, 200),
      n('gw-2', 'WAF Proxy', 'connector', 200, 500),
      n('svc-auth', 'Auth Service', 'data_module', 400, 300),
      n('svc-pay', 'Payment API', 'data_module', 400, 450),
      n('svc-ord', 'Order Manager', 'data_module', 600, 250),
      n('svc-cat', 'Catalog Service', 'data_module', 600, 400),
      n('svc-not', 'Notification Hub', 'data_module', 750, 150),
      n('db-main', 'Primary DB', 'data_module', 500, 600),
      n('db-cache', 'Redis Cache', 'data_module', 650, 550),
      n('api-ext', 'External Auth', 'auth_profile', 300, 150),
    ],
    edges: [
      { from: 'gw-1', to: 'svc-auth', active: false },
      { from: 'gw-2', to: 'svc-auth', active: false },
      { from: 'svc-auth', to: 'svc-pay', active: false },
      { from: 'svc-auth', to: 'svc-ord', active: false },
      { from: 'svc-pay', to: 'db-main', active: false },
      { from: 'svc-ord', to: 'db-main', active: false },
      { from: 'svc-ord', to: 'svc-cat', active: false },
      { from: 'svc-cat', to: 'db-cache', active: false },
    ],
    updated_at: new Date().toISOString(),
  };
}

export function useSceneGraph(): SceneGraph {
  const [graph, setGraph] = useState<SceneGraph>(defaultGraph);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${LIVE_BASE}/api/execution/scene-graph`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        if (json && typeof json === 'object' && !cancelled) {
          const g = json as SceneGraph;
          if (Array.isArray(g.nodes) && g.nodes.length > 0) {
            useExecutionStore.getState().setSceneGraph(g);
            setGraph(g);
          }
        }
      } catch {
        // API not ready — keep default
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return graph;
}