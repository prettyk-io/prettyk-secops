/**
 * BattlefieldView — F-3 mode 3: fullscreen war zone + hover HUD cards.
 */
import { useCallback, useRef, useState } from 'react';
import { WarZoneCanvas } from '../canvas/WarZoneCanvas';
import { useExecutionStore } from '../useExecutionStore';
import type { ExecutionStore } from '../useExecutionStore';
import type { HitEffect } from '../canvas/HitEffects';

interface BattlefieldViewProps {
  isLight: boolean;
  hitEffects: HitEffect[];
}

export function BattlefieldView({ isLight, hitEffects }: BattlefieldViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const graph = useExecutionStore((s) => s.sceneGraph);
  const nodes = graph.nodes;
  const hoveredNode = nodes.find((n) => n.id === hoveredId);

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setHoveredId(nodeId);
  }, []);

  return (
    <div className="flex-1 relative" style={{ background: '#070B14' }} ref={mapRef}>
      <WarZoneCanvas
        isLight={isLight}
        containerRef={mapRef}
        hitEffects={hitEffects}
        onNodeHover={handleNodeHover}
      />

      {/* HUD card on hover */}
      {hoveredNode && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, calc(-50% - 70px))',
          }}
        >
          <div
            className="px-3 py-2 rounded-md border border-cyan-500/30 text-xs"
            style={{
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 0 20px rgba(34, 211, 238, 0.15)',
            }}
          >
            <div className="font-semibold text-cyan-400 text-[11px] mb-1">{hoveredNode.label}</div>
            <div className="flex flex-col gap-0.5 text-[10px]">
              <span className="text-slate-400">
                Status: <span className="text-slate-200">{hoveredNode.status}</span>
              </span>
              <span className="text-slate-400">
                Health: <span className={hoveredNode.health > 0.6 ? 'text-green-400' : hoveredNode.health > 0.3 ? 'text-amber-400' : 'text-red-400'}>
                  {Math.round(hoveredNode.health * 100)}%
                </span>
              </span>
              <span className="text-slate-400">
                Type: <span className="text-slate-300">{hoveredNode.kind}</span>
              </span>
              {hoveredNode.anomalyScore !== undefined && (
                <span className="text-slate-400">
                  Anomaly: <span className={hoveredNode.anomalyScore > 0.7 ? 'text-red-400' : 'text-amber-400'}>
                    {(hoveredNode.anomalyScore * 100).toFixed(0)}%
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}