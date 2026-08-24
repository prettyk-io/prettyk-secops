/**
 * W3: Node HUD Whisperer — 240×48px cyber-chip above active node.
 *
 * Glassmorphism, cyan→violet gradient border, two lines:
 *   Line 1: telemetry fact (JetBrains Mono 10px)
 *   Line 2: AI whisper (Inter 11px)
 * Click → opens Evidence Drawer.
 *
 * Canon geometry: top: -56px, left: 50%, translateX(-50%)
 */
import { memo } from 'react';

export interface HUDWhisperData {
  fact: string;
  whisper: string;
  nodeTitle: string;
}

interface NodeHudWhispererProps {
  data: HUDWhisperData | null;
  nodeCenterX: number;
  nodeCenterY: number;
  visible: boolean;
  onClick?: () => void;
}

const HUD_W = 240;
const HUD_H = 48;
const HUD_OFFSET_Y = 56;

export const NodeHudWhisperer = memo(function NodeHudWhisperer({
  data, nodeCenterX, nodeCenterY, visible, onClick,
}: NodeHudWhispererProps) {
  if (!data || !visible) return null;

  return (
    <div
      onClick={onClick}
      className="pk-hud-whisperer"
      style={{
        position: 'absolute',
        left: nodeCenterX - HUD_W / 2,
        top: nodeCenterY - HUD_OFFSET_Y - HUD_H,
        width: HUD_W,
        minHeight: HUD_H,
        background: 'rgba(10, 15, 30, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 8,
        border: '1px solid transparent',
        borderImage: 'linear-gradient(90deg, rgba(0,240,255,0.5), rgba(168,85,247,0.5)) 1',
        padding: '6px 10px',
        cursor: onClick ? 'pointer' : 'default',
        zIndex: 20,
        animation: 'pk-hud-enter 0.2s ease-out',
        transition: 'opacity 0.15s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        color: '#94A3B8',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {data.fact}
      </div>
      <div style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        color: '#F8FAFC',
        fontWeight: 500,
        marginTop: 2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {data.whisper}
      </div>
    </div>
  );
});