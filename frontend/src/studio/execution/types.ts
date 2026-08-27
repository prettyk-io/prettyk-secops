/**
 * Studio Execution Hub — domain types.
 * F-1..F-5 canonical event model.
 */

// ── Diary / SSE events ──

export type DiaryChannel = 'diary' | 'zap' | 'telemetry';

export type DiaryEventKind =
  | 'STEP' | 'NEXT' | 'LOG' | 'CONSOLE'
  | 'ERROR' | 'HIGH' | 'WARN' | 'WARNING' | 'FAIL' | 'FAILED'
  | 'GATE' | 'CI' | 'NOTE' | 'INFO' | 'SCAN' | 'FUZZ' | 'CUT' | 'ZAP';

export interface DiaryEvent {
  event_id: string;
  channel: DiaryChannel;
  kind: DiaryEventKind;
  text: string;
  pretty?: string;
  ts: number;               // unix seconds (float)
  run_id?: string;
}

// ── Battlefield nodes ──

export type NodeStatus = 'idle' | 'targeted' | 'penetrated' | 'shielded';

export interface BattleNode {
  id: string;
  label: string;
  kind: 'gateway' | 'microservice' | 'database' | 'api' | 'external';
  x: number;                  // world coords (normalised 0..WORLD_SIZE)
  y: number;
  status: NodeStatus;
  health: number;             // 0..1
  anomalyScore?: number;      // 0..1, from fuzzer
  highlight?: boolean;
}

// ── Fuzzer beams ──

export type BeamStatus = 'warmup' | 'active' | 'cooling' | 'dead';

export type BeamContext = 'normal' | 'critical';

export interface FuzzerBeam {
  id: string;
  sourceId: string;           // fuzzer node id
  targetId: string;           // target node id
  status: BeamStatus;
  progress: number;            // 0..1 within current stage
  /** Timestamp when this stage began (unix ms) */
  stageStartedMs: number;
  context: BeamContext;
  /** Configurable stage durations (ms) */
  warmupMs?: number;           // default 400
  coolingMs?: number;          // default 250
}

// ── Scene graph (F-8) ──

export type SceneNodeKind = 'page_model' | 'data_module' | 'fuzzer' | 'connector' | 'scenario' | 'auth_profile';
export type SceneNodeVisualStatus = 'idle' | 'active' | 'hit' | 'passed' | 'blocked';

export interface SceneNode {
  id: string;
  label: string;
  kind: SceneNodeKind;
  x: number;
  y: number;
  status: SceneNodeVisualStatus;
  health: number;              // 0..1
  anomalyScore?: number;
}

export interface SceneEdge {
  from: string;
  to: string;
  active: boolean;
}

export interface SceneGraph {
  nodes: SceneNode[];
  edges: SceneEdge[];
  updated_at: string;
}

// ── Execution snapshot (Boss B-7) ──

export interface BeamSnapshot {
  beamId: string;
  sourceId: string;
  targetId: string;
  stage: BeamStatus;
  progress: number;
  context: BeamContext;
}

// ── Video track (F-6) ──

export type VideoSource = 'novnc' | 'recording' | 'placeholder';

export interface VideoState {
  source: VideoSource;
  /** noVNC URL (Webswing) */
  novncUrl?: string;
  /** Recording .webm path */
  recordingUrl?: string;
  /** Timestamp when recording was finalized */
  finalizedAt?: number;
}

// ── Timeline markers ──

export type MarkerKind = 'step' | 'fuzz' | 'alert' | 'error';

export interface TimelineMarker {
  ts: number;                 // absolute seconds
  kind: MarkerKind;
  label: string;
  eventId?: string;
}

// ── Log entries ──

export interface LogEntry {
  id: string;
  ts: number;
  kind: DiaryEventKind;
  channel: 'system' | 'security';
  text: string;
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
}

// ── Camera ──

export interface CameraState {
  x: number;                  // center world x
  y: number;                  // center world y
  zoom: number;               // 1.0 .. 3.5
  targetX?: number;           // auto-focus target
  targetY?: number;
  targetZoom?: number;
  transitionMs: number;       // remaining transition time
}

// ── Execution mode ──

export type ExecutionMode = 'headquarters' | 'audit' | 'battlefield';

// ── World constants ──

export const WORLD_SIZE = 1000;
export const NODE_RADIUS = 28;
export const BEAM_CORE_WIDTH = 2;
export const BEAM_GLOW_WIDTH = 8.5;
export const BEAM_PULSE_HZ = 12;
export const BEAM_DIM_DURATION_MS = 250;
export const CAMERA_ZOOM_MIN = 1.0;
export const CAMERA_ZOOM_MAX = 3.5;
export const CAMERA_TRANSITION_MS = 120;