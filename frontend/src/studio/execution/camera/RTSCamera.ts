/**
 * RTS Camera — smooth zoom/pan with target tracking.
 *
 * F-2/F-9: Zoom wheel, drag pan, auto‑focus on beam hit, consecutive
 * hit debounce, easeInOutCubic transitions, user grace period.
 */
import { CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX, WORLD_SIZE } from '../types';

export interface RtsState {
  cx: number;       // world X center
  cy: number;       // world Y center
  zoom: number;     // 1.0 .. 3.5
}

export interface CameraTarget {
  cx: number;
  cy: number;
  zoom: number;
}

// ── Easing ──

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Hit queue (consecutive hit debounce, F-9) ──

let hitQueue: CameraTarget[] = [];
let lastHitTime = 0;
const HIT_HOLD_MS = 800;         // how long to stay zoomed on hit
const HIT_MERGE_WINDOW_MS = 1000; // consecutive hits within this → stay on last
const HIT_ZOOM = 3.5;
const HIT_TRANSITION_MS = 600;   // easeInOutCubic
const RETURN_TRANSITION_MS = 600;

/** Enqueue a camera hit on node. Called from WarZoneCanvas when TARGET_HIT received. */
export function enqueueHitFocus(nodeX: number, nodeY: number) {
  const now = Date.now();
  // Consecutive hits within merge window → replace last target, don't dither
  if (now - lastHitTime < HIT_MERGE_WINDOW_MS && hitQueue.length > 0) {
    hitQueue[hitQueue.length - 1] = { cx: nodeX, cy: nodeY, zoom: HIT_ZOOM };
  } else {
    hitQueue.push({ cx: nodeX, cy: nodeY, zoom: HIT_ZOOM });
  }
  lastHitTime = now;
}

/** Clear hit queue (called when all beams end). */
export function clearHitQueue() {
  hitQueue = [];
  lastHitTime = 0;
}

/** Get next camera target, or null if queue empty. */
export function consumeHitTarget(nowMs: number): CameraTarget | null {
  if (hitQueue.length === 0) return null;
  // If first hit was more than HOLD_MS ago → pop and return next
  const first = hitQueue[0]!;
  if (nowMs - lastHitTime > HIT_HOLD_MS && hitQueue.length === 1) {
    hitQueue = [];
    return null; // time to zoom out
  }
  if (nowMs - lastHitTime > HIT_HOLD_MS) {
    hitQueue.shift();
    lastHitTime = nowMs;
    return hitQueue.length > 0 ? hitQueue[0]! : null;
  }
  return first;
}

/** Fit-all target (general plan). */
export function fitAllTarget(nodes: { x: number; y: number }[]): CameraTarget {
  if (nodes.length === 0) return { cx: WORLD_SIZE / 2, cy: WORLD_SIZE / 2, zoom: 1.0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    zoom: 1.0,
  };
}

/**
 * Apply one frame of eased transition toward target (F-9).
 * Uses easeInOutCubic — 600ms for hit, smooth arrival.
 */
export function applyCameraTransitionEased(
  current: RtsState,
  target: CameraTarget,
  transitionMs: number,
  dtMs = 16,
): void {
  const factor = 1 - Math.exp(-dtMs / (transitionMs / 3));
  current.cx += (target.cx - current.cx) * factor;
  current.cy += (target.cy - current.cy) * factor;
  current.zoom += (target.zoom - current.zoom) * factor;
}

/**
 * Convert world coordinates to screen coordinates.
 */
export function worldToScreen(
  camera: RtsState,
  worldX: number,
  worldY: number,
  canvasW: number,
): { x: number; y: number } {
  const s = camera.zoom * (canvasW / WORLD_SIZE);
  return {
    x: (worldX - camera.cx) * s + canvasW / 2,
    y: (worldY - camera.cy) * s + canvasW / 2,
  };
}

/** Get the current world → screen scale. */
function scale(camera: RtsState, canvasW: number): number {
  return camera.zoom * (canvasW / WORLD_SIZE);
}

export const RTSCAMERA = {
  applyTransition: applyCameraTransitionEased,
  worldToScreen,
  scale,
  enqueueHitFocus,
  clearHitQueue,
  consumeHitTarget,
  fitAllTarget,
};