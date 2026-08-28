/**
 * WZ-SSE: WarZone telemetry — живой SceneState из SSE.
 *
 * Контракт WIRE-WZ (канон, спека warzone-rewind §6):
 *   { type: "scene_state", t, active_beams, findings, node_hits, state_hash }
 *
 *   active_beams: BeamView[] — { id, source, target, intensity } (BeamChannelState),
 *                 source/target = id узлов боевой зоны (для WarzoneLiveEngine).
 *   findings:     { kind, count }[] — агрегат по категориям (для HUD).
 *   node_hits:    { nodeId, hits }[] — попадания по узлам (для HUD).
 *
 * URL: {LIVE_BASE}/api/warzone/scene  (SSE).
 * Точечный seek: {LIVE_BASE}/api/warzone/scene/at?t=X  (JSON + state_hash).
 */
import { useEffect, useMemo, useState } from 'react';
import { LIVE_BASE } from '../api/apiBase';

export interface BeamView {
  id: string;
  source: string;
  target: string;
  intensity: number;
}

export interface SceneState {
  /** Текущее время прогона (сек). */
  t: number;
  /** Активные лучи фаззинга (BeamChannelState). */
  active_beams: BeamView[];
  /** Находки (findings) по категориям. */
  findings: { kind: string; count: number }[];
  /** Попадания по узлам. */
  node_hits: { nodeId: string; hits: number }[];
}

export interface WarZoneTelemetry {
  scene: SceneState;
  /** true когда данные пришли из живого SSE, false — mock. */
  live: boolean;
}

const MOCK_SCENE_STATE: SceneState = {
  t: 0,
  active_beams: [],
  findings: [],
  node_hits: [],
};

const SSE_ENABLED = true; // WIRE-WZ: route /api/warzone/scene заведён Boss'ом

export function useWarZoneTelemetry(): WarZoneTelemetry {
  const [scene, setScene] = useState<SceneState>(MOCK_SCENE_STATE);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!SSE_ENABLED) {
      setLive(false);
      return;
    }
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(`${LIVE_BASE}/api/warzone/scene`);
    const onMessage = (message: MessageEvent<string>) => {
      try {
        const raw: unknown = JSON.parse(message.data);
        if (!raw || typeof raw !== 'object') return;
        const obj = raw as Record<string, unknown>;
        if (obj.type !== 'scene_state') return;

        setScene({
          t: typeof obj.t === 'number' ? obj.t : 0,
          active_beams: Array.isArray(obj.active_beams) ? (obj.active_beams as BeamView[]) : [],
          findings: Array.isArray(obj.findings) ? (obj.findings as SceneState['findings']) : [],
          node_hits: Array.isArray(obj.node_hits) ? (obj.node_hits as SceneState['node_hits']) : [],
        });
        setLive(true);
      } catch { /* partial line */ }
    };
    source.addEventListener('message', onMessage);
    // error → live=false, EventSource сам реконнектится (backoff браузера).
    const onError = () => setLive(false);
    source.addEventListener('error', onError);
    return () => {
      source.removeEventListener('message', onMessage);
      source.removeEventListener('error', onError);
      source.close();
    };
  }, []);

  return useMemo(() => ({ scene, live }), [scene, live]);
}
