/**
 * War Zone Canvas — F-1/F-2/F-7/F-8/F-9 battle map renderer.
 *
 * Scene-graph nodes from /api/execution/scene-graph (poll).
 * Beams with channeling‑stage dim curves (warmup→active→cooling→dead).
 * RTS camera with zoom‑to‑hit, easeInOutCubic, user grace period.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { drawBackgroundGrid } from './BackgroundGrid';
import { drawSceneNode } from './SceneNodeRenderer';
import { drawBeam, type BeamDrawContext, beamOpacity, beamColor, advanceBeam } from './BeamEngine';
import { drawHitEffect, type HitEffect } from './HitEffects';
import { resolveTheme, type ThemeColors } from './colors';
import { useExecutionStore } from '../useExecutionStore';
import {
  RTSCAMERA, applyCameraTransitionEased,
  type RtsState, type CameraTarget, fitAllTarget, consumeHitTarget,
} from '../camera/RTSCamera';
import { useSceneGraph } from '../useSceneGraph';
import type { SceneGraph } from '../types';
import { WORLD_SIZE, NODE_RADIUS, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX } from '../types';

interface WarZoneCanvasProps {
  isLight: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  hitEffects: HitEffect[];
  onNodeHover?: (nodeId: string | null) => void;
}

export function WarZoneCanvas({ isLight, containerRef, hitEffects, onNodeHover }: WarZoneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rts = useRef<RtsState>({ cx: WORLD_SIZE / 2, cy: WORLD_SIZE / 2, zoom: 1.0 });
  const target = useRef<CameraTarget | null>(null);
  const rafRef = useRef(0);
  const dragRef = useRef({ down: false, sx: 0, sy: 0, ocx: 0, ocy: 0 });
  const lastBeamsLen = useRef(0);
  const prevBeamsLen = useRef(0);

  const beams = useExecutionStore((s) => s.beams);
  const cameraTargetId = useExecutionStore((s) => s.cameraTargetId);
  const onUserPan = useExecutionStore((s) => s.onUserPan);
  const upsertBeam = useExecutionStore((s) => s.upsertBeam);
  const sceneGraph = useSceneGraph();

  const nodes = sceneGraph.nodes;
  const [hovered, setHovered] = useState<string | null>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // ── Camera auto‑focus on beam hit ──
  useEffect(() => {
    // Detect new beam start (len increased → camera to target)
    if (beams.length > prevBeamsLen.current && beams.length > 0) {
      const latest = beams[beams.length - 1]!;
      const tgt = nodes.find((n) => n.id === latest.targetId);
      if (tgt) {
        RTSCAMERA.enqueueHitFocus(tgt.x, tgt.y);
      }
    }
    // Detect all beams ended → fit all (general plan)
    if (prevBeamsLen.current > 0 && beams.length === 0) {
      RTSCAMERA.clearHitQueue();
      target.current = fitAllTarget(nodes);
    }
    prevBeamsLen.current = beams.length;
  }, [beams.length, beams, nodes]);

  // ── Mouse handlers ──
  const getWorldNode = useCallback(
    (mx: number, my: number): string | null => {
      const w = canvasRef.current?.clientWidth ?? 800;
      const s = rts.current.zoom * (w / WORLD_SIZE);
      for (const node of nodes) {
        const sx = (node.x - rts.current.cx) * s + w / 2;
        const sy = (node.y - rts.current.cy) * s + w / 2;
        const dx = mx - sx;
        const dy = my - sy;
        if (dx * dx + dy * dy < (NODE_RADIUS * s) ** 2) return node.id;
      }
      return null;
    },
    [nodes],
  );

  // ── Draw loop ──
  const draw = useCallback((frameTime: number) => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const colors = resolveTheme(isLight);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }
    ctx.scale(dpr, dpr);

    // ── Camera transition ──
    const nowMs = performance.now();
    const hitTarget = consumeHitTarget(nowMs);
    const activeTarget = hitTarget ?? target.current;
    if (activeTarget) {
      applyCameraTransitionEased(rts.current, activeTarget, 600, 16);
      // Close enough → snap
      if (Math.abs(rts.current.cx - activeTarget.cx) < 0.3 &&
          Math.abs(rts.current.cy - activeTarget.cy) < 0.3 &&
          Math.abs(rts.current.zoom - activeTarget.zoom) < 0.005) {
        rts.current = { ...activeTarget };
        if (!hitTarget) target.current = null;
      }
    }

    const cam = rts.current;
    const scale = cam.zoom * (w / WORLD_SIZE);
    const offsetX = -cam.cx * scale + w / 2;
    const offsetY = -cam.cy * scale + h / 2;

    // 1. Grid
    drawBackgroundGrid(ctx, w, h, colors, cam.cx, cam.cy, cam.zoom, scale);

    // 2. Edges
    const edges = useExecutionStore.getState().sceneEdges;
    ctx.save();
    for (const edge of edges) {
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (fromNode && toNode) {
        const fx = fromNode.x * scale + offsetX;
        const fy = fromNode.y * scale + offsetY;
        const tx = toNode.x * scale + offsetX;
        const ty = toNode.y * scale + offsetY;
        ctx.strokeStyle = edge.active ? '#38bdf8' : '#1e293b';
        ctx.lineWidth = edge.active ? 1.5 * scale : 0.5 * scale;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 3. Beams (under nodes)
    ctx.save();
    for (const beam of beams) {
      const src = nodes.find((n) => n.id === beam.sourceId);
      const tgt = nodes.find((n) => n.id === beam.targetId);
      if (src && tgt) {
        drawBeam(beam, src.x, src.y, tgt.x, tgt.y, {
          ctx, colors, nowMs, scale, offsetX, offsetY,
        });
      }
    }
    ctx.restore();

    // 4. Nodes
    for (const node of nodes) {
      drawSceneNode(ctx, node, colors, scale, offsetX, offsetY, NODE_RADIUS);
    }

    // 5. Hit effects
    for (const effect of hitEffects) {
      const node = nodes.find((n) => n.id === effect.nodeId);
      if (node) {
        drawHitEffect(ctx, node, effect, colors, nowMs, scale, offsetX, offsetY, NODE_RADIUS);
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [isLight, nodes, beams, hitEffects, dpr]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Wheel zoom ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    const zoomFactor = 1 - e.deltaY * 0.002;
    const next = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, rts.current.zoom * zoomFactor));
    rts.current = { ...rts.current, zoom: next };
    target.current = null;
  }, []);

  // ── Pan ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { down: true, sx: e.clientX, sy: e.clientY, ocx: rts.current.cx, ocy: rts.current.cy };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.down) {
      const dx = e.clientX - dragRef.current.sx;
      const dy = e.clientY - dragRef.current.sy;
      const canvas = canvasRef.current;
      const w = canvas?.clientWidth ?? 800;
      const s = rts.current.zoom * (w / WORLD_SIZE);
      rts.current = { ...rts.current, cx: dragRef.current.ocx - dx / s, cy: dragRef.current.ocy - dy / s };
      target.current = null;
      onUserPan();
    } else {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const id = getWorldNode(e.clientX - rect.left, e.clientY - rect.top);
        if (id !== hovered) { setHovered(id); onNodeHover?.(id); }
      }
    }
  }, [getWorldNode, hovered, onNodeHover, onUserPan]);

  const onMouseUp = useCallback(() => { dragRef.current.down = false; }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 cursor-grab"
      style={{ width: '100%', height: '100%' }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    />
  );
}