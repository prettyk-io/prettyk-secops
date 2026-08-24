/**
 * W3: Step Lantern LED — 4-state indicator for constructor slots.
 *
 * States (canon from Gemini Design System):
 *   queued    — grey outline, 0.3 opacity
 *   running   — cyan pulse #00F0FF, 1.0s breath
 *   success   — emerald #10B981, 2s flash → static
 *   warning   — amber #F59E0B breathing
 *   failure   — crimson #EF4444, 3x strobe → solid
 *   predicted — violet #A855F7 pre-light blink
 */
import { memo } from 'react';

export type StepLedState = 'queued' | 'running' | 'success' | 'warning' | 'failure' | 'predicted';

const S = 10;

const LED_COLORS: Record<StepLedState, string> = {
  queued: '#475569',
  running: '#00F0FF',
  success: '#10B981',
  warning: '#F59E0B',
  failure: '#EF4444',
  predicted: '#A855F7',
};

const LED_ANIMATIONS: Record<StepLedState, string> = {
  queued: 'none',
  running: 'pk-led-pulse-running 1.0s ease-in-out infinite',
  success: 'pk-led-flash-green 0.4s ease-out 5 forwards',
  warning: 'pk-led-breath-amber 2.0s ease-in-out infinite',
  failure: 'pk-led-strobe-red 0.3s ease-in-out 3 forwards',
  predicted: 'pk-led-prelight 1.5s ease-in-out infinite',
};

interface StepLanternLedProps {
  state: StepLedState;
  tooltip?: string;
  size?: number;
}

export const StepLanternLed = memo(function StepLanternLed({ state, tooltip, size }: StepLanternLedProps) {
  const s = size ?? S;
  const color = LED_COLORS[state];
  const anim = LED_ANIMATIONS[state];

  return (
    <span
      title={tooltip ?? state}
      className={state !== 'queued' ? `pk-led-state-${state}` : undefined}
      style={{
        display: 'inline-block',
        width: s,
        height: s,
        minWidth: s,
        borderRadius: '50%',
        backgroundColor: color,
        opacity: state === 'queued' ? 0.3 : 1,
        animation: anim,
        boxShadow: state === 'running'
          ? `0 0 ${s}px ${color}, 0 0 ${s * 2}px ${color}44`
          : state === 'predicted'
            ? `0 0 2px ${color}33`
            : 'none',
        transition: 'background-color 0.2s, box-shadow 0.2s',
      }}
      aria-label={state}
    />
  );
});