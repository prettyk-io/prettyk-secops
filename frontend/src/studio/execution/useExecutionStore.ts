/**
 * Execution store — singleton Zustand store for the Studio Execution Hub.
 * F-1..F-10: playback, video, beams, scene graph, markers, camera.
 */
import { create } from 'zustand';
import type { BattleNode, ExecutionMode, FuzzerBeam, TimelineMarker, VideoState, SceneGraph, BeamSnapshot } from './types';
import { WORLD_SIZE, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX } from './types';
import { DEFAULT_WARMUP_MS, DEFAULT_COOLING_MS } from './canvas/BeamEngine';

// ── Default topology (fallback until scene‑graph arrives) ──

function defaultNodes(): SceneGraph['nodes'] {
  const n = (id: string, label: string, kind: SceneGraph['nodes'][0]['kind'], x: number, y: number): SceneGraph['nodes'][0] => ({
    id, label, kind, x, y, status: 'idle', health: 1,
  });
  return [
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
  ];
}

// ── Store ──

export interface ExecutionStore {
  // ── Playback (F-10) ──
  isPlaying: boolean;
  playbackSpeed: number;        // 0.5 | 1 | 2 | 4
  currentTime: number;          // current position in seconds
  duration: number;             // total duration in seconds
  runId: string | null;

  // ── Mode (F-3) ──
  mode: ExecutionMode;

  // ── Scene graph (F-8) ──
  sceneGraph: SceneGraph;
  sceneEdges: SceneGraph['edges'];

  // ── Beams (F-7) ──
  beams: FuzzerBeam[];

  // ── Markers (F-4) ──
  markers: TimelineMarker[];

  // ── Camera (F-2/F-9) ──
  cameraTargetId: string | null;
  cameraTransitionMs: number;
  userPanning: boolean;          // true = grace period, no auto‑focus
  userPanDeadline: number;       // timestamp when auto‑focus resumes

  // ── Video (F-6) ──
  video: VideoState;
  recordingUrl: string | null;

  // ── Actions ──
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  seek: (time: number) => void;
  setRunId: (id: string | null) => void;
  setMode: (mode: ExecutionMode) => void;

  // Scene graph
  setSceneGraph: (g: SceneGraph) => void;

  // Beams
  upsertBeam: (snap: BeamSnapshot) => void;
  removeBeam: (beamId: string) => void;
  advanceBeams: (dtMs: number) => void;

  // Markers
  setMarkers: (markers: TimelineMarker[]) => void;

  // Camera
  setCameraTarget: (nodeId: string | null) => void;
  onUserPan: () => void;

  // Video
  setVideo: (v: Partial<VideoState>) => void;
  setRecordingUrl: (url: string) => void;
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  isPlaying: false,
  playbackSpeed: 1,
  currentTime: 0,
  duration: 120,
  runId: null,
  mode: 'battlefield' as ExecutionMode,
  sceneGraph: { nodes: defaultNodes(), edges: [], updated_at: '' },
  sceneEdges: [],
  beams: [],
  markers: [],
  cameraTargetId: null,
  cameraTransitionMs: 120,
  userPanning: false,
  userPanDeadline: 0,
  video: { source: 'placeholder' },
  recordingUrl: null,

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setSpeed: (speed) => set({ playbackSpeed: speed }),
  seek: (time) => set({ currentTime: Math.max(0, Math.min(time, get().duration)) }),
  setRunId: (id) => set({ runId: id }),
  setMode: (mode) => set({ mode }),

  setSceneGraph: (g) => set({ sceneGraph: g, sceneEdges: g.edges }),

  upsertBeam: (snap) =>
    set((s) => {
      const existing = s.beams.find((b) => b.id === snap.beamId);
      if (existing) {
        return {
          beams: s.beams.map((b) =>
            b.id === snap.beamId
              ? { ...b, status: snap.stage, progress: snap.progress, context: snap.context }
              : b,
          ),
        };
      }
      const now = Date.now();
      const newBeam: FuzzerBeam = {
        id: snap.beamId,
        sourceId: snap.sourceId,
        targetId: snap.targetId,
        status: snap.stage,
        progress: snap.progress,
        stageStartedMs: now,
        context: snap.context,
      };
      return { beams: [...s.beams, newBeam].slice(-20) };
    }),

  removeBeam: (beamId) =>
    set((s) => ({ beams: s.beams.filter((b) => b.id !== beamId) })),

  advanceBeams: (dtMs) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { advanceBeam } = require('./canvas/BeamEngine');
    set((s) => {
      let changed = false;
      const next = s.beams.map((b) => {
        const patch = advanceBeam(b, dtMs);
        if (Object.keys(patch).length === 0) return b;
        changed = true;
        return { ...b, ...patch };
      });
      return changed ? { beams: next } : {};
    });
  },

  setMarkers: (markers) => set({ markers }),
  setCameraTarget: (nodeId) => {
    const s = get();
    if (s.userPanning && Date.now() < s.userPanDeadline) return;
    set({ cameraTargetId: nodeId });
  },
  onUserPan: () =>
    set({ userPanning: true, userPanDeadline: Date.now() + 3000, cameraTargetId: null }),

  setVideo: (v) => set((s) => ({ video: { ...s.video, ...v } })),
  setRecordingUrl: (url) => set({ recordingUrl: url }),
}));